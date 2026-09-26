import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyQuote, normValue, canonical } from "../src/verify.js";

test("exact substring passes", () => {
  assert.equal(verifyQuote("no free tier", "Pricing: $29/mo, no free tier.").ok, true);
});

test("paraphrase fails", () => {
  assert.equal(verifyQuote("there is no free plan", "Pricing: $29/mo, no free tier.").ok, false);
});

test("curly quotes, dashes and whitespace runs are forgiven", () => {
  const text = "He said \u201Cwe\u2019ll ship   Tuesday\u201D \u2014 fine.";
  assert.equal(verifyQuote('"we\'ll ship Tuesday" - fine', text).ok, true);
});

test("case is forgiven, words are not", () => {
  assert.equal(verifyQuote("SHIP TUESDAY", "ship tuesday").ok, true);
  assert.equal(verifyQuote("ship on tuesday", "ship tuesday").ok, false);
});

test("empty quote fails", () => {
  assert.equal(verifyQuote("   ", "anything").ok, false);
});

test("normValue collapses money formats", () => {
  assert.equal(normValue("$29/mo"), "29");
  assert.equal(normValue("29 a month"), "29");
  assert.equal(normValue("$ 29"), "29");
  assert.notEqual(normValue("$49/mo"), normValue("$29/mo"));
});

test("canonical strips and lowercases", () => {
  assert.equal(canonical("  A\u00A0B  "), "a b");
});
