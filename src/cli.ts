#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Ledger } from "./ledger.js";
import { rulesExtractor } from "./extract/rules.js";
import { cite, describe } from "./format.js";
import type { Message } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

function usage(): never {
  console.log(`quoteback

  quoteback demo                 run the built-in transcript
  quoteback check <file.jsonl>   ingest a transcript with the default rules
      --now <ISO>                treat this as "now" for due checks

Transcript lines: {"id","speaker","at","text"}`);
  process.exit(1);
}

async function readTranscript(path: string): Promise<Message[]> {
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Message);
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

const [cmd, ...rest] = process.argv.slice(2);
const nowIdx = rest.indexOf("--now");
const now = nowIdx !== -1 && rest[nowIdx + 1] ? rest[nowIdx + 1]! : new Date().toISOString();

if (cmd === "demo") {
  const demoPath = join(here, "..", "examples", "demo-transcript.jsonl");
  const messages = await readTranscript(demoPath);
  await run(messages, nowIdx !== -1 ? now : "2026-03-17T09:00:00Z");
} else if (cmd === "check" && rest[0] && !rest[0].startsWith("--")) {
  await run(await readTranscript(rest[0]), now);
} else {
  usage();
}
