import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDrafts, extractionPrompt } from "../src/extract/llm.js";
import { rulesExtractor, dueFromWord } from "../src/extract/rules.js";

test("parseDrafts tolerates fences and drops junk", () => {
  const raw = '```json\n[{"kind":"decision","key":"a","value":"b","quote":"c d e"},{"kind":"nope","key":"a","value":"b","quote":"x"},{"kind":"commitment","key":"k","value":"v","quote":"q","due":"2026-01-01T00:00:00Z","reversal":true}]\n```';
  const d = parseDrafts(raw);
  assert.equal(d.length, 2);
  assert.equal(d[1]!.due, "2026-01-01T00:00:00Z");
  assert.equal(d[1]!.reversal, true);
});

test("parseDrafts returns [] on garbage", () => {
  assert.deepEqual(parseDrafts("I could not find anything."), []);
  assert.deepEqual(parseDrafts("{not json"), []);
});

test("prompt includes the message and known keys", () => {
  const p = extractionPrompt({ id: "m", speaker: "s", at: "2026-01-01T00:00:00Z", text: "hello there" }, ["pricing.monthly"]);
  assert.match(p, /hello there/);
  assert.match(p, /pricing\.monthly/);
  assert.match(p, /character-for-character/);
});

test("rules extractor quotes are verbatim by construction", async () => {
  const text = "Pricing is settled. $29/mo, card up front, no free tier. And we never discount.";
  const drafts = await rulesExtractor()({ id: "m", speaker: "s", at: "2026-01-12T00:00:00Z", text });
  assert.ok(drafts.length >= 3);
  for (const d of drafts) assert.ok(text.includes(d.quote), d.quote);
  assert.equal(drafts.find((d) => d.key === "pricing.monthly")!.value, "29");
  assert.equal(drafts.find((d) => d.key === "discounts")!.value, "none");
  assert.equal(drafts.find((d) => d.key === "free-tier")!.value, "none");
});

test("dueFromWord finds the next weekday", () => {
  assert.equal(dueFromWord("friday", "2026-01-20T14:00:00Z")!.slice(0, 10), "2026-01-23"); // Tue -> Fri
  assert.equal(dueFromWord("tuesday", "2026-01-20T14:00:00Z")!.slice(0, 10), "2026-01-27"); // Tue -> next Tue
  assert.equal(dueFromWord("tomorrow", "2026-01-20T14:00:00Z")!.slice(0, 10), "2026-01-21");
  assert.equal(dueFromWord("someday", "2026-01-20T14:00:00Z"), undefined);
});
