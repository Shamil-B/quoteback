import type { Entry } from "./types.js";

export function shortDate(iso: string, locale = "en-US"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

/** `Jan 12, 2026 · founder: "we will never discount"` */
export function cite(e: Entry, locale = "en-US"): string {
  return `${shortDate(e.at, locale)} \u00B7 ${e.speaker}: "${e.quote}"`;
}

export function describe(e: Entry, locale = "en-US"): string {
  const due = e.due ? ` (due ${shortDate(e.due, locale)})` : "";
  return `[${e.kind}] ${e.key} = ${e.value}${due}\n  ${cite(e, locale)}`;
}
