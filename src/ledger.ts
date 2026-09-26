import type {
  Comparator,
  ContextOptions,
  Contradiction,
  Draft,
  Entry,
  Extractor,
  IngestResult,
  LedgerOptions,
  Message,
  Receipt,
  Rejection,
} from "./types.js";
import { normValue, verifyQuote } from "./verify.js";
import { rank } from "./search.js";
import { cite, shortDate } from "./format.js";
import { estimateTokens } from "./tokens.js";

const REVERSAL_HINTS =
  /\b(actually|scratch that|scrap that|changed my mind|change of plan|on second thought|forget what i said|instead of|never mind|nevermind|reversing|reverse that|i was wrong|let'?s (?:switch|change|move) (?:to|it))\b/i;

interface Snapshot {
  version: 1;
  entries: Entry[];
  messages: Message[];
}

export class Ledger {
  private entries: Entry[] = [];
  private messages = new Map<string, Message>();
  private counter = 0;
  private readonly minQuote: number;
  private readonly comparator: Comparator | undefined;
  private readonly locale: string;
  private readonly idFor: NonNullable<LedgerOptions["idFor"]>;

  constructor(opts: LedgerOptions = {}) {
    this.minQuote = opts.minQuoteLength ?? 8;
    this.comparator = opts.comparator;
    this.locale = opts.locale ?? "en-US";
    this.idFor = opts.idFor ?? ((_d, _m, n) => `e${n}`);
  }

  // ---------------------------------------------------------------- ingest

  /**
   * Run the extractor on a message and file what it found.
   * Every draft is checked against the message text. Paraphrases are rejected, not stored.
   */
  async ingest(msg: Message, extractor: Extractor): Promise<IngestResult> {
    this.messages.set(msg.id, msg);
    const drafts = await extractor(msg);
    const out: IngestResult = { accepted: [], rejected: [], contradictions: [] };
    for (const draft of drafts) {
      const rej = this.reject(draft, msg);
      if (rej) {
        out.rejected.push(rej);
        continue;
      }
      const entry = this.file(draft, msg);
      out.accepted.push(entry);
      const c = await this.checkContradiction(entry);
      if (c) out.contradictions.push(c);
    }
    return out;
  }

  /** File a draft you already trust (still verified against the message). */
  assert(draft: Draft, msg: Message): Entry {
    this.messages.set(msg.id, msg);
    const rej = this.reject(draft, msg);
    if (rej) throw new Error(`quoteback: ${rej.reason}${rej.detail ? ` (${rej.detail})` : ""}`);
    return this.file(draft, msg);
  }

  private reject(draft: Draft, msg: Message): Rejection | null {
    if (!draft.key || !draft.value || !draft.quote || !draft.kind)
      return { draft, reason: "missing-field" };
    if (draft.quote.trim().length < this.minQuote)
      return { draft, reason: "quote-too-short", detail: `min ${this.minQuote} chars` };
    if (!verifyQuote(draft.quote, msg.text).ok)
      return { draft, reason: "quote-not-verbatim", detail: `not found in message ${msg.id}` };
    return null;
  }

  private file(draft: Draft, msg: Message): Entry {
    this.counter += 1;
    const entry: Entry = {
      ...draft,
      id: this.idFor(draft, msg, this.counter),
      messageId: msg.id,
      speaker: msg.speaker,
      at: msg.at,
      status: "active",
    };
    if (draft.reversal === undefined && REVERSAL_HINTS.test(msg.text)) entry.reversal = true;
    this.entries.push(entry);
    return entry;
  }

  // --------------------------------------------------------- contradictions

  private async checkContradiction(current: Entry): Promise<Contradiction | null> {
    const previous = this.entries
      .filter((e) => e.key === current.key && e.status === "active" && e.id !== current.id)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!previous) return null;

    const same = normValue(previous.value) === normValue(current.value);
    let how: Contradiction["how"] = "deterministic";
    let conflict = !same;
    if (this.comparator) {
      const verdict = await this.comparator(previous, current);
      if (verdict === "unrelated") return null;
      conflict = verdict === "contradiction";
      how = "comparator";
    }
    if (!conflict) {
      // Same position restated. Keep the newest as the active one, chain the older.
      previous.status = "superseded";
      previous.supersededBy = current.id;
      current.supersedes = previous.id;
      return null;
    }
    const acknowledged = current.reversal === true;
    if (acknowledged) {
      // A conscious reversal is a decision, not a contradiction to be surfaced later.
      previous.status = "superseded";
      previous.supersededBy = current.id;
      current.supersedes = previous.id;
      current.reason = "acknowledged reversal";
    }
    return { key: current.key, previous, current, how, acknowledged };
  }

  /** Unresolved contradictions: two active entries on the same key with different values. */
  conflicts(): Contradiction[] {
    const byKey = new Map<string, Entry[]>();
    for (const e of this.entries) {
      if (e.status !== "active") continue;
      const list = byKey.get(e.key) ?? [];
      list.push(e);
      byKey.set(e.key, list);
    }
    const out: Contradiction[] = [];
    for (const [key, list] of byKey) {
      if (list.length < 2) continue;
      const sorted = list.sort((a, b) => a.at.localeCompare(b.at));
      const current = sorted[sorted.length - 1]!;
      for (const previous of sorted.slice(0, -1)) {
        if (normValue(previous.value) !== normValue(current.value))
          out.push({ key, previous, current, how: "deterministic", acknowledged: false });
      }
    }
    return out;
  }

  /** Resolve a contradiction on purpose. The old entry is kept, marked superseded, with the reason. */
  supersede(currentId: string, previousId: string, reason = "conscious reversal"): void {
    const cur = this.get(currentId);
    const prev = this.get(previousId);
    if (!cur || !prev) throw new Error("quoteback: unknown entry id");
    prev.status = "superseded";
    prev.supersededBy = cur.id;
    cur.supersedes = prev.id;
    cur.reason = reason;
  }

  withdraw(id: string, reason = "withdrawn"): void {
    const e = this.get(id);
    if (!e) throw new Error("quoteback: unknown entry id");
    e.status = "withdrawn";
    e.reason = reason;
  }

  // ------------------------------------------------------------------ read

  get(id: string): Entry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  all(): Entry[] {
    return [...this.entries];
  }

  active(kind?: Entry["kind"]): Entry[] {
    return this.entries.filter((e) => e.status === "active" && (!kind || e.kind === kind));
  }

  /** The full history of one key, oldest first, including superseded entries. */
  history(key: string): Entry[] {
    return this.entries.filter((e) => e.key === key).sort((a, b) => a.at.localeCompare(b.at));
  }

  message(id: string): Message | undefined {
    return this.messages.get(id);
  }

  recall(query: string, opts: { limit?: number; includeSuperseded?: boolean } = {}): Receipt[] {
    const pool = opts.includeSuperseded ? this.entries : this.active();
    return rank(pool, query)
      .slice(0, opts.limit ?? 5)
      .map(({ entry, score }) => ({ entry, score, cite: cite(entry, this.locale) }));
  }

  /** Active commitments due on or before `now` (+ `withinDays`), oldest due first. */
  due(now: string | Date = new Date(), withinDays = 0): Entry[] {
    const limit = new Date(now).getTime() + withinDays * 86_400_000;
    return this.active("commitment")
      .filter((e) => e.due && new Date(e.due).getTime() <= limit)
      .sort((a, b) => a.due!.localeCompare(b.due!));
  }

  /**
   * A token-budgeted block to put in front of an agent. Priority order:
   * unresolved contradictions, overdue commitments, entries relevant to `query`, then recent decisions.
   */
  context(opts: ContextOptions = {}): string {
    const budget = opts.budget ?? 600;
    const now = opts.now ?? new Date().toISOString();
    const lines: string[] = [`## ${opts.title ?? "Receipts"}`];
    const used = new Set<string>();
    let spent = estimateTokens(lines[0]!);

    const push = (s: string): boolean => {
      const cost = estimateTokens(s);
      if (spent + cost > budget) return false;
      lines.push(s);
      spent += cost;
      return true;
    };

    const conflicts = this.conflicts();
    if (conflicts.length) {
      push("Unresolved contradictions:");
      for (const c of conflicts) {
        used.add(c.previous.id);
        used.add(c.current.id);
        if (!push(`- ${c.key}: ${cite(c.previous, this.locale)} vs ${cite(c.current, this.locale)}`)) break;
      }
    }

    const overdue = this.due(now);
    if (overdue.length) {
      push("Overdue commitments:");
      for (const e of overdue) {
        used.add(e.id);
        if (!push(`- due ${shortDate(e.due!, this.locale)}: ${cite(e, this.locale)}`)) break;
      }
    }

    if (opts.query) {
      const hits = this.recall(opts.query, { limit: 6 }).filter((r) => !used.has(r.entry.id));
      if (hits.length) {
        push("Relevant:");
        for (const r of hits) {
          used.add(r.entry.id);
          if (!push(`- ${r.entry.key} = ${r.entry.value}. ${r.cite}`)) break;
        }
      }
    }

    const recent = this.active()
      .filter((e) => !used.has(e.id))
      .sort((a, b) => b.at.localeCompare(a.at));
    if (recent.length) {
      push("Standing decisions and commitments:");
      for (const e of recent) {
        if (!push(`- ${e.key} = ${e.value}. ${cite(e, this.locale)}`)) break;
      }
    }
    return lines.join("\n");
  }

  // ------------------------------------------------------------ persistence

  toJSON(): Snapshot {
    return { version: 1, entries: [...this.entries], messages: [...this.messages.values()] };
  }

  static fromJSON(snap: Snapshot, opts: LedgerOptions = {}): Ledger {
    const l = new Ledger(opts);
    l.entries = snap.entries.map((e) => ({ ...e }));
    for (const m of snap.messages) l.messages.set(m.id, m);
    l.counter = snap.entries.length;
    return l;
  }
}
