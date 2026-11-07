import { z } from "zod";
import { prisma } from "@/server/db";
import { SITE_TEXTS, SITE_TEXT_MAX, withDefaults, type SiteTextKey, type SiteTexts } from "@/lib/site-texts";
import { requireCompanyAdmin } from "./identity";
import { adminAudit } from "./audit";

const KEYS = Object.keys(SITE_TEXTS) as SiteTextKey[];

/** Public: current wording (saved changes over the defaults). Never fails a page:
 * if the table cannot be read, the defaults are used. */
export async function getSiteTexts(): Promise<SiteTexts> {
  const rows = await prisma.siteText.findMany({ where: { key: { in: KEYS } } }).catch(() => []);
  return withDefaults(Object.fromEntries(rows.map(r => [r.key, r.value])));
}

/** The app only needs its own keys. */
export async function getAppTexts(): Promise<Partial<SiteTexts>> {
  const all = await getSiteTexts();
  return Object.fromEntries(KEYS.filter(k => k.startsWith("app.")).map(k => [k, all[k]]));
}

export async function adminSiteTexts(actorId: string) {
  await requireCompanyAdmin(actorId);
  const rows = await prisma.siteText.findMany({ where: { key: { in: KEYS } } });
  return { texts: withDefaults(Object.fromEntries(rows.map(r => [r.key, r.value]))), changed: rows.map(r => r.key) as SiteTextKey[] };
}

export const siteTextsInput = z.object({
  changes: z.record(z.string(), z.string().max(SITE_TEXT_MAX).nullable()).refine(c => Object.keys(c).every(k => (KEYS as string[]).includes(k)), "Unknown text.").refine(c => Object.keys(c).length <= KEYS.length),
}).strict();

/** Saves changed wording. A null value, or the default text, restores the default. */
export async function saveSiteTexts(actorId: string, input: unknown) {
  await requireCompanyAdmin(actorId);
  const { changes } = siteTextsInput.parse(input);
  const keys = Object.keys(changes) as SiteTextKey[];
  for (const key of keys) {
    const value = changes[key]?.replace(/\r\n/g, "\n").trim() ?? null;
    if (value === null || value === "" || value === SITE_TEXTS[key].text) await prisma.siteText.deleteMany({ where: { key } });
    else await prisma.siteText.upsert({ where: { key }, create: { key, value, updatedById: actorId }, update: { value, updatedById: actorId } });
  }
  if (keys.length) await adminAudit(actorId, "texts.save", "site_text", keys.length === 1 ? keys[0] : `${keys.length} texts`, { keys });
}
