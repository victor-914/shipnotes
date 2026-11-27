import type { LoadedConfig } from "./config.js";
import { storyToFact, type Fact } from "./facts.js";
import { collectCommits } from "./sources/github.js";
import { collectOutcomes } from "./sources/outcomesJson.js";
import type { Snapshot } from "./spec.js";
import { findStories, withShipped } from "./stories.js";

export interface Collected {
  snapshots: Snapshot[];
  facts: Fact[];
  period: { from: string; to: string };
}

/** Steps 1–3, all plain code: fetch snapshots and commits, find what moved, rank it. */
export async function collectFacts(
  loaded: LoadedConfig,
  opts: { githubToken?: string; fetchImpl?: typeof fetch; log?: (line: string) => void } = {}
): Promise<Collected> {
  const log = opts.log ?? (() => {});
  const snapshots: Snapshot[] = [];
  for (const project of loaded.config.projects) {
    let snap = await collectOutcomes(project.outcomes, loaded.baseDir, opts.fetchImpl);
    for (const repo of project.repos) {
      snap = withShipped(snap, await collectCommits(repo, snap.period, opts.githubToken, opts.fetchImpl));
    }
    log(`collected ${snap.project.name}: ${snap.metrics.length} metrics, ${snap.shipped.length} shipped items`);
    snapshots.push(snap);
  }

  const stories = findStories(snapshots, loaded.config.rules);
  stories.forEach((s) => log(`story: ${s.project.name} / ${s.metric.name} (score ${s.score})`));

  const froms = snapshots.map((s) => s.period.from).sort();
  const tos = snapshots.map((s) => s.period.to).sort();
  return { snapshots, facts: stories.map(storyToFact), period: { from: froms[0]!, to: tos[tos.length - 1]! } };
}
