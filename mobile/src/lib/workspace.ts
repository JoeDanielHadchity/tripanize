import type { MobileField, MobileTarget, MobileValue, MobileValues } from "../../../src/lib/mobile-workspace";
export type { MobileWorkspace, MobileBlock, MobileField, MobileTarget, MobileAction, MobileValue, MobileValues, MobileCommandResult } from "../../../src/lib/mobile-workspace";
/** Keep workspace views out of Expo Router's reserved `screen` parameter. */
export function workspaceHref({ screen, ...params }: MobileTarget, refresh?: string) {
  return { pathname: "/workspace" as const, params: { ...params, view: screen, ...(refresh ? { refresh } : {}) } };
}
export function workspacePath(to: MobileTarget) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(to)) if (value) q.set(key, value);
  return `/api/mobile/workspace?${q}`;
}
export function getValue(values: MobileValues, key: string): MobileValue | undefined {
  let value: MobileValue | undefined = values;
  for (const part of key.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = Array.isArray(value) ? value[Number(part)] : value[part];
  }
  return value;
}
export function setValue(values: MobileValues, key: string, value: MobileValue): MobileValues {
  const copy = JSON.parse(JSON.stringify(values)) as MobileValues;
  const parts = key.split(".");
  if (parts.some(p => ["__proto__", "prototype", "constructor"].includes(p))) return values;
  let target: Record<string, MobileValue> | MobileValue[] = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]; const current: MobileValue = Array.isArray(target) ? target[Number(part)] : target[part];
    if (!current || typeof current !== "object") {
      const next: MobileValue = /^\d+$/.test(parts[i + 1]) ? [] : {};
      if (Array.isArray(target)) target[Number(part)] = next; else target[part] = next;
    }
    target = (Array.isArray(target) ? target[Number(part)] : target[part]) as Record<string, MobileValue> | MobileValue[];
  }
  if (Array.isArray(target)) target[Number(parts.at(-1)!)] = value; else target[parts.at(-1)!] = value;
  return copy;
}
export function formDefaults(fields: MobileField[], base: MobileValues = {}): MobileValues {
  let values: MobileValues = { ...base };
  for (const f of fields) if (getValue(values, f.key) === undefined) values = setValue(values, f.key, f.value ?? (f.kind === "check" ? false : ["multi", "repeat", "list", "files"].includes(f.kind ?? "") ? [] : f.kind === "number" ? null : ""));
  return values;
}
export function cleanValues(values: MobileValues): MobileValues {
  const result = { ...values };
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value) && value.every(v => typeof v === "string")) result[key] = value.map(v => (v as string).trim()).filter(Boolean);
    if (["currency", "defaultCurrency"].includes(key) && typeof value === "string") result[key] = value.trim().toUpperCase();
  }
  delete result.files;
  for (const key of ["dayId", "bookingId", "travelerId", "assigneeId", "email", "optionId", "endsAt", "pricingModel"]) if (result[key] === "") result[key] = null;
  const conversion = result.conversion;
  if (conversion && typeof conversion === "object" && !Array.isArray(conversion) && !conversion.currency && !conversion.rate && !conversion.rateDate) result.conversion = null;
  return result;
}
