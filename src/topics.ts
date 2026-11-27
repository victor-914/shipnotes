import { z } from "zod";
import { describeFact, type Fact } from "./facts.js";
import type { Llm } from "./llm/claudeCode.js";

// Turns the week's facts into 1–5 post ideas. The model only proposes a title
// and an angle and says which facts each idea uses; it adds no numbers.

export interface Topic {
  id: number;
  title: string;
  angle: string;
  facts: Fact[];
}

const answerSchema = z.strictObject({
  topics: z
    .array(
      z.strictObject({
        title: z.string().min(5).max(120),
        angle: z.string().min(10).max(300),
        fact_ids: z.array(z.string()).min(1).max(5),
      })
    )
    .min(1)
    .max(5),
});
const { $schema: _meta, ...answerJsonSchema } = z.toJSONSchema(answerSchema);

const SYSTEM = `You suggest blog post topics for a builder, based only on the facts given.
- Propose 1 to 5 distinct topics, best first. Each must be worth reading for someone outside the team.
- Each topic uses one or more facts by id. A fact can appear in more than one topic.
- Title: plain, specific, no clickbait, no numbers that are not in the facts. Angle: one or two sentences on what the post would argue or teach.
- Never claim a change caused a metric to move.`;

export async function proposeTopics(llm: Llm, facts: Fact[], voice: string): Promise<Topic[]> {
  const listing = facts.map((f) => `- ${f.id}: ${describeFact(f)}${f.early_signal ? " [early signal]" : ""}\n  shipped: ${f.shipped.map((s) => s.title).join("; ") || "(nothing listed)"}`);
  const answer = await llm.generate({
    system: SYSTEM,
    prompt: [voice ? `VOICE:\n${voice.trim()}` : "", `FACTS:\n${listing.join("\n")}`, "Suggest topics."].filter(Boolean).join("\n\n"),
    schema: answerJsonSchema,
  });
  const parsed = answerSchema.safeParse(answer);
  if (!parsed.success) throw new Error(`The model's topics did not match the expected shape:\n${z.prettifyError(parsed.error)}`);

  const byId = new Map(facts.map((f) => [f.id, f]));
  const topics = parsed.data.topics
    .map((t) => ({ title: t.title, angle: t.angle, facts: t.fact_ids.map((id) => byId.get(id)).filter((f): f is Fact => !!f) }))
    .filter((t) => t.facts.length > 0)
    .map((t, i) => ({ id: i + 1, ...t }));

  // If the model's ids were unusable, fall back to one topic per fact.
  return topics.length
    ? topics
    : facts.slice(0, 5).map((f, i) => ({ id: i + 1, title: describeFact(f), angle: "What moved, and what shipped alongside it.", facts: [f] }));
}
