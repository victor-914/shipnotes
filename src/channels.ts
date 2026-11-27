import { z } from "zod";
import type { Config } from "./config.js";
import type { Draft } from "./draft.js";
import { factsForModel } from "./draft.js";
import { factCheck, type FactCheckResult } from "./factcheck.js";
import type { Fact } from "./facts.js";
import type { Llm } from "./llm/claudeCode.js";

// Short versions of a post for places shipnotes can't publish to directly
// (LinkedIn, Substack). They sit next to the draft in the same pull request,
// get the same fact-check, and are handed back ready to paste after merge.

export type Channel = "linkedin" | "substack";

const GUIDE: Record<Channel, string> = {
  linkedin:
    "A LinkedIn post: 120–250 words. First line is a hook that states the outcome. Short paragraphs of one or two sentences. No hashtag spam (at most 3, at the end). End with one question to the reader. Do not include any link: it is added after your text.",
  substack:
    "A newsletter introduction for Substack: 100–200 words, warmer and more personal than the blog post, telling subscribers what the full post covers and why it matters. Do not include any link: it is added after your text.",
};

const answerSchema = z.strictObject({ text: z.string().min(80).max(3000) });
const { $schema: _meta, ...answerJsonSchema } = z.toJSONSchema(answerSchema);

const SYSTEM = `You adapt an approved blog post into a shorter version for one channel.
- Use ONLY numbers that appear in FACTS, copied exactly. Do not compute new numbers. Fewer numbers is fine.
- Never claim one change caused a metric to move.
- Plain words, no hype, no emoji. Follow the VOICE guide when given.`;

export function postUrl(config: Config, slug: string): string | undefined {
  return config.site.post_url?.replace("{slug}", slug);
}

/** The canonical link with UTM tags (lowercase, underscores) so each channel's readers can be counted. */
export function channelLink(url: string, channel: Channel, slug: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", channel);
  u.searchParams.set("utm_medium", channel === "linkedin" ? "post" : "newsletter");
  const campaign = slug.replace(/-/g, "_");
  u.searchParams.set("utm_campaign", campaign.length > 60 ? campaign.slice(0, 60).replace(/_[^_]*$/, "") : campaign);
  return u.toString();
}

export interface ChannelVersion {
  channel: Channel;
  text: string;
  check: FactCheckResult;
}

export async function writeChannelVersion(
  llm: Llm,
  channel: Channel,
  post: Draft,
  facts: Fact[],
  voice: string,
  link: string | undefined,
  allowSmallIntegers = true
): Promise<ChannelVersion | null> {
  let feedback: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const answer = await llm.generate({
      system: SYSTEM,
      prompt: [
        voice ? `VOICE:\n${voice.trim()}` : "",
        `FACTS (JSON):\n${JSON.stringify(factsForModel(facts), null, 2)}`,
        `APPROVED POST (JSON):\n${JSON.stringify(post, null, 2)}`,
        `CHANNEL: ${GUIDE[channel]}`,
        feedback.length ? `Your previous attempt used numbers not in FACTS: ${feedback.join(", ")}. Leave them out.` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: answerJsonSchema,
    });
    const parsed = answerSchema.safeParse(answer);
    if (!parsed.success) throw new Error(`The model's ${channel} version did not match the expected shape`);
    const check = factCheck(parsed.data.text, facts, allowSmallIntegers);
    if (check.ok) {
      const text = link ? `${parsed.data.text.trim()}\n\n${channel === "linkedin" ? "Full post" : "Read it here"}: ${link}` : parsed.data.text.trim();
      return { channel, text, check };
    }
    feedback = check.unverified;
  }
  return null; // skipped: the main draft is still fine without it
}
