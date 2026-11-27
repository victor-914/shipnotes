import { parse as parseYaml, stringify as toYaml } from "yaml";
import { z } from "zod";
import type { Draft } from "./draft.js";
import { factSchema, type Fact } from "./facts.js";

// A draft on disk or in a pull request: Markdown with YAML frontmatter. The
// frontmatter carries the facts, so `shipnotes check` works on any copy of the
// file, whoever edited it (GitHub, Claude, a contributor, a text editor).

export const draftMetaSchema = z.looseObject({
  title: z.string().min(1),
  excerpt: z.string().default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(true),
  published_at: z.string().optional(),
  projects: z.array(z.string()).default([]),
  topic_issue: z.number().int().optional(),
  generator: z.string().optional(),
  facts: z.array(factSchema).min(1),
});
export type DraftMeta = z.output<typeof draftMetaSchema>;

export interface DraftFile {
  meta: DraftMeta;
  body: string;
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function newDraftFile(draft: Draft, facts: Fact[], date: string, topicIssue?: number): DraftFile {
  return {
    meta: {
      title: draft.title,
      excerpt: draft.excerpt,
      date,
      tags: draft.tags,
      draft: true,
      projects: [...new Set(facts.map((f) => f.project))],
      ...(topicIssue ? { topic_issue: topicIssue } : {}),
      generator: "shipnotes",
      facts,
    },
    body: draft.body.trim(),
  };
}

export function draftPath(file: DraftFile, dir = "drafts"): string {
  return `${dir}/${file.meta.date}-${slugify(file.meta.title)}.md`;
}

export function renderDraftFile(file: DraftFile): string {
  return `---\n${toYaml(file.meta, { lineWidth: 0, aliasDuplicateObjects: false })}---\n\n${file.body.trim()}\n`;
}

export function parseDraftFile(text: string, where = "draft"): DraftFile {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`${where} has no YAML frontmatter (--- … ---)`);
  const result = draftMetaSchema.safeParse(parseYaml(match[1]!));
  if (!result.success) throw new Error(`${where} frontmatter is invalid:\n${z.prettifyError(result.error)}`);
  return { meta: result.data, body: match[2]!.trim() };
}

/** The draft as the model sees it, for rewrites. */
export function toDraft(file: DraftFile): Draft {
  return { title: file.meta.title, excerpt: file.meta.excerpt, body: file.body, tags: file.meta.tags };
}

export function withDraft(file: DraftFile, draft: Draft): DraftFile {
  return { meta: { ...file.meta, title: draft.title, excerpt: draft.excerpt, tags: draft.tags }, body: draft.body.trim() };
}

/** Everything a reader sees, for the fact-check. */
export function checkableText(file: DraftFile): string {
  return `${file.meta.title}\n${file.meta.excerpt}\n${file.body}`;
}

// Channel versions sit next to their post: drafts/<date>-<slug>.linkedin.md
const VARIANT_RE = /\.(linkedin|substack)\.md$/;

export function variantPath(mainPath: string, channel: string): string {
  return mainPath.replace(/\.md$/, `.${channel}.md`);
}

export function isVariant(path: string): boolean {
  return VARIANT_RE.test(path);
}

export function mainPathOf(variant: string): string {
  return variant.replace(VARIANT_RE, ".md");
}

export function withFooter(body: string, footer: string | undefined): string {
  return footer?.trim() ? `${body.trim()}\n\n---\n\n${footer.trim()}` : body.trim();
}

export function stripFooter(body: string, footer: string | undefined): string {
  const tail = footer?.trim() ? `\n\n---\n\n${footer.trim()}` : "";
  return tail && body.trim().endsWith(tail) ? body.trim().slice(0, -tail.length).trim() : body.trim();
}
