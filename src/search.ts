/** Small BM25 over entries. No deps, no index to maintain; rebuilt per query, which is fine below ~50k entries. */
import type { Entry } from "./types.js";

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function textOf(e: Entry): string {
  return `${e.key.replace(/[._:-]/g, " ")} ${e.value} ${e.quote}`;
}

export function rank(entries: Entry[], query: string, k1 = 1.2, b = 0.75): Array<{ entry: Entry; score: number }> {
  const q = tokens(query);
  if (!q.length || !entries.length) return [];
  const docs = entries.map((e) => tokens(textOf(e)));
  const N = docs.length;
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / N;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

  return entries
    .map((entry, i) => {
      const d = docs[i]!;
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const n = df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgdl)));
      }
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score);
}
