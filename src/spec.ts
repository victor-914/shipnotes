import { z } from "zod";

// The Outcome Snapshot: one small JSON document a project publishes about one
// period. Any project in any language can produce it; shipnotes only reads it.
// See SPEC.md for the prose version.

export const SPEC_VERSION = "outcomes/0.1";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase-hyphenated slug").max(80);

export const metricSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9_]+$/, "Metric names are lowercase_with_underscores").max(64),
  label: z.string().min(1).max(80).optional(),
  value: z.number(),
  previous: z.number().optional(),
  unit: z.enum(["count", "ratio", "percent", "seconds", "ms", "score", "currency"]).default("count"),
  currency: z.string().length(3).optional(),
  // Which way is good. Load time: lower. Bookings: higher.
  better: z.enum(["higher", "lower"]).default("higher"),
  // Private unless marked public. Private metrics never reach the language model.
  public: z.boolean().default(false),
});

export const shippedSchema = z.strictObject({
  title: z.string().min(1).max(200),
  date: isoDate,
  ref: z.string().max(200).optional(),
  url: z.url().optional(),
});

export const snapshotSchema = z
  .strictObject({
    $schema: z.string().optional(),
    spec: z.literal(SPEC_VERSION),
    project: z.strictObject({
      name: z.string().min(1).max(120),
      slug,
      url: z.url().optional(),
      description: z.string().max(400).optional(),
    }),
    period: z.strictObject({ from: isoDate, to: isoDate }),
    north_star: z.string().optional(),
    metrics: z.array(metricSchema).max(100),
    shipped: z.array(shippedSchema).max(500).default([]),
    generated_at: z.iso.datetime().optional(),
  })
  .refine((s) => s.period.from <= s.period.to, { path: ["period"], message: "period.from must not be after period.to" })
  .refine((s) => new Set(s.metrics.map((m) => m.name)).size === s.metrics.length, {
    path: ["metrics"],
    message: "Metric names must be unique",
  })
  .refine((s) => !s.north_star || s.metrics.some((m) => m.name === s.north_star), {
    path: ["north_star"],
    message: "north_star must name one of the metrics",
  });

export type Metric = z.output<typeof metricSchema>;
export type Shipped = z.output<typeof shippedSchema>;
export type Snapshot = z.output<typeof snapshotSchema>;
export type SnapshotInput = z.input<typeof snapshotSchema>;

export function parseSnapshot(data: unknown, where = "snapshot"): Snapshot {
  const result = snapshotSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`${where} is not a valid ${SPEC_VERSION} snapshot:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
