import { collectFacts } from "./collect.js";
import type { LoadedConfig } from "./config.js";
import { writeCheckedDraft, type DraftAttempt } from "./draft.js";
import { channelLink, postUrl, writeChannelVersion, type ChannelVersion } from "./channels.js";
import { newDraftFile, slugify, withFooter, type DraftFile } from "./draftFile.js";
import type { Llm } from "./llm/claudeCode.js";
import { publishDraftLocally, type PublishResult } from "./publishers.js";

// The one-shot local flow (`shipnotes run`): collect, draft, fact-check, save.
// The GitHub review loop lives in github/flow.ts.

export type RunOutcome =
  | { status: "nothing-to-say" }
  | { status: "fact-check-failed"; attempt: Extract<DraftAttempt, { ok: false }> }
  | { status: "drafted"; file: DraftFile; checked: number; versions: ChannelVersion[]; published: PublishResult[] };

export interface RunOptions {
  loaded: LoadedConfig;
  llm: Llm;
  dryRun?: boolean;
  githubToken?: string;
  today?: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export async function run(opts: RunOptions): Promise<RunOutcome> {
  const { config, voice, baseDir } = opts.loaded;
  const log = opts.log ?? (() => {});

  const { facts } = await collectFacts(opts.loaded, { githubToken: opts.githubToken, fetchImpl: opts.fetchImpl, log });
  if (facts.length === 0) {
    log("no public metric moved enough this period; nothing to write (that's fine)");
    return { status: "nothing-to-say" };
  }

  const attempt = await writeCheckedDraft(opts.llm, { facts, authorName: config.author.name, voice }, config.rules.allow_small_integers);
  log(`draft: ${attempt.check.checked} numbers checked, ${attempt.check.unverified.length} unverified, ${attempt.attempts} attempt(s)`);
  if (!attempt.ok) return { status: "fact-check-failed", attempt };

  const file = newDraftFile(
    { ...attempt.draft, body: withFooter(attempt.draft.body, config.author.footer) },
    facts,
    opts.today ?? new Date().toISOString().slice(0, 10)
  );

  const slug = slugify(attempt.draft.title);
  const url = postUrl(config, slug);
  const versions: ChannelVersion[] = [];
  for (const channel of config.channels) {
    const v = await writeChannelVersion(opts.llm, channel, attempt.draft, facts, voice, url ? channelLink(url, channel, slug) : undefined, config.rules.allow_small_integers);
    if (v) versions.push(v);
  }

  const targets = config.publish.length ? config.publish : [{ type: "markdown" as const, dir: config.github.drafts_dir }];
  const published = opts.dryRun ? [] : await publishDraftLocally(file, targets, baseDir, opts.fetchImpl, versions);
  published.forEach((p) => log(`draft saved via ${p.publisher}: ${p.location}`));
  return { status: "drafted", file, checked: attempt.check.checked, versions, published };
}
