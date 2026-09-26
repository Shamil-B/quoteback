/**
 * Helpers for building an LLM-backed extractor with any provider.
 * quoteback doesn't ship an SDK. You bring a `complete(prompt) => string`
 * function; this file gives you the prompt and a strict parser.
 *
 * The prompt asks for verbatim quotes. The ledger checks anyway. That second
 * check is the whole point: models paraphrase, and a paraphrase presented as
 * a quote is worse than no memory at all.
 */
import type { Draft, Extractor, Kind, Message } from "../types.js";

const KINDS: Kind[] = ["decision", "commitment", "stance", "fact"];

export function extractionPrompt(msg: Message, knownKeys: string[] = []): string {
  const keys = knownKeys.length ? `Known keys so far (reuse when the topic matches): ${knownKeys.join(", ")}` : "";
  return `You extract durable positions from one message in a conversation.

Return ONLY a JSON array. Each item: {"kind": "decision"|"commitment"|"stance"|"fact", "key": string, "value": string, "quote": string, "due"?: ISO-8601, "reversal"?: boolean}

Rules:
- "quote" MUST be copied character-for-character from the message. No paraphrase, no ellipsis, no added words. If you can't find an exact span, skip the item.
- "key" is a short stable topic id like "pricing.monthly" or "launch.date". Same topic, same key, every time.
- "value" is the normalised position: "29", "tuesday", "none", "postgres".
- "commitment" items are promises with a deadline; put the deadline in "due".
- Set "reversal": true only if the message itself acknowledges changing a previous position.
- Skip small talk. Empty array is a fine answer.
${keys}

Message (speaker: ${msg.speaker}, at: ${msg.at}):
<<<
${msg.text}
>>>`;
}

export function parseDrafts(raw: string): Draft[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: Draft[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!KINDS.includes(o.kind as Kind)) continue;
    if (typeof o.key !== "string" || typeof o.value !== "string" || typeof o.quote !== "string") continue;
    const d: Draft = { kind: o.kind as Kind, key: o.key, value: o.value, quote: o.quote };
    if (typeof o.due === "string") d.due = o.due;
    if (o.reversal === true) d.reversal = true;
    out.push(d);
  }
  return out;
}

/**
 * Wrap any completion function into an Extractor.
 *
 *   const extract = llmExtractor(async (prompt) => {
 *     const r = await client.messages.create({ model, max_tokens: 800, messages: [{ role: "user", content: prompt }] });
 *     return r.content[0].text;
 *   });
 */
export function llmExtractor(
  complete: (prompt: string) => Promise<string>,
  opts: { knownKeys?: () => string[] } = {}
): Extractor {
  return async (msg: Message) => parseDrafts(await complete(extractionPrompt(msg, opts.knownKeys?.() ?? [])));
}
