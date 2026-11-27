import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { configSchema } from "../src/config.js";
import { extractNumbers, factCheck } from "../src/factcheck.js";
import { storyToFact } from "../src/facts.js";
import { parseSnapshot, type SnapshotInput } from "../src/spec.js";
import { findStories } from "../src/stories.js";

const rules = configSchema.shape.rules.parse(undefined);

function snap(overrides: Partial<SnapshotInput> = {}) {
  return parseSnapshot({
    spec: "outcomes/0.1",
    project: { name: "Casmir Realty", slug: "casmir-realty" },
    period: { from: "2026-11-03", to: "2026-11-10" },
    metrics: [
      { name: "lighthouse_performance", value: 73, previous: 53, unit: "score", public: true },
      { name: "lcp_seconds", value: 2.7, previous: 6.3, unit: "seconds", better: "lower", public: true },
      { name: "revenue", value: 900000, previous: 100000, unit: "currency", currency: "NGN" },
    ],
    shipped: [{ title: "Speed up the homepage", date: "2026-11-09" }],
    ...overrides,
  });
}

describe("spec", () => {
  it("accepts the example snapshot", async () => {
    const data = JSON.parse(await readFile(new URL("../examples/outcomes.json", import.meta.url), "utf8"));
    expect(parseSnapshot(data).project.slug).toBe("casmir-realty");
  });

  it("rejects a north_star that is not a metric", () => {
    expect(() => snap({ north_star: "bookings" })).toThrow(/north_star/);
  });

  it("keeps metrics private unless marked public", () => {
    expect(snap().metrics.find((m) => m.name === "revenue")?.public).toBe(false);
  });
});

describe("findStories", () => {
  it("ranks public improvements and never includes private metrics", () => {
    const stories = findStories([snap()], rules);
    expect(stories.map((s) => s.metric.name)).toEqual(["lcp_seconds", "lighthouse_performance"]);
    expect(stories.every((s) => s.metric.public)).toBe(true);
    expect(stories[0]!.improved).toBe(true); // lower LCP is better
  });

  it("skips declines unless asked, and small moves always", () => {
    const s = snap({
      metrics: [
        { name: "visitors", value: 80, previous: 100, public: true },
        { name: "listing_views", value: 102, previous: 100, public: true },
      ],
    });
    expect(findStories([s], rules)).toHaveLength(0);
    expect(findStories([s], { ...rules, include_declines: true }).map((x) => x.metric.name)).toEqual(["visitors"]);
  });

  it("flags small counts as an early signal", () => {
    const s = snap({ metrics: [{ name: "paid_bookings", value: 12, previous: 7, public: true }] });
    expect(findStories([s], rules)[0]!.earlySignal).toBe(true);
  });
});

describe("factCheck", () => {
  const stories = findStories([snap()], rules).map(storyToFact);

  it("passes a draft that only uses snapshot numbers and simple roundings", () => {
    const text = `Our Lighthouse score went from 53 to 73, up 38%. Load time fell from 6.3 s to 2.7 s, 2.3x faster, on 9 Nov 2026.
1. Smaller images
2. Fewer fonts`;
    expect(factCheck(text, stories, true)).toMatchObject({ ok: true, unverified: [] });
  });

  it("catches a made-up number", () => {
    const result = factCheck("Bookings rose 47% after the change.", stories, true);
    expect(result.ok).toBe(false);
    expect(result.unverified).toEqual(["47"]);
  });

  it("never lets a private metric's value through", () => {
    expect(factCheck("Revenue hit 900,000 naira.", stories, true).unverified).toEqual(["900,000"]);
  });

  it("ignores numbers inside code and links", () => {
    expect(factCheck("See [the PR](https://github.com/x/y/pull/4521) and `v12.4`.", stories, true).ok).toBe(true);
  });

  it("reads thousands separators and k suffixes", () => {
    expect(extractNumbers("2,140 visitors, 1.5k views").map((n) => n.value)).toEqual([2140, 1500]);
  });
});
