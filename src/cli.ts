#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { collectFacts } from "./collect.js";
import { loadConfig } from "./config.js";
import { checkableText, isVariant, mainPathOf, parseDraftFile } from "./draftFile.js";
import { factCheck } from "./factcheck.js";
import { describeFact } from "./facts.js";
import { github } from "./github/api.js";
import { handleEvent } from "./github/flow.js";
import { claudeCode } from "./llm/claudeCode.js";
import { run } from "./run.js";
import { parseSnapshot } from "./spec.js";
import { proposeTopics } from "./topics.js";

const USAGE = `shipnotes — turn your projects' outcomes into blog drafts you approve

Usage:
  shipnotes run      [--config shipnotes.config.yaml] [--dry-run]   one-shot: draft and save locally
  shipnotes topics   [--config …]                                   print this period's topic ideas
  shipnotes check    <draft.md>…                                    fact-check draft files
  shipnotes validate <outcomes.json>                                validate an Outcome Snapshot
  shipnotes event    [--config …]                                   handle the current GitHub Actions event

Exit codes: 0 ok or nothing to say · 1 error · 2 fact-check failed`;

const today = () => new Date().toISOString().slice(0, 10);
const log = (line: string) => console.error(`shipnotes: ${line}`);

async function stepSummary(text: string): Promise<void> {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## shipnotes\n\n${text}\n`);
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c", default: "shipnotes.config.yaml" },
      "dry-run": { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return command || values.help ? 0 : 1;
  }

  switch (command) {
    case "validate": {
      if (!args[0]) throw new Error("Usage: shipnotes validate <outcomes.json>");
      const snap = parseSnapshot(JSON.parse(await readFile(args[0], "utf8")), args[0]);
      console.log(`OK: ${snap.project.name}, ${snap.metrics.length} metrics (${snap.metrics.filter((m) => m.public).length} public)`);
      return 0;
    }

    case "check": {
      if (args.length === 0) throw new Error("Usage: shipnotes check <draft.md>…");
      let failed = 0;
      for (const path of args) {
        const text = await readFile(path, "utf8");
        const file = isVariant(path) ? parseDraftFile(await readFile(mainPathOf(path), "utf8"), mainPathOf(path)) : parseDraftFile(text, path);
        const result = factCheck(isVariant(path) ? text : checkableText(file), file.meta.facts, !values.strict);
        if (result.ok) console.log(`✓ ${path}: ${result.checked} numbers verified`);
        else {
          failed++;
          console.log(`✗ ${path}: not in the facts: ${result.unverified.join(", ")}`);
        }
      }
      return failed ? 2 : 0;
    }

    case "topics": {
      const loaded = await loadConfig(values.config!);
      const { facts } = await collectFacts(loaded, { githubToken: process.env.GITHUB_TOKEN, log });
      if (!facts.length) {
        console.log("No public metric moved enough this period.");
        return 0;
      }
      const llm = claudeCode({ model: loaded.config.llm.model, timeoutSeconds: loaded.config.llm.timeout_seconds });
      for (const t of await proposeTopics(llm, facts, loaded.voice)) {
        console.log(`${t.id}. ${t.title}\n   ${t.angle}\n${t.facts.map((f) => `   · ${describeFact(f)}`).join("\n")}\n`);
      }
      return 0;
    }

    case "run": {
      const loaded = await loadConfig(values.config!);
      const llm = claudeCode({ model: loaded.config.llm.model, timeoutSeconds: loaded.config.llm.timeout_seconds });
      const outcome = await run({ loaded, llm, dryRun: values["dry-run"], githubToken: process.env.GITHUB_TOKEN, log });
      if (outcome.status === "nothing-to-say") return 0;
      if (outcome.status === "fact-check-failed") {
        log(`draft rejected, numbers not in the data: ${outcome.attempt.check.unverified.join(", ")}`);
        return 2;
      }
      if (values["dry-run"]) {
        console.log(`# ${outcome.file.meta.title}\n\n${outcome.file.body}`);
        for (const v of outcome.versions) console.log(`\n----- ${v.channel} -----\n${v.text}`);
      }
      return 0;
    }

    case "event": {
      const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_API_URL } = process.env;
      if (!GITHUB_EVENT_NAME || !GITHUB_EVENT_PATH || !GITHUB_REPOSITORY || !GITHUB_TOKEN) {
        throw new Error("`shipnotes event` runs inside GitHub Actions (needs GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN).");
      }
      const loaded = await loadConfig(values.config!);
      const payload = JSON.parse(await readFile(GITHUB_EVENT_PATH, "utf8"));
      const result = await handleEvent(
        {
          gh: github({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY, apiUrl: GITHUB_API_URL }),
          llm: claudeCode({ model: loaded.config.llm.model, timeoutSeconds: loaded.config.llm.timeout_seconds }),
          loaded,
          today: today(),
          githubToken: process.env.SHIPNOTES_READ_TOKEN || GITHUB_TOKEN,
          log,
        },
        GITHUB_EVENT_NAME,
        payload
      );
      log(result.message);
      await stepSummary(result.message);
      return result.ok ? 0 : 2;
    }

    default:
      throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`shipnotes: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
);
