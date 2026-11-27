import type { Config } from "./config.js";
import type { Metric, Shipped, Snapshot } from "./spec.js";

// Plain code, no language model: find the public metrics that moved, tie them
// to what shipped in the same period, and rank them.

export interface Story {
  project: Snapshot["project"];
  period: Snapshot["period"];
  metric: Metric;
  previous: number;
  delta: number;
  /** Percent change from previous; null when previous is 0. */
  pctChange: number | null;
  improved: boolean;
  isNorthStar: boolean;
  /** Too few events to call it a trend. */
  earlySignal: boolean;
  shipped: Shipped[];
  score: number;
}

export function findStories(snapshots: Snapshot[], rules: Config["rules"]): Story[] {
  const stories: Story[] = [];

  for (const snap of snapshots) {
    for (const metric of snap.metrics) {
      if (!metric.public || metric.previous === undefined) continue;

      const previous = metric.previous;
      const delta = metric.value - previous;
      if (delta === 0) continue;

      const pctChange = previous === 0 ? null : (delta / Math.abs(previous)) * 100;
      const size = pctChange === null ? 100 : Math.abs(pctChange);
      if (size < rules.min_change_pct) continue;

      const improved = metric.better === "higher" ? delta > 0 : delta < 0;
      if (!improved && !rules.include_declines) continue;

      const isNorthStar = snap.north_star === metric.name;
      const earlySignal = metric.unit === "count" && Math.max(metric.value, previous) < rules.min_count;

      const score =
        Math.min(size, 200) / 2 + (isNorthStar ? 30 : 0) + (snap.shipped.length ? 20 : 0) + (improved ? 10 : 0) - (earlySignal ? 25 : 0);

      stories.push({
        project: snap.project,
        period: snap.period,
        metric,
        previous,
        delta,
        pctChange,
        improved,
        isNorthStar,
        earlySignal,
        shipped: snap.shipped,
        score: Math.round(score * 10) / 10,
      });
    }
  }

  return stories.sort((a, b) => b.score - a.score).slice(0, rules.max_stories);
}

/** Merge commit-derived items into a snapshot's own shipped list, without duplicates. */
export function withShipped(snap: Snapshot, extra: Shipped[]): Snapshot {
  const seen = new Set(snap.shipped.map((s) => s.title.toLowerCase()));
  const merged = [...snap.shipped];
  for (const item of extra) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return { ...snap, shipped: merged };
}
