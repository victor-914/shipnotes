import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import type { Llm, LlmRequest } from "../src/llm/claudeCode.js";

export const BODY_OK = `Our homepage Lighthouse score went from 53 to 73 in the week we shipped smaller images.
Load time fell from 6.3 s to 2.7 s. ${"Guests on slow phone networks now see listings sooner. ".repeat(5)}`;

/** Stands in for Claude: answers topic requests and draft requests with canned output. */
export function fakeLlm(bodies: string[] = [BODY_OK]): Llm & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  let drafts = 0;
  return {
    calls,
    async generate(req) {
      calls.push(req);
      if (req.prompt.endsWith("Suggest topics.")) {
        return {
          topics: [
            { title: "A faster homepage for guests on slow networks", angle: "What we cut, and what it changed.", fact_ids: ["casmir-realty/lcp_seconds", "casmir-realty/lighthouse_performance"] },
            { title: "Why Lighthouse is a yardstick, not a goal", angle: "Lab scores versus real guests.", fact_ids: ["casmir-realty/lighthouse_performance"] },
          ],
        };
      }
      if (req.prompt.includes("CHANNEL: A LinkedIn post")) {
        return { text: "Our homepage now loads in 2.7 s, down from 6.3 s. Here is what we cut and why it matters for guests on slow phones. What would you cut first?" };
      }
      if (req.prompt.includes("CHANNEL: A newsletter")) {
        return { text: "This week I wrote about making the Casmir homepage faster for guests on slow networks: what changed and what it does not prove yet." };
      }
      const body = bodies[Math.min(drafts, bodies.length - 1)];
      drafts++;
      return {
        title: "A faster homepage for guests on slow networks",
        excerpt: "Our homepage got much faster in one week. Here is what changed.",
        body,
        tags: ["performance", "outcomes"],
      };
    },
  };
}

export async function setupProject(extraConfig = "", authorLine = "author: { name: Test }") {
  const dir = await mkdtemp(join(tmpdir(), "shipnotes-"));
  await writeFile(join(dir, "outcomes.json"), await readFile(new URL("../examples/outcomes.json", import.meta.url), "utf8"));
  await writeFile(
    join(dir, "shipnotes.config.yaml"),
    `${authorLine}\nprojects:\n  - outcomes: { file: ./outcomes.json }\n${extraConfig}`
  );
  return { dir, loaded: await loadConfig(join(dir, "shipnotes.config.yaml")) };
}
