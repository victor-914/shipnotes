import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { PublisherConfig } from "./config.js";
import type { ChannelVersion } from "./channels.js";
import { draftPath, renderDraftFile, slugify, variantPath, type DraftFile } from "./draftFile.js";

// Where a post goes beyond the repo. In the GitHub flow these run only after a
// draft pull request is merged, so a person has always approved first.

export interface PublishResult {
  publisher: string;
  location: string;
}

/** The JSON body sent to an http publisher. */
/**
 * The post's slug: from its file name when there is one ("2026-12-01-my-post.md" → "my-post"),
 * because the LinkedIn/Substack links were made from it and a retitled post keeps its file name.
 */
export function postSlug(file: DraftFile, path?: string): string {
  const fromName = path ? basename(path, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "") : "";
  return fromName || slugify(file.meta.title);
}

export function postPayload(file: DraftFile, published: boolean, path?: string) {
  return {
    title: file.meta.title,
    slug: postSlug(file, path),
    excerpt: file.meta.excerpt,
    body: file.body,
    tags: file.meta.tags,
    date: file.meta.date,
    projects: file.meta.projects,
    published,
    generator: "shipnotes",
    facts: file.meta.facts,
  };
}

async function toHttp(
  file: DraftFile,
  url: string,
  headers: Record<string, string>,
  published: boolean,
  fetchImpl: typeof fetch,
  path?: string
) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(postPayload(file, published, path)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`POST ${url} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  return body.url ?? res.headers.get("location") ?? url;
}

/** Local runs (`shipnotes run`): save the draft as a file and/or send it as an unpublished post. */
export async function publishDraftLocally(
  file: DraftFile,
  targets: PublisherConfig[],
  baseDir: string,
  fetchImpl: typeof fetch = fetch,
  versions: ChannelVersion[] = []
) {
  const results: PublishResult[] = [];
  for (const t of targets) {
    if (t.type === "markdown") {
      const path = resolve(baseDir, t.dir, basename(draftPath(file)));
      await mkdir(resolve(baseDir, t.dir), { recursive: true });
      await writeFile(path, renderDraftFile(file), "utf8");
      results.push({ publisher: "markdown", location: path });
      for (const v of versions) {
        const vPath = variantPath(path, v.channel);
        await writeFile(vPath, `${v.text}\n`, "utf8");
        results.push({ publisher: `markdown (${v.channel})`, location: vPath });
      }
    } else {
      results.push({ publisher: "http", location: await toHttp(file, t.url, t.headers, false, fetchImpl) });
    }
  }
  return results;
}

/** After a merge: send the approved post to every http target. (The repo copy moves to published/ separately.) */
export async function publishApproved(file: DraftFile, targets: PublisherConfig[], fetchImpl: typeof fetch = fetch, path?: string) {
  const results: PublishResult[] = [];
  for (const t of targets) {
    if (t.type !== "http") continue;
    results.push({ publisher: "http", location: await toHttp(file, t.url, t.headers, t.on_merge === "published", fetchImpl, path) });
  }
  return results;
}
