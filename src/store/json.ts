import { readFile, writeFile } from "node:fs/promises";
import { Ledger } from "../ledger.js";
import type { LedgerOptions } from "../types.js";

export async function saveJSON(ledger: Ledger, path: string): Promise<void> {
  await writeFile(path, JSON.stringify(ledger.toJSON(), null, 2), "utf8");
}

export async function loadJSON(path: string, opts: LedgerOptions = {}): Promise<Ledger> {
  const raw = await readFile(path, "utf8");
  return Ledger.fromJSON(JSON.parse(raw), opts);
}
