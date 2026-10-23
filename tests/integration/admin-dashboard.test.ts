import { randomUUID, createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { executeAdminCommand, adminOverview, adminUsers, adminTrips, adminPayments, adminAi, adminSupport, adminHealth, adminAnnouncements, adminActivity, activeAnnouncements } from "@/server/admin/operations";
import { reserveAiUsage, captureAiUsage, finishAiUsage } from "@/server/admin/ai-usage";
import { createTrialInvitation, acceptTrialInvitation, listCompanyTrials } from "@/server/admin/trials";
import { getTripPlan } from "@/server/plans/access";
import { requireTrip } from "@/server/auth/permissions";
import { receivePaddleWebhook } from "@/server/billing/webhook";
import { submitSupport } from "@/server/support/service";
import { makeTrip, makeUser, resetDb } from "./helpers";
const runtime = currentRuntime();
const price = `pri_${"1".repeat(26)}`, transactionId = `txn_${"2".repeat(26)}`;
const paddle = { environment: "live" as const, apiKey: "isolated-not-real", clientToken: `live_${"x".repeat(27)}`, webhookSecret: "test-only-secret", checkoutEnabled: true, prices: {1500:price} };
beforeEach(async () => { await resetDb(); setTestRuntime({...runtime,planAccessEnabled:true,companyAdminEmail:"admin@example.test",appUrl:"https://tripanize.example.test",paddle}); });
afterEach(() => { setTestRuntime(runtime); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function fixture() {
  const admin = await makeUser("Administrator","admin@example.test");
  const user = await makeUser("Traveler","traveler@example.test");
  await prisma.user.updateMany({where:{id:{in:[admin.id,user.id]}},data:{emailVerified:true}});
  return {admin,user};
}
it("guards every admin data surface and mutation with the verified configured identity", async () => {
  const {admin,user}=await fixture();
  const reads=[()=>adminOverview(user.id),()=>adminUsers(user.id,"",0),()=>adminTrips(user.id,"",0),()=>adminPayments(user.id,0),()=>adminAi(user.id),()=>adminSupport(user.id,0),()=>adminHealth(user.id),()=>adminAnnouncements(user.id),()=>adminActivity(user.id,0)];
  for(const read of reads) await expect(read()).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(executeAdminCommand(user.id,{op:"health.wake"})).rejects.toMatchObject({code:"FORBIDDEN"});
  await prisma.user.update({where:{id:admin.id},data:{emailVerified:false}});
  await expect(adminOverview(admin.id)).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(await prisma.adminAudit.count()).toBe(0);
});
it("suspends access, ends sessions, clears location, preserves purchases and blocks self-suspension", async () => {
  const {admin,user}=await fixture(); const tripId=await makeTrip(user.id);
  const membership=await prisma.tripMembership.findUniqueOrThrow({where:{tripId_userId:{tripId,userId:user.id}}});
  await prisma.session.create({data:{id:randomUUID(),token:randomUUID(),userId:user.id,expiresAt:new Date(Date.now()+86400000)}});
  await prisma.memberLocation.create({data:{membershipId:membership.id,version:1,lat:10,lng:20,expiresAt:new Date(Date.now()+60000)}});
  await prisma.premiumCheckout.create({data:{tripId,buyerId:user.id,environment:"live",priceId:price,amountMinor:1500,targetCapacity:0,status:"COMPLETED"}});
  await executeAdminCommand(admin.id,{op:"user.suspend",id:user.id,suspended:true,reason:"Account review"});
  await expect(requireTrip(tripId,user.id)).rejects.toMatchObject({code:"NOT_FOUND"});
  expect(await prisma.session.count({where:{userId:user.id}})).toBe(0);
  expect(await prisma.memberLocation.findUnique({where:{membershipId:membership.id}})).toMatchObject({lat:null,lng:null,expiresAt:null,version:2});
  expect((await getTripPlan(tripId)).premium).toBe(true);
  await expect(executeAdminCommand(admin.id,{op:"user.suspend",id:admin.id,suspended:true,reason:""})).rejects.toMatchObject({code:"FORBIDDEN"});
  await executeAdminCommand(admin.id,{op:"user.suspend",id:user.id,suspended:false,reason:""});
  expect((await requireTrip(tripId,user.id)).role).toBe("OWNER");
  expect(await prisma.session.count({where:{userId:user.id}})).toBe(0);
  expect((await adminActivity(admin.id,0)).rows.map(r=>r.action)).toEqual(expect.arrayContaining(["user.suspended","user.restored"]));
});
it("reports searchable user and trip metadata without granting trip membership", async () => {
  const {admin,user}=await fixture(); const tripId=await makeTrip(user.id);
  await prisma.user.update({where:{id:user.id},data:{lastSeenAt:new Date()}});
  expect((await adminUsers(admin.id,"traveler@",0)).rows).toHaveLength(1);
  expect((await adminTrips(admin.id,"Lisbon",0)).rows[0]).toMatchObject({id:tripId,plan:"Normal",owner:{email:user.email}});
  await expect(requireTrip(tripId,admin.id)).rejects.toMatchObject({code:"NOT_FOUND"});
  expect(await adminOverview(admin.id)).toMatchObject({users:2,activeUsers:1,trips:1,salesMinor:0,openSupport:0});
});
it("expires trials in the access helper, permits expiry edits and keeps paid access after expiry", async () => {
  const {admin,user}=await fixture(); const inv=await createTrialInvitation(admin.id,user.email,7);
  const {tripId}=await acceptTrialInvitation(user.id,{invitationId:inv.id,name:"Trial trip"});
  expect(await getTripPlan(tripId)).toMatchObject({premium:true,source:"trial"});
  const saved=await prisma.trialInvitation.findUniqueOrThrow({where:{id:inv.id}});
  expect(saved.trialEndsAt!.getTime()-saved.acceptedAt!.getTime()).toBeGreaterThan(6.99*86400000);
  const endsAt=new Date(Date.now()+30*86400000).toISOString();
  await executeAdminCommand(admin.id,{op:"trial.expiry",id:inv.id,endsAt});
  expect((await prisma.trialInvitation.findUniqueOrThrow({where:{id:inv.id}})).trialEndsAt?.toISOString()).toBe(endsAt);
  await prisma.trialInvitation.update({where:{id:inv.id},data:{trialEndsAt:new Date(Date.now()-1000)}});
  expect((await getTripPlan(tripId)).premium).toBe(false);
  await prisma.premiumCheckout.create({data:{tripId,buyerId:user.id,environment:"live",priceId:price,amountMinor:1500,targetCapacity:0,status:"COMPLETED"}});
  expect((await getTripPlan(tripId)).source).toBe("purchase");
  expect((await listCompanyTrials(admin.id))[0]).toMatchObject({status:"Expired trial",converted:true});
});
it("publishes only in the chosen announcement window, rejects stale changes, and supports withdrawal", async () => {
  const {admin}=await fixture();
  await executeAdminCommand(admin.id,{op:"announcement.create",title:"Update",message:"<script>plain text</script>",tone:"info",startsAt:new Date(Date.now()-10000).toISOString(),endsAt:new Date(Date.now()+100000).toISOString()});
  const a=(await adminAnnouncements(admin.id))[0]; expect(await activeAnnouncements()).toEqual([]);
  await executeAdminCommand(admin.id,{op:"announcement.status",id:a.id,version:1,status:"PUBLISHED"});
  expect((await activeAnnouncements())[0].message).toBe("<script>plain text</script>");
  expect(await activeAnnouncements(new Date(Date.now()+200000))).toEqual([]);
  await expect(executeAdminCommand(admin.id,{op:"announcement.status",id:a.id,version:1,status:"ARCHIVED"})).rejects.toMatchObject({code:"CONFLICT"});
  await executeAdminCommand(admin.id,{op:"announcement.status",id:a.id,version:2,status:"DRAFT"});
  expect(await activeAnnouncements()).toEqual([]);
});
const settings={op:"ai.settings" as const,aiPaused:false,aiDailyLimit:3,aiUserDailyLimit:1,pricingModel:"example-model",inputUsdPerMillion:2,outputUsdPerMillion:8,searchUsdPerThousand:10};
it("meters provider tokens, distinguishes unpriced calls, and enforces atomic daily and suspension controls", async () => {
  const {admin,user}=await fixture();
  await executeAdminCommand(admin.id,settings);
  const row=await reserveAiUsage("trip_plan","example-model",{userId:user.id});
  await captureAiUsage(row.id,{model:"example-model-2026",usage:{input_tokens:1000,output_tokens:500},output:[{type:"web_search_call"}]});
  await finishAiUsage(row.id,"SUCCEEDED");
  expect(await prisma.aiUsage.findUnique({where:{id:row.id}})).toMatchObject({status:"SUCCEEDED",inputTokens:1000,outputTokens:500,searchCalls:1,estimatedCostMicros:16000});
  await expect(reserveAiUsage("trip_plan","example-model",{userId:user.id})).rejects.toMatchObject({code:"RATE_LIMITED"});
  const other=await reserveAiUsage("events","other-model"); await captureAiUsage(other.id,{model:"other-model",usage:{input_tokens:20,output_tokens:10},output:[]});
  expect((await prisma.aiUsage.findUniqueOrThrow({where:{id:other.id}})).estimatedCostMicros).toBeNull();
  expect((await adminAi(admin.id)).unknownCosts).toBe(1);
  await executeAdminCommand(admin.id,{...settings,aiPaused:true});
  await expect(reserveAiUsage("events","example-model")).rejects.toMatchObject({code:"NOT_CONFIGURED"});
});
it("retains support submissions and deduplicates exact retries while recording status and private notes", async () => {
  const {admin}=await fixture(); setTestRuntime({...currentRuntime(),supportEmail:"support@example.test"});
  vi.stubEnv("RESEND_API_KEY","isolated-key"); vi.stubEnv("SMTP_URL",""); vi.stubGlobal("fetch",vi.fn(async()=>Response.json({id:"fixture"})));
  const data={name:"Traveler",email:"traveler@example.test",topic:"billing",message:"Please help with my purchase.",website:"",requestId:randomUUID()};
  await submitSupport(data,"192.0.2.1"); await submitSupport(data,"192.0.2.1");
  const rows=(await adminSupport(admin.id,0)).rows; expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({deliveryStatus:"sent",message:data.message,status:"OPEN"});
  await executeAdminCommand(admin.id,{op:"support.update",id:rows[0].id,status:"RESOLVED",note:"Reviewed in Paddle"});
  expect((await adminSupport(admin.id,0)).rows[0]).toMatchObject({status:"RESOLVED",note:"Reviewed in Paddle"});
  expect(vi.mocked(fetch).mock.calls).toHaveLength(2); // No customer email is sent by updating a ticket.
});
it("refreshes only a saved current-environment transaction and records provider fees without a charge", async () => {
  const {admin,user}=await fixture(); const tripId=await makeTrip(user.id);
  const p=await prisma.premiumCheckout.create({data:{tripId,buyerId:user.id,environment:"live",priceId:price,amountMinor:1500,targetCapacity:0,status:"PENDING",transactionId}});
  const data={id:transactionId,status:"completed",currency_code:"USD",subscription_id:null,discount_id:null,custom_data:{checkoutId:p.id,tripId,environment:"live"},items:[{quantity:1,price:{id:price,billing_cycle:null,unit_price:{amount:"1500",currency_code:"USD"}}}],details:{totals:{subtotal:"1500",discount:"0",total:"1500",tax:"0"},payout_totals:{currency_code:"USD",fee:"125",earnings:"1375"}},adjustments:[]};
  const fn=vi.fn(async (_url:unknown,options?:RequestInit)=>{expect(options?.method).toBe("GET"); return Response.json({data});}); vi.stubGlobal("fetch",fn);
  await executeAdminCommand(admin.id,{op:"payment.sync",id:p.id});
  expect((await adminPayments(admin.id,0)).rows[0]).toMatchObject({status:"COMPLETED",paddleSummary:{payout:{fee:"125",earnings:"1375"}}});
  expect((await getTripPlan(tripId)).source).toBe("purchase");
  await expect(executeAdminCommand(admin.id,{op:"payment.sync",id:"unrelated"})).rejects.toMatchObject({code:"NOT_FOUND"}); expect(fn).toHaveBeenCalledTimes(1);
  const raw=JSON.stringify({event_id:"evt_test",event_type:"transaction.completed",data:{id:transactionId}}); const ts=Math.floor(Date.now()/1000); const signature=`ts=${ts};h1=${createHmac("sha256",paddle.webhookSecret).update(`${ts}:${raw}`).digest("hex")}`;
  await receivePaddleWebhook(raw,signature); await receivePaddleWebhook(raw,signature);
  expect((await adminHealth(admin.id)).webhooks[0]).toMatchObject({status:"PROCESSED",responseStatus:200,attempts:2});
  await expect(receivePaddleWebhook(raw,"invalid")).rejects.toMatchObject({code:"UNAUTHENTICATED"}); expect(await prisma.billingDelivery.count()).toBe(1);
});
it("validates commands before writes and keeps the audit log free of support message content", async () => {
  const {admin}=await fixture();
  for(const command of [{...settings,aiDailyLimit:-1},{op:"announcement.create",title:"",message:"text",tone:"info",startsAt:"invalid",endsAt:null},{op:"user.suspend",id:"missing",suspended:true,reason:"x",makeAdmin:true}]) await expect(executeAdminCommand(admin.id,command)).rejects.toMatchObject({code:"VALIDATION"});
  expect(await prisma.adminAudit.count()).toBe(0);
});
