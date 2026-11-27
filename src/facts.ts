import { z } from "zod";
import type { Story } from "./stories.js";

// A Fact is one public metric change, in a form that can be stored: in the
// topics Issue, in a draft's frontmatter. Whoever edits a draft later, the
// facts travel with it, so the fact-check can always be re-run.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const factSchema = z.strictObject({
  id: z.string().min(1),
  project: z.string().min(1),
  project_name: z.string().min(1),
  project_url: z.string().optional(),
  metric: z.string().min(1),
  label: z.string().optional(),
  unit: z.enum(["count", "ratio", "percent", "seconds", "ms", "score", "currency"]),
  better: z.enum(["higher", "lower"]),
  before: z.number(),
  after: z.number(),
  period: z.strictObject({ from: isoDate, to: isoDate }),
  north_star: z.boolean(),
  early_signal: z.boolean(),
  improved: z.boolean(),
  shipped: z.array(z.strictObject({ title: z.string(), date: isoDate })).max(15),
});
export type Fact = z.infer<typeof factSchema>;

export function storyToFact(s: Story): Fact {
  return {
    id: `${s.project.slug}/${s.metric.name}`,
    project: s.project.slug,
    project_name: s.project.name,
    ...(s.project.url ? { project_url: s.project.url } : {}),
    metric: s.metric.name,
    ...(s.metric.label ? { label: s.metric.label } : {}),
    unit: s.metric.unit,
    better: s.metric.better,
    before: s.previous,
    after: s.metric.value,
    period: s.period,
    north_star: s.isNorthStar,
    early_signal: s.earlySignal,
    improved: s.improved,
    shipped: s.shipped.slice(0, 15).map((x) => ({ title: x.title, date: x.date })),
  };
}

export function pctChange(f: Fact): number | null {
  return f.before === 0 ? null : ((f.after - f.before) / Math.abs(f.before)) * 100;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : String(Math.round(n * 100) / 100);
}

export function showValue(f: Fact, v: number): string {
  if (f.unit === "ratio") return `${fmt(v * 100)}%`;
  if (f.unit === "percent") return `${fmt(v)}%`;
  if (f.unit === "seconds") return `${fmt(v)} s`;
  if (f.unit === "ms") return `${fmt(v)} ms`;
  return fmt(v);
}

/** One line for humans: "Casmir Realty · Homepage LCP 6.3 s → 2.7 s (down 57%)". */
export function describeFact(f: Fact): string {
  const pct = pctChange(f);
  const change = pct === null ? "new" : `${pct > 0 ? "up" : "down"} ${fmt(Math.abs(Math.round(pct)))}%`;
  return `${f.project_name} · ${f.label ?? f.metric.replace(/_/g, " ")} ${showValue(f, f.before)} → ${showValue(f, f.after)} (${change})`;
}
