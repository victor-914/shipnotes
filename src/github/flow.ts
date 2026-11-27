import { basename } from "node:path";
import { collectFacts } from "../collect.js";
import type { LoadedConfig } from "../config.js";
import { writeCheckedDraft } from "../draft.js";
import { channelLink, postUrl, writeChannelVersion, type ChannelVersion } from "../channels.js";
import type { Draft } from "../draft.js";
import {
  checkableText,
  draftPath,
  isVariant,
  mainPathOf,
  newDraftFile,
  parseDraftFile,
  renderDraftFile,
  slugify,
  stripFooter,
  toDraft,
  variantPath,
  withDraft,
  withFooter,
  type DraftFile,
} from "../draftFile.js";
import { factCheck } from "../factcheck.js";
import { describeFact, type Fact } from "../facts.js";
import type { Llm } from "../llm/claudeCode.js";
import { publishApproved } from "../publishers.js";
import { proposeTopics } from "../topics.js";
import type { Github, PullRequest } from "./api.js";
import { issueTitle, newlyTicked, newState, readState, renderIssueBody, TOPICS_LABEL } from "./topicsIssue.js";

// The GitHub review loop:
//   schedule        → open a topics Issue
//   tick / comment  → draft a topic as a pull request
//   comment on PR   → rewrite the draft
//   push to PR      → fact-check (commit status)
//   merge           → move to published/ and send to publishers

export interface FlowDeps {
  gh: Github;
  llm: Llm;
  loaded: LoadedConfig;
  today: string;
  githubToken?: string;
  fetchImpl?: typeof fetch;
  log: (line: string) => void;
}

export type FlowResult = { ok: boolean; message: string };

const ok = (message: string): FlowResult => ({ ok: true, message });
const fail = (message: string): FlowResult => ({ ok: false, message });

// ------------------------------------------------------------------ topics

export async function openTopics(d: FlowDeps): Promise<FlowResult> {
  const { facts, period } = await collectFacts(d.loaded, { githubToken: d.githubToken, fetchImpl: d.fetchImpl, log: d.log });
  if (facts.length === 0) return ok("No public metric moved enough this period. No topics Issue opened.");

  const open = await d.gh.openIssuesWithLabel(TOPICS_LABEL);
  const same = open.find((i) => {
    const s = readState(i.body);
    return s && s.period.from === period.from && s.period.to === period.to;
  });
  if (same) return ok(`Topics for this period are already in #${same.number}.`);

  const topics = await proposeTopics(d.llm, facts, d.loaded.voice);
  const state = newState(period, topics);
  const issue = await d.gh.createIssue(issueTitle(state), renderIssueBody(state), [TOPICS_LABEL]);
  return ok(`Opened #${issue.number} with ${topics.length} topics.`);
}

// ------------------------------------------------------------------ draft

function prBody(path: string, excerpt: string, facts: string[], issue: number, checked: number, variants: string[]): string {
  return [
    excerpt,
    "",
    `**Draft file:** \`${path}\` · from #${issue}`,
    ...(variants.length ? [`**Short versions:** ${variants.map((v) => `\`${v}\``).join(", ")}`] : []),
    "",
    "**Facts this post may use**",
    ...facts.map((f) => `- ${f}`),
    "",
    `Fact-check: ${checked} numbers verified against the snapshots.`,
    "",
    "**What now**",
    "- Edit the file here on GitHub, or in Claude (claude.ai/code): every push is fact-checked.",
    "- Comment `/shipnotes rewrite <what to change>` to have it rewritten.",
    "- **Merge to publish.** Close to throw it away.",
  ].join("\n");
}

async function uniqueBranch(gh: Github, wanted: string): Promise<string> {
  for (let i = 1; i <= 20; i++) {
    const name = i === 1 ? wanted : `${wanted}-${i}`;
    if (!(await gh.branchExists(name))) return name;
  }
  throw new Error(`Could not find a free branch name for ${wanted}`);
}

/** Write the configured channel versions of a post; failures are skipped, not fatal. */
async function channelVersions(d: FlowDeps, draft: Draft, facts: Fact[]): Promise<ChannelVersion[]> {
  const { config, voice } = d.loaded;
  const slug = slugify(draft.title);
  const url = postUrl(config, slug);
  const out: ChannelVersion[] = [];
  for (const channel of config.channels) {
    const v = await writeChannelVersion(d.llm, channel, draft, facts, voice, url ? channelLink(url, channel, slug) : undefined, config.rules.allow_small_integers);
    if (v) out.push(v);
    else d.log(`skipped the ${channel} version: it kept using numbers that aren't in the data`);
  }
  return out;
}

export async function draftTopic(d: FlowDeps, issueNumber: number, topicId: number): Promise<FlowResult> {
  const issue = await d.gh.getIssue(issueNumber);
  const state = readState(issue.body);
  if (!state) return fail(`#${issueNumber} is not a shipnotes topics Issue.`);
  const topic = state.topics.find((t) => t.id === topicId);
  if (!topic) return fail(`There is no topic ${topicId} in #${issueNumber}.`);
  const existing = state.drafted[String(topicId)];
  if (existing) return ok(`Topic ${topicId} already has a draft: #${existing}.`);

  const attempt = await writeCheckedDraft(
    d.llm,
    { facts: topic.facts, authorName: d.loaded.config.author.name, voice: d.loaded.voice, topic },
    d.loaded.config.rules.allow_small_integers
  );
  if (!attempt.ok) {
    const msg = `Couldn't write a draft for topic ${topicId} without numbers that aren't in the data (${attempt.check.unverified.join(", ")}). Nothing was saved. Try \`/shipnotes draft ${topicId}\` again.`;
    await d.gh.comment(issueNumber, msg);
    return fail(msg);
  }

  const footer = d.loaded.config.author.footer;
  const file = newDraftFile({ ...attempt.draft, body: withFooter(attempt.draft.body, footer) }, topic.facts, d.today, issueNumber);
  const path = draftPath(file, d.loaded.config.github.drafts_dir);
  const versions = await channelVersions(d, attempt.draft, topic.facts);

  const base = await d.gh.defaultBranch();
  const branch = await uniqueBranch(d.gh, `shipnotes/${d.today}-${slugify(attempt.draft.title).slice(0, 50)}`);
  await d.gh.createBranch(branch, await d.gh.branchSha(base));
  let commit = await d.gh.putFile(path, branch, renderDraftFile(file), `shipnotes: draft "${attempt.draft.title}"`);
  for (const v of versions) {
    commit = await d.gh.putFile(variantPath(path, v.channel), branch, `${v.text}\n`, `shipnotes: ${v.channel} version`);
  }
  const pr = await d.gh.createPull(
    `Draft: ${attempt.draft.title}`,
    branch,
    base,
    prBody(path, attempt.draft.excerpt, topic.facts.map(describeFact), issueNumber, attempt.check.checked, versions.map((v) => variantPath(path, v.channel)))
  );
  // Pushes made with the Actions token don't start workflows, so report the check here.
  await d.gh.setStatus(commit, "success", `${attempt.check.checked} numbers verified`);

  state.drafted[String(topicId)] = pr.number;
  await d.gh.updateIssue(issueNumber, { body: renderIssueBody(state) });
  await d.gh.comment(issueNumber, `Draft for topic ${topicId} is ready for review: #${pr.number}`);
  return ok(`Opened #${pr.number} for topic ${topicId}.`);
}

export async function draftTicked(d: FlowDeps, issueNumber: number): Promise<FlowResult> {
  const issue = await d.gh.getIssue(issueNumber);
  const state = readState(issue.body);
  if (!state) return ok("Not a topics Issue.");
  const ids = newlyTicked(issue.body, state);
  if (ids.length === 0) return ok("No newly ticked topics.");
  const results: FlowResult[] = [];
  for (const id of ids.slice(0, 3)) results.push(await draftTopic(d, issueNumber, id));
  return { ok: results.every((r) => r.ok), message: results.map((r) => r.message).join(" ") };
}

// ------------------------------------------------------------------ PR helpers

/** Every draft-folder Markdown file in the PR: posts and their channel versions. */
async function draftFilesIn(d: FlowDeps, pr: number): Promise<string[]> {
  const dir = `${d.loaded.config.github.drafts_dir}/`;
  return (await d.gh.pullFiles(pr)).filter((f) => f.status !== "removed" && f.filename.startsWith(dir) && f.filename.endsWith(".md")).map((f) => f.filename);
}

// ------------------------------------------------------------------ rewrite

export async function rewriteDraft(d: FlowDeps, prNumber: number, instructions: string): Promise<FlowResult> {
  if (!instructions.trim()) {
    await d.gh.comment(prNumber, "Tell me what to change, e.g. `/shipnotes rewrite shorter, and end with a question`.");
    return fail("No rewrite instructions.");
  }
  const pr = await d.gh.getPull(prNumber);
  const all = await draftFilesIn(d, prNumber);
  const path = all.find((p) => !isVariant(p));
  if (!path) return fail(`#${prNumber} has no draft file.`);
  const current = await d.gh.getFile(path, pr.head.ref);
  if (!current) return fail(`${path} was not found on ${pr.head.ref}.`);
  const file = parseDraftFile(current.text, path);
  const footer = d.loaded.config.author.footer;
  const previous = { ...toDraft(file), body: stripFooter(file.body, footer) };

  const attempt = await writeCheckedDraft(
    d.llm,
    { facts: file.meta.facts, authorName: d.loaded.config.author.name, voice: d.loaded.voice, previous, instructions },
    d.loaded.config.rules.allow_small_integers
  );
  if (!attempt.ok) {
    const msg = `The rewrite used numbers that aren't in the data (${attempt.check.unverified.join(", ")}), so I kept the current version.`;
    await d.gh.comment(prNumber, msg);
    return fail(msg);
  }
  const rewritten = withDraft(file, { ...attempt.draft, body: withFooter(attempt.draft.body, footer) });
  let commit = await d.gh.putFile(path, pr.head.ref, renderDraftFile(rewritten), "shipnotes: rewrite draft", current.sha);
  // Keep the short versions in step with the rewritten post.
  for (const v of await channelVersions(d, attempt.draft, file.meta.facts)) {
    const vPath = variantPath(path, v.channel);
    const existing = await d.gh.getFile(vPath, pr.head.ref);
    commit = await d.gh.putFile(vPath, pr.head.ref, `${v.text}\n`, `shipnotes: rewrite ${v.channel} version`, existing?.sha);
  }
  await d.gh.setStatus(commit, "success", `${attempt.check.checked} numbers verified`);
  await d.gh.comment(prNumber, `Rewritten. ${attempt.check.checked} numbers checked, all from the data.`);
  return ok(`Rewrote ${path}.`);
}

// ------------------------------------------------------------------ check

export async function checkPull(d: FlowDeps, pr: PullRequest): Promise<FlowResult> {
  const paths = await draftFilesIn(d, pr.number);
  if (paths.length === 0) return ok("No draft files in this pull request.");
  const problems: string[] = [];
  let checked = 0;
  for (const path of paths) {
    const f = await d.gh.getFile(path, pr.head.sha);
    if (!f) continue;
    try {
      const main = isVariant(path) ? await d.gh.getFile(mainPathOf(path), pr.head.sha) : f;
      if (!main) throw new Error(`no post ${mainPathOf(path)} next to it to take facts from`);
      const file = parseDraftFile(main.text, mainPathOf(path));
      const text = isVariant(path) ? f.text : checkableText(file);
      const result = factCheck(text, file.meta.facts, d.loaded.config.rules.allow_small_integers);
      checked += result.checked;
      if (!result.ok) problems.push(`\`${path}\`: ${result.unverified.join(", ")}`);
    } catch (err) {
      problems.push(`\`${path}\`: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (problems.length) {
    await d.gh.setStatus(pr.head.sha, "failure", "Numbers not found in the data");
    await d.gh.comment(
      pr.number,
      ["**Fact-check failed.** These numbers aren't in the draft's facts:", ...problems.map((p) => `- ${p}`), "", "Remove them, say it in words, or comment `/shipnotes rewrite …`."].join("\n")
    );
    return fail(`Fact-check failed: ${problems.join("; ")}`);
  }
  await d.gh.setStatus(pr.head.sha, "success", `${checked} numbers verified`);
  return ok(`${checked} numbers verified.`);
}

// ------------------------------------------------------------------ publish

export async function publishPull(d: FlowDeps, pr: PullRequest): Promise<FlowResult> {
  if (!pr.merged) return ok("Closed without merging: nothing published.");
  const all = await draftFilesIn(d, pr.number);
  const paths = all.filter((p) => !isVariant(p));
  const done: string[] = [];
  const problems: string[] = [];
  const pasteReady: string[] = [];

  for (const path of paths) {
    const f = await d.gh.getFile(path, pr.base.ref);
    if (!f) continue;
    const file = parseDraftFile(f.text, path);
    const result = factCheck(checkableText(file), file.meta.facts, d.loaded.config.rules.allow_small_integers);
    if (!result.ok) {
      problems.push(`\`${path}\` was merged with unverified numbers (${result.unverified.join(", ")}), so it was not published.`);
      continue;
    }

    const published = { ...file, meta: { ...file.meta, draft: false, published_at: d.today } };
    const targets = await publishApproved(published, d.loaded.config.publish, d.fetchImpl, path);
    const dest = `${d.loaded.config.github.published_dir}/${basename(path)}`;
    await d.gh.putFile(dest, pr.base.ref, renderDraftFile(published), `shipnotes: publish "${file.meta.title}"`);
    await d.gh.deleteFile(path, pr.base.ref, f.sha, `shipnotes: move "${file.meta.title}" to ${d.loaded.config.github.published_dir}/`);
    done.push(`**${file.meta.title}** → \`${dest}\`${targets.map((t) => `, ${t.location}`).join("")}`);

    for (const vPath of all.filter((p) => isVariant(p) && mainPathOf(p) === path)) {
      const v = await d.gh.getFile(vPath, pr.base.ref);
      if (!v) continue;
      const vDest = `${d.loaded.config.github.published_dir}/${basename(vPath)}`;
      await d.gh.putFile(vDest, pr.base.ref, v.text, `shipnotes: publish ${basename(vPath)}`);
      await d.gh.deleteFile(vPath, pr.base.ref, v.sha, `shipnotes: move ${basename(vPath)}`);
      const channel = vPath.match(/\.(\w+)\.md$/)?.[1] ?? "version";
      pasteReady.push(`<details><summary>${channel} — ready to paste</summary>\n\n\`\`\`text\n${v.text.trim()}\n\`\`\`\n</details>`);
    }
    if (file.meta.topic_issue) await d.gh.comment(file.meta.topic_issue, `Published from #${pr.number}: ${file.meta.title}`);
  }

  const lines = [...(done.length ? ["Published:", ...done.map((x) => `- ${x}`)] : []), ...pasteReady, ...problems];
  if (lines.length) await d.gh.comment(pr.number, lines.join("\n"));
  return problems.length ? fail(problems.join(" ")) : ok(done.length ? `Published ${done.length} post(s).` : "No draft files to publish.");
}

// ------------------------------------------------------------------ events

export function parseCommand(body: string): { name: "draft" | "rewrite" | "skip"; arg: string } | null {
  const match = body.trim().match(/^\/shipnotes\s+(draft|rewrite|skip)\b([\s\S]*)$/i);
  return match ? { name: match[1]!.toLowerCase() as "draft" | "rewrite" | "skip", arg: match[2]!.trim() } : null;
}

interface EventPayload {
  action?: string;
  sender?: { login: string; type?: string };
  comment?: { body: string; user: { login: string; type?: string } };
  issue?: { number: number; pull_request?: unknown; labels?: Array<{ name: string }> };
  pull_request?: PullRequest;
}

/** Dispatches one GitHub Actions event. Only people with write access can trigger drafting. */
export async function handleEvent(d: FlowDeps, eventName: string, payload: EventPayload): Promise<FlowResult> {
  switch (eventName) {
    case "schedule":
    case "workflow_dispatch":
      return openTopics(d);

    case "issue_comment": {
      const command = payload.comment ? parseCommand(payload.comment.body) : null;
      if (!command || !payload.issue || !payload.comment) return ok("Not a shipnotes command.");
      if (payload.comment.user.type === "Bot") return ok("Ignoring bots.");
      if (!(await d.gh.canWrite(payload.comment.user.login))) return ok(`@${payload.comment.user.login} can't run shipnotes here.`);
      const n = payload.issue.number;

      if (payload.issue.pull_request) {
        return command.name === "rewrite" ? rewriteDraft(d, n, command.arg) : ok("On a pull request, use `/shipnotes rewrite …`.");
      }
      if (command.name === "skip") {
        await d.gh.updateIssue(n, { state: "closed", state_reason: "not_planned" });
        return ok(`Closed #${n}.`);
      }
      if (command.name === "draft") {
        const id = Number(command.arg.match(/\d+/)?.[0]);
        if (!id) {
          await d.gh.comment(n, "Which topic? For example `/shipnotes draft 2`.");
          return fail("No topic number.");
        }
        return draftTopic(d, n, id);
      }
      return ok("On a topics Issue, use `/shipnotes draft <number>` or `/shipnotes skip`.");
    }

    case "issues": {
      if (payload.action !== "edited" || !payload.issue || !payload.sender) return ok("Ignored issue event.");
      if (!payload.issue.labels?.some((l) => l.name === TOPICS_LABEL)) return ok("Not a topics Issue.");
      if (!(await d.gh.canWrite(payload.sender.login))) return ok(`@${payload.sender.login} can't run shipnotes here.`);
      return draftTicked(d, payload.issue.number);
    }

    case "pull_request": {
      const pr = payload.pull_request;
      if (!pr) return ok("No pull request in the event.");
      if (payload.action === "closed") return publishPull(d, pr);
      if (["opened", "synchronize", "reopened", "edited"].includes(payload.action ?? "")) return checkPull(d, pr);
      return ok(`Ignored pull_request.${payload.action}.`);
    }

    default:
      return ok(`shipnotes doesn't handle "${eventName}" events.`);
  }
}
