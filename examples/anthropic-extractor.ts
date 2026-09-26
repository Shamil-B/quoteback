// Example: an LLM-backed extractor using the Anthropic API over plain fetch.
// quoteback verifies every quote the model returns against the message text,
// so a paraphrased "quote" is rejected instead of stored.
import { Ledger, llmExtractor } from "quoteback";

const ledger = new Ledger();

const extract = llmExtractor(
  async (prompt) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return data.content.find((c) => c.type === "text")?.text ?? "[]";
  },
  { knownKeys: () => [...new Set(ledger.active().map((e) => e.key))] }
);

const result = await ledger.ingest(
  { id: "m1", speaker: "founder", at: new Date().toISOString(), text: "We're going with $29 a month and no free tier. I'll have the pricing page up by Friday." },
  extract
);

console.log(result.accepted.map((e) => `${e.key}=${e.value} "${e.quote}"`));
console.log(result.rejected); // anything the model paraphrased lands here, not in the ledger
console.log(ledger.context({ budget: 400 }));
