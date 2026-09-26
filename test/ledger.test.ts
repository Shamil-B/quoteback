import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger.js";
import { rulesExtractor } from "../src/extract/rules.js";
import type { Draft, Message } from "../src/types.js";

const msg = (id: string, at: string, text: string): Message => ({ id, speaker: "founder", at, text });

test("ingest files verbatim drafts and rejects paraphrases", async () => {
  const l = new Ledger();
  const m = msg("m1", "2026-01-12T09:00:00Z", "We never discount. Discounts train people to wait.");
  const r = await l.ingest(m, () => [
    { kind: "stance", key: "discounts", value: "none", quote: "We never discount" },
    { kind: "stance", key: "discounts", value: "none", quote: "We do not do discounts" },
  ]);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0]!.reason, "quote-not-verbatim");
  assert.equal(l.active().length, 1);
});

test("short quotes are rejected", async () => {
  const l = new Ledger({ minQuoteLength: 8 });
  const r = await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "ok fine yes"), () => [
    { kind: "fact", key: "x", value: "y", quote: "ok fine" },
  ]);
  assert.equal(r.rejected[0]!.reason, "quote-too-short");
});

test("assert throws on paraphrase", () => {
  const l = new Ledger();
  assert.throws(() =>
    l.assert({ kind: "fact", key: "k", value: "v", quote: "not in there at all" }, msg("m1", "2026-01-01T00:00:00Z", "something else entirely"))
  );
});

test("same key, different value, no acknowledgement = contradiction with receipt", async () => {
  const l = new Ledger();
  await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "We never discount."), () => [
    { kind: "stance", key: "discounts", value: "none", quote: "We never discount." },
  ]);
  const r = await l.ingest(msg("m2", "2026-03-03T09:00:00Z", "Give them 30% off, big logo."), () => [
    { kind: "stance", key: "discounts", value: "yes", quote: "Give them 30% off" },
  ]);
  assert.equal(r.contradictions.length, 1);
  const c = r.contradictions[0]!;
  assert.equal(c.acknowledged, false);
  assert.equal(c.previous.quote, "We never discount.");
  assert.equal(c.previous.at, "2026-01-12T09:00:00Z");
  // both stay active until someone resolves it
  assert.equal(l.conflicts().length, 1);
  assert.equal(l.history("discounts").length, 2);
});

test("an acknowledged reversal supersedes quietly", async () => {
  const l = new Ledger();
  await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "$29/mo, card up front."), rulesExtractor());
  const r = await l.ingest(msg("m2", "2026-03-10T09:00:00Z", "Actually, let's move new signups to $49/mo."), rulesExtractor());
  const c = r.contradictions.find((x) => x.key === "pricing.monthly")!;
  assert.ok(c);
  assert.equal(c.acknowledged, true);
  assert.equal(c.previous.status, "superseded");
  assert.equal(l.conflicts().length, 0);
  assert.equal(l.active("decision").find((e) => e.key === "pricing.monthly")!.value, "49");
});

test("restating the same position is not a contradiction", async () => {
  const l = new Ledger();
  const d = (q: string): Draft => ({ kind: "decision", key: "pricing.monthly", value: "$29/mo", quote: q });
  await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "It's $29/mo."), () => [d("It's $29/mo.")]);
  const r = await l.ingest(msg("m2", "2026-02-12T09:00:00Z", "Still $29 a month, as agreed."), () => [
    { kind: "decision", key: "pricing.monthly", value: "29 a month", quote: "Still $29 a month" },
  ]);
  assert.equal(r.contradictions.length, 0);
  assert.equal(l.active().length, 1);
  assert.equal(l.history("pricing.monthly")[0]!.status, "superseded");
});

test("supersede resolves a conflict on purpose and keeps the old entry", async () => {
  const l = new Ledger({ idFor: (_d, _m, n) => `e${n}` });
  await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "no free tier"), () => [
    { kind: "stance", key: "free-tier", value: "none", quote: "no free tier" },
  ]);
  await l.ingest(msg("m2", "2026-02-12T09:00:00Z", "add a free tier for students"), () => [
    { kind: "stance", key: "free-tier", value: "students", quote: "add a free tier for students" },
  ]);
  assert.equal(l.conflicts().length, 1);
  l.supersede("e2", "e1", "students only, discussed in the Feb all-hands");
  assert.equal(l.conflicts().length, 0);
  assert.equal(l.get("e1")!.status, "superseded");
  assert.equal(l.get("e1")!.supersededBy, "e2");
  assert.equal(l.get("e2")!.reason, "students only, discussed in the Feb all-hands");
});

test("comparator can override the deterministic check", async () => {
  const l = new Ledger({ comparator: () => "same" });
  await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "ship on tuesday"), () => [
    { kind: "decision", key: "launch.date", value: "tuesday", quote: "ship on tuesday" },
  ]);
  const r = await l.ingest(msg("m2", "2026-01-13T09:00:00Z", "ship on the 20th"), () => [
    { kind: "decision", key: "launch.date", value: "2026-01-20", quote: "ship on the 20th" },
  ]);
  assert.equal(r.contradictions.length, 0);
  assert.equal(l.active().length, 1);
});

test("recall ranks by relevance and returns a citation line", async () => {
  const l = new Ledger();
  await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "Going with postgres for the ledger."), rulesExtractor());
  await l.ingest(msg("m2", "2026-01-13T09:00:00Z", "$29/mo, card up front."), rulesExtractor());
  const hits = l.recall("which database");
  assert.equal(hits[0]!.entry.key, "database");
  assert.match(hits[0]!.cite, /Jan 12, 2026 .* founder: "/);
});

test("commitments get a due date and show up as overdue", async () => {
  const l = new Ledger();
  // 2026-01-20 is a Tuesday; "by Friday" -> 2026-01-23
  const r = await l.ingest(msg("m1", "2026-01-20T14:00:00Z", "I'll write the launch note by Friday."), rulesExtractor());
  const c = r.accepted.find((e) => e.kind === "commitment")!;
  assert.ok(c);
  assert.equal(c.due!.slice(0, 10), "2026-01-23");
  assert.equal(l.due("2026-01-22T00:00:00Z").length, 0);
  assert.equal(l.due("2026-01-24T00:00:00Z").length, 1);
});

test("context respects the token budget and leads with conflicts", async () => {
  const l = new Ledger();
  for (let i = 0; i < 40; i++) {
    await l.ingest(msg(`m${i}`, `2026-01-${String((i % 28) + 1).padStart(2, "0")}T09:00:00Z`, `fact number ${i} is quite long and detailed`), () => [
      { kind: "fact", key: `fact.${i}`, value: String(i), quote: `fact number ${i} is quite long and detailed` },
    ]);
  }
  await l.ingest(msg("c1", "2026-02-01T09:00:00Z", "We never discount."), () => [
    { kind: "stance", key: "discounts", value: "none", quote: "We never discount." },
  ]);
  await l.ingest(msg("c2", "2026-03-01T09:00:00Z", "Give them 30% off."), () => [
    { kind: "stance", key: "discounts", value: "yes", quote: "Give them 30% off." },
  ]);
  const block = l.context({ budget: 150, now: "2026-03-05T00:00:00Z" });
  assert.match(block, /Unresolved contradictions/);
  assert.match(block, /We never discount/);
  assert.ok(block.length < 150 * 4.5, `too long: ${block.length}`);
});

test("JSON round trip keeps everything", async () => {
  const l = new Ledger();
  await l.ingest(msg("m1", "2026-01-12T09:00:00Z", "$29/mo, no free tier."), rulesExtractor());
  const copy = Ledger.fromJSON(JSON.parse(JSON.stringify(l.toJSON())));
  assert.deepEqual(copy.all(), l.all());
  assert.equal(copy.message("m1")!.text, "$29/mo, no free tier.");
});
