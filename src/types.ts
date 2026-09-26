/** A message in a conversation. `text` is the only thing quotes are verified against. */
export interface Message {
  id: string;
  speaker: string;
  text: string;
  /** ISO 8601 */
  at: string;
}

export type Kind = "decision" | "commitment" | "stance" | "fact";

/** What an extractor returns for one message. Not yet in the ledger. */
export interface Draft {
  kind: Kind;
  /** Stable topic id, e.g. "pricing.monthly" or "launch.date". Contradictions are detected per key. */
  key: string;
  /** Normalised value, e.g. "29", "tuesday", "no-discounts". */
  value: string;
  /** Must be a verbatim substring of the message text. */
  quote: string;
  /** ISO 8601, commitments only. */
  due?: string;
  /** Set when the message itself acknowledges a change ("actually", "changed my mind"). */
  reversal?: boolean;
}

export type Status = "active" | "superseded" | "withdrawn";

export interface Entry extends Draft {
  id: string;
  messageId: string;
  speaker: string;
  at: string;
  status: Status;
  supersededBy?: string;
  /** Set on the entry that superseded another, so the chain can be walked. */
  supersedes?: string;
  reason?: string;
}

export interface Rejection {
  draft: Draft;
  reason: "quote-not-verbatim" | "quote-too-short" | "missing-field";
  detail?: string;
}

export interface Contradiction {
  key: string;
  previous: Entry;
  current: Entry;
  /** deterministic = values differ after normalisation; comparator = an external comparator said so */
  how: "deterministic" | "comparator";
  /** true when the new message acknowledged the change. A conscious reversal, not a gotcha. */
  acknowledged: boolean;
}

export interface IngestResult {
  accepted: Entry[];
  rejected: Rejection[];
  contradictions: Contradiction[];
}

export type Extractor = (msg: Message) => Draft[] | Promise<Draft[]>;

/** Optional fuzzy comparator for values the deterministic check can't judge. */
export type Comparator = (
  previous: Entry,
  current: Entry
) => "same" | "contradiction" | "unrelated" | Promise<"same" | "contradiction" | "unrelated">;

export interface Receipt {
  entry: Entry;
  score: number;
  /** One line you can drop into a prompt: `Mar 3, 2026 · founder: "..."` */
  cite: string;
}

export interface LedgerOptions {
  /** Minimum quote length in characters. Default 8. */
  minQuoteLength?: number;
  comparator?: Comparator;
  /** Used when rendering citations. Default "en-US". */
  locale?: string;
  /** Id generator, mostly for deterministic tests. */
  idFor?: (draft: Draft, msg: Message, n: number) => string;
}

export interface ContextOptions {
  /** Rough token budget for the rendered block. Default 600. */
  budget?: number;
  /** ISO 8601 "now" for due checks. Default: new Date(). */
  now?: string;
  /** If given, relevant recalled entries are included. */
  query?: string;
  /** Heading for the block. */
  title?: string;
}
