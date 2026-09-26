# quoteback

Memory for AI agents that quotes you back.

A small ledger for the things people say that should stick: decisions, commitments, stances, facts. Every entry carries a verbatim quote from the message it came from, and the library refuses to store anything it can't find in the original text. When a new position contradicts an old one, you get both, with dates.

```
2026-03-03  founder: Halcyon wants an annual deal. Give them 30% off, it's a big logo.
   ! CONTRADICTION on discounts: was "none", now "yes"
     receipt: Jan 12, 2026 · founder: "And we never discount"
```

Zero dependencies. Node 18+. TypeScript.

```
npm i quoteback
npx quoteback demo
```

## Why

I built a product where four AI executives argue with a founder across months. The first memory layer I wrote summarised conversations. Summaries drift. The agent would "remember" a decision the user never made, phrased confidently, and the user couldn't check it. That's worse than no memory.

The fix was boring: store the exact words, verify they're real, and show them. This is that layer, pulled out on its own so it can sit under any agent.

Three rules:

1. A quote has to be a substring of the message it was extracted from. Not a paraphrase. The ledger checks, every time, no matter what the extractor claims.
2. Contradictions are detected per topic key and surfaced with both receipts. Nothing is silently overwritten.
3. A conscious reversal ("actually, let's do $49") supersedes the old entry without drama. An unacknowledged flip stays open until someone resolves it.

## Use

```ts
import { Ledger, rulesExtractor } from "quoteback";

const ledger = new Ledger();
const extract = rulesExtractor(); // regex rules, no model. See below for LLM extraction.

await ledger.ingest(
  { id: "m1", speaker: "founder", at: "2026-01-12T09:00:00Z", text: "$29/mo, no free tier. We never discount." },
  extract
);

const r = await ledger.ingest(
  { id: "m2", speaker: "founder", at: "2026-03-03T16:00:00Z", text: "Give them 30% off, it's a big logo." },
  extract
);

r.contradictions[0].previous.quote; // "We never discount"
r.contradictions[0].previous.at;    // "2026-01-12T09:00:00Z"

ledger.conflicts();                    // still open until you resolve it
const { current, previous } = r.contradictions[0];
ledger.supersede(current.id, previous.id, "annual deals are the exception"); // resolve on purpose
```

Put receipts in front of the agent:

```ts
const block = ledger.context({ budget: 600, query: "pricing", now: new Date().toISOString() });
// ## Receipts
// Unresolved contradictions:
// - discounts: Jan 12, 2026 · founder: "We never discount" vs Mar 3, 2026 · founder: "Give them 30% off, ..."
// Overdue commitments:
// - due Jan 23, 2026: Jan 20, 2026 · founder: "I'll write the launch note by Friday"
// ...
```

Budgeted in rough tokens. Priority order: open contradictions, overdue commitments, entries relevant to the query, then recent standing decisions.

Other reads:

```ts
ledger.recall("which database did we pick");  // BM25 over key/value/quote, returns { entry, score, cite }
ledger.due(now, 3);                           // active commitments due within 3 days
ledger.history("pricing.monthly");            // full chain incl. superseded entries
ledger.active("decision");
```

Persistence is a JSON snapshot. Swap in your own store by serialising `ledger.toJSON()`.

```ts
import { saveJSON, loadJSON } from "quoteback";
await saveJSON(ledger, "./memory.json");
const again = await loadJSON("./memory.json");
```

## Extraction with a model

The rules extractor is for tests and narrow domains. For real conversations you want a model doing the extraction, and you want to not trust it. `llmExtractor` takes any `(prompt) => Promise<string>`, builds a prompt that asks for character-for-character quotes, parses the JSON, and hands the drafts to the ledger, which verifies each quote against the message. Paraphrases come back in `rejected`, not in memory.

```ts
import { Ledger, llmExtractor } from "quoteback";

const extract = llmExtractor(async (prompt) => {
  const res = await client.messages.create({ model, max_tokens: 800, messages: [{ role: "user", content: prompt }] });
  return res.content[0].text;
}, { knownKeys: () => [...new Set(ledger.active().map((e) => e.key))] });
```

Full example with plain `fetch` against the Anthropic API: [`examples/anthropic-extractor.ts`](examples/anthropic-extractor.ts).

Verification is forgiving about whitespace runs, curly vs straight quotes, dash variants and case. It is strict about words. `verifyQuote("ship on tuesday", "ship tuesday")` fails.

## Comparator hook

The deterministic check normalises values (`$29/mo`, `29 a month` and `$ 29` all compare as `29`). For anything fuzzier, pass a comparator. It runs only when two active entries share a key, so it's cheap to make it a model call.

```ts
const ledger = new Ledger({
  comparator: async (previous, current) => askModel(previous, current), // "same" | "contradiction" | "unrelated"
});
```

## Data model

```ts
interface Entry {
  id: string;
  kind: "decision" | "commitment" | "stance" | "fact";
  key: string;        // topic id, contradictions are per key
  value: string;      // normalised position
  quote: string;      // verbatim, verified
  messageId: string;
  speaker: string;
  at: string;         // ISO
  due?: string;       // commitments
  status: "active" | "superseded" | "withdrawn";
  supersededBy?: string;
  supersedes?: string;
  reason?: string;
  reversal?: boolean; // the message acknowledged the change
}
```

## CLI

```
quoteback demo
quoteback check transcript.jsonl --now 2026-03-17T00:00:00Z
```

`transcript.jsonl` is one `{"id","speaker","at","text"}` per line.

## What it doesn't do

Vector search, cross-session summarisation, entity resolution, anything with a network call. It's a ledger with a verifier. Put it under the thing you already have.

## Tests

```
npm test
```

24 tests on `node:test`. Covers verbatim enforcement, contradiction detection, acknowledged reversals, supersede chains, recall ranking, due dates, context budgeting and JSON round trips.

MIT.
