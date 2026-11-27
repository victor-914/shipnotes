import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const headers = z.record(z.string(), z.string()).default({});

const outcomesSource = z.union([
  z.strictObject({ url: z.url(), headers }),
  z.strictObject({ file: z.string().min(1) }),
]);

const publisher = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("markdown"), dir: z.string().default("./drafts") }),
  z.strictObject({
    type: z.literal("http"),
    url: z.url(),
    headers,
    // After a draft PR is merged: send it as a live post, or as a draft for a second review on that site.
    on_merge: z.enum(["published", "draft"]).default("published"),
  }),
]);

export const configSchema = z.strictObject({
  author: z.strictObject({
    name: z.string().min(1),
    voice: z.string().optional(), // path to VOICE.md
    // Markdown added to the end of every post, e.g. a line linking your manifesto.
    footer: z.string().max(1000).optional(),
  }),
  // Where approved posts live, so short versions can link to them. {slug} is replaced.
  site: z
    .strictObject({ post_url: z.string().regex(/\{slug\}/, "post_url must contain {slug}").optional() })
    .default({}),
  // Extra versions written next to each draft, in the same pull request.
  channels: z.array(z.enum(["linkedin", "substack"])).default([]),
  projects: z
    .array(
      z.strictObject({
        outcomes: outcomesSource,
        repos: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Expected owner/repo")).default([]),
      })
    )
    .min(1),
  llm: z
    .strictObject({
      provider: z.literal("claude-code").default("claude-code"),
      model: z.string().optional(),
      timeout_seconds: z.number().int().positive().default(300),
    })
    .default({ provider: "claude-code", timeout_seconds: 300 }),
  rules: z
    .strictObject({
      // A metric must move at least this much (percent) to count as a story.
      min_change_pct: z.number().min(0).default(10),
      // Counts below this are reported as an "early signal", not a trend.
      min_count: z.number().min(0).default(30),
      max_stories: z.number().int().min(1).max(10).default(5),
      // Write about metrics that got worse too (honest posts), not just wins.
      include_declines: z.boolean().default(false),
      // Allow bare numbers 0–10 in the draft without a matching fact ("three steps").
      allow_small_integers: z.boolean().default(true),
    })
    .default({ min_change_pct: 10, min_count: 30, max_stories: 5, include_declines: false, allow_small_integers: true }),
  // Optional. In the GitHub flow, approved posts are always kept in published/;
  // these targets are extra places they go after merge.
  publish: z.array(publisher).default([]),
  github: z
    .strictObject({
      drafts_dir: z.string().default("drafts"),
      published_dir: z.string().default("published"),
    })
    .default({ drafts_dir: "drafts", published_dir: "published" }),
});

export type Config = z.output<typeof configSchema>;
export type PublisherConfig = Config["publish"][number];

// ${NAME} in any string is replaced from the environment, so secrets stay in
// CI secrets and never in the config file.
export function interpolateEnv<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
      const found = env[name];
      if (found === undefined || found === "") {
        throw new Error(`Config uses \${${name}} but that environment variable is not set`);
      }
      return found;
    }) as T;
  }
  if (Array.isArray(value)) return value.map((item) => interpolateEnv(item, env)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolateEnv(v, env)])) as T;
  }
  return value;
}

export interface LoadedConfig {
  config: Config;
  baseDir: string;
  voice: string;
}

export async function loadConfig(path: string, env: NodeJS.ProcessEnv = process.env): Promise<LoadedConfig> {
  const absolute = resolve(path);
  const raw = parseYaml(await readFile(absolute, "utf8"));
  const result = configSchema.safeParse(interpolateEnv(raw, env));
  if (!result.success) {
    throw new Error(`Invalid config ${path}:\n${z.prettifyError(result.error)}`);
  }
  const baseDir = dirname(absolute);
  const voice = result.data.author.voice ? await readFile(resolve(baseDir, result.data.author.voice), "utf8") : "";
  return { config: result.data, baseDir, voice };
}
