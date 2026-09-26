#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Ledger } from "./ledger.js";
import { rulesExtractor } from "./extract/rules.js";
import { cite, describe } from "./format.js";
import type { Message } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

const USAGE = `quoteback

  quoteback demo                 run the built-in transcript
  quoteback check <file.jsonl>   ingest a transcript with the default rules
      --now <ISO>                treat this as "now" for due checks
  quoteback --help               show this message
  quoteback --version            print the version

Transcript lines: {"id","speaker","at","text"}`;

class CliError extends Error {}

function isMessage(v: unknown): v is Message {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return ["id", "speaker", "at", "text"].every((k) => typeof o[k] === "string");
}

async function readTranscript(path: string): Promise<Message[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new CliError(code === "ENOENT" ? `file not found: ${path}` : `cannot read ${path}: ${(err as Error).message}`);
  }
  const messages: Message[] = [];
  const lines = raw.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new CliError(`${path}:${i + 1}: invalid JSON`);
    }
    if (!isMessage(parsed)) throw new CliError(`${path}:${i + 1}: expected {"id","speaker","at","text"} as strings`);
    messages.push(parsed);
  }
  return messages;
}

async function run(messages: Message[], now: string): Promise<void> {
  const ledger = new Ledger();
  const extract = rulesExtractor();
  for (const msg of messages) {
    const r = await ledger.ingest(msg, extract);
    const stamp = new Date(msg.at).toISOString().slice(0, 10);
    console.log(`\n${stamp}  ${msg.speaker}: ${msg.text}`);
    for (const e of r.accepted) console.log(`   + ${e.kind} ${e.key} = ${e.value}   "${e.quote}"`);
    for (const j of r.rejected) console.log(`   x rejected (${j.reason}) "${j.draft.quote}"`);
    for (const c of r.contradictions) {
      const tag = c.acknowledged ? "reversal, acknowledged" : "CONTRADICTION";
      console.log(`   ! ${tag} on ${c.key}: was "${c.previous.value}", now "${c.current.value}"`);
      console.log(`     receipt: ${cite(c.previous)}`);
    }
  }

  console.log("\n--- unresolved contradictions ---");
  const conflicts = ledger.conflicts();
  if (!conflicts.length) console.log("none");
  for (const c of conflicts) console.log(`${c.key}\n  then: ${cite(c.previous)}\n  now:  ${cite(c.current)}`);

  console.log(`\n--- overdue as of ${now.slice(0, 10)} ---`);
  const overdue = ledger.due(now);
  if (!overdue.length) console.log("none");
  for (const e of overdue) console.log(describe(e));

  console.log("\n--- context block an agent would get ---\n");
  console.log(ledger.context({ now, budget: 500, query: "pricing discount" }));
}

async function version(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

function parseNow(value: string | undefined): string {
  if (!value || Number.isNaN(new Date(value).getTime())) throw new CliError(`--now expects an ISO date, got: ${value ?? "nothing"}`);
  return value;
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(USAGE);
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(await version());
    return;
  }
  const nowIdx = rest.indexOf("--now");
  const now = nowIdx !== -1 ? parseNow(rest[nowIdx + 1]) : undefined;

  if (cmd === "demo") {
    const demoPath = join(here, "..", "examples", "demo-transcript.jsonl");
    await run(await readTranscript(demoPath), now ?? "2026-03-17T09:00:00Z");
    return;
  }
  if (cmd === "check" && rest[0] && !rest[0].startsWith("--")) {
    await run(await readTranscript(rest[0]), now ?? new Date().toISOString());
    return;
  }
  console.error(USAGE);
  process.exitCode = 1;
}

try {
  await main(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof CliError)) throw err;
  console.error(`quoteback: ${err.message}`);
  process.exitCode = 1;
}
