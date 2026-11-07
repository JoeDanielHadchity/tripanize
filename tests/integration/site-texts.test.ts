import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { adminSiteTexts, getSiteTexts, saveSiteTexts } from "@/server/admin/texts";
import { publicMobileHome } from "@/server/mobile/public";
import { SITE_TEXTS } from "@/lib/site-texts";
import { makeUser, resetDb, adminAuthenticationFixture } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, companyAdminEmail: "admin@example.test" }); });
afterEach(() => setTestRuntime(runtime));

async function admin() {
  const a = await makeUser("Administrator", "admin@example.test");
  await prisma.user.update({ where: { id: a.id }, data: { emailVerified: true } });
  await adminAuthenticationFixture(a.id);
  return a;
}

it("uses the default wording until something is changed", async () => {
  const t = await getSiteTexts();
  expect(t["web.home.title1"]).toBe(SITE_TEXTS["web.home.title1"].text);
  expect((await publicMobileHome()).texts?.["app.home.explore.title"]).toBe("Explore Tripanize");
  expect(Object.keys((await publicMobileHome()).texts ?? {}).every(k => k.startsWith("app."))).toBe(true);
});

it("saves, shows and restores wording on the website and in the app", async () => {
  const a = await admin();
  await saveSiteTexts(a.id, { changes: { "web.home.title1": "  Go further.  ", "app.home.premium.title": "One price per trip." } });
  expect((await getSiteTexts())["web.home.title1"]).toBe("Go further.");
  expect((await publicMobileHome()).texts?.["app.home.premium.title"]).toBe("One price per trip.");
  expect((await adminSiteTexts(a.id)).changed.sort()).toEqual(["app.home.premium.title", "web.home.title1"]);

  // Empty, null or the default text all restore the default.
  await saveSiteTexts(a.id, { changes: { "web.home.title1": "", "app.home.premium.title": null } });
  expect(await prisma.siteText.count()).toBe(0);
  await saveSiteTexts(a.id, { changes: { "web.home.cta": SITE_TEXTS["web.home.cta"].text } });
  expect(await prisma.siteText.count()).toBe(0);
  expect(await prisma.adminAudit.count({ where: { action: "texts.save" } })).toBe(3);
});

it("rejects unknown keys and non-administrators", async () => {
  const a = await admin();
  const user = await makeUser("Traveler");
  await expect(saveSiteTexts(a.id, { changes: { "web.unknown": "x" } })).rejects.toThrow();
  await expect(saveSiteTexts(user.id, { changes: { "web.home.cta": "Hi" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(adminSiteTexts(user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
