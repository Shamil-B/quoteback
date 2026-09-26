/**
 * A rule-based extractor. No model, no network. Good for tests, demos, and
 * the kind of narrow domains where you already know the topics.
 *
 * Each rule is a key plus a regex with one capture group for the value. The
 * quote is the whole regex match, so it's verbatim by construction.
 */
import type { Draft, Extractor, Kind, Message } from "../types.js";

export interface Rule {
  key: string;
  kind: Kind;
  pattern: RegExp;
  /** Turn the capture into a stable value. Default: lowercase trim. */
  value?: (capture: string, match: RegExpMatchArray) => string;
  /** For commitments: derive a due date from the capture and the message time. */
  due?: (capture: string, msg: Message) => string | undefined;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Next occurrence of a weekday after `from`, as ISO. "tomorrow" and "today" also work. */
export function dueFromWord(word: string, from: string): string | undefined {
  const w = word.toLowerCase();
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return undefined;
  if (w === "today") return d.toISOString();
  if (w === "tomorrow") return new Date(d.getTime() + 86_400_000).toISOString();
  if (w === "end of week" || w === "eow") {
    const add = (5 - d.getUTCDay() + 7) % 7 || 7;
    return new Date(d.getTime() + add * 86_400_000).toISOString();
  }
  const i = DAYS.indexOf(w);
  if (i === -1) return undefined;
  const add = (i - d.getUTCDay() + 7) % 7 || 7;
  return new Date(d.getTime() + add * 86_400_000).toISOString();
}

const WHEN = "(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|end of week)";

/** Rules that cover common founder-speak. Extend or replace them. */
export const defaultRules: Rule[] = [
  {
    key: "pricing.monthly",
    kind: "decision",
    pattern: /\$\s?(\d+(?:\.\d+)?)\s?(?:\/|per|a)\s?(?:mo|month)\b/i,
  },
  {
    key: "launch.date",
    kind: "decision",
    pattern: new RegExp(`\\b(?:ship|launch|go live|release)\\w*\\s+(?:it\\s+)?(?:on|by|this)?\\s*${WHEN}\\b`, "i"),
  },
  {
    key: "discounts",
    kind: "stance",
    pattern: /\b(no discounts?|never discount\w*|give (?:them|him|her) \d+% off|(\d+)% off)\b/i,
    value: (c) => (/\bno\b|never/i.test(c) ? "none" : "yes"),
  },
  {
    key: "free-tier",
    kind: "stance",
    pattern: /\b(no free tier|free tier|freemium|card up front|card required)\b/i,
    value: (c) => (/^no\b|card/i.test(c) ? "none" : "yes"),
  },
  {
    key: "database",
    kind: "decision",
    pattern: /\b(?:use|using|go with|going with|switch(?:ing)? to|move to|on)\s+(postgres(?:ql)?|mysql|sqlite|mongo(?:db)?|supabase|planetscale|dynamodb)\b/i,
  },
  {
    key: "commitment",
    kind: "commitment",
    pattern: new RegExp(`\\bI(?:'ll| will)\\s+([^.,;]{3,60}?)\\s+by\\s+${WHEN}\\b`, "i"),
    value: (c) => c.toLowerCase().trim(),
  },
];

export function rulesExtractor(rules: Rule[] = defaultRules): Extractor {
  return (msg: Message): Draft[] => {
    const drafts: Draft[] = [];
    for (const rule of rules) {
      const m = msg.text.match(rule.pattern);
      if (!m) continue;
      const capture = m[1] ?? m[0];
      const value = rule.value ? rule.value(capture, m) : capture.toLowerCase().trim();
      const draft: Draft = { kind: rule.kind, key: rule.key, value, quote: expandQuote(msg.text, m) };
      if (rule.kind === "commitment") {
        // key per commitment so two different promises don't "contradict" each other
        draft.key = `commitment:${slug(value)}`;
        const whenMatch = m[0].match(new RegExp(`by\\s+${WHEN}\\s*$`, "i"));
        const when = whenMatch?.[1];
        const due = rule.due?.(capture, msg) ?? (when ? dueFromWord(when, msg.at) : undefined);
        if (due) draft.due = due;
      }
      drafts.push(draft);
    }
    return drafts;
  };
}

/** Short matches make bad receipts. Widen to the sentence the match sits in; still verbatim. */
export function expandQuote(text: string, m: RegExpMatchArray, minLen = 24): string {
  const hit = m[0];
  if (hit.length >= minLen || m.index === undefined) return hit;
  const boundary = /[.!?\n]/;
  let start = m.index;
  while (start > 0 && !boundary.test(text[start - 1]!)) start -= 1;
  let end = m.index + hit.length;
  while (end < text.length && !boundary.test(text[end]!)) end += 1;
  return text.slice(start, end).trim();
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
