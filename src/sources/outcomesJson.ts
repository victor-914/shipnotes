import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSnapshot, type Snapshot } from "../spec.js";

export type OutcomesLocation = { url: string; headers: Record<string, string> } | { file: string };

// Reads one project's Outcome Snapshot from a URL or a file and validates it.
export async function collectOutcomes(
  location: OutcomesLocation,
  baseDir: string,
  fetchImpl: typeof fetch = fetch
): Promise<Snapshot> {
  if ("file" in location) {
    const path = resolve(baseDir, location.file);
    return parseSnapshot(JSON.parse(await readFile(path, "utf8")), path);
  }
  const res = await fetchImpl(location.url, {
    headers: { accept: "application/json", ...location.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`GET ${location.url} answered ${res.status}`);
  }
  return parseSnapshot(await res.json(), location.url);
}
