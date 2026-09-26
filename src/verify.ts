/**
 * Verbatim-quote verification.
 *
 * The one rule this library exists to enforce: an entry's quote must be a
 * substring of the message it was extracted from. LLM extractors paraphrase
 * constantly, and a paraphrase presented as a quote is how "memory" turns into
 * gaslighting. So we check, and we're a little forgiving about the things
 * humans never notice (whitespace runs, curly vs straight quotes, dash
 * variants) and strict about everything else.
 */

const QUOTE_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u201F": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u00A0": " ",
};

export function canonical(s: string): string {
  let out = "";
  for (const ch of s) out += QUOTE_MAP[ch] ?? ch;
  return out.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface VerifyResult {
  ok: boolean;
  /** Offsets into the canonical form of the text, when found. */
  start?: number;
  end?: number;
}

export function verifyQuote(quote: string, text: string): VerifyResult {
  const q = canonical(quote);
  if (!q) return { ok: false };
  const t = canonical(text);
  const i = t.indexOf(q);
  if (i === -1) return { ok: false };
  return { ok: true, start: i, end: i + q.length };
}

/** Normalise a value for deterministic comparison. */
export function normValue(v: string): string {
  const c = canonical(v);
  // "$29/mo", "29 dollars", "$ 29" -> "29"
  const money = c.match(/^\$?\s*(\d+(?:\.\d+)?)\s*(?:\/|per|a)?\s*(?:mo|month|monthly)?$/);
  if (money && money[1]) return money[1];
  return c
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[.!?]+$/, "")
    .replace(/[^\p{L}\p{N}\s.:/-]/gu, "")
    .trim();
}
