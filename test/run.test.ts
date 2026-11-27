import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkableText, parseDraftFile } from "../src/draftFile.js";
import { factCheck } from "../src/factcheck.js";
import { run } from "../src/run.js";
import { BODY_OK, fakeLlm, setupProject } from "./helpers.js";

describe("run (local one-shot)", () => {
  it("writes a draft file that carries its own facts and re-checks clean", async () => {
    const { loaded } = await setupProject();
    const llm = fakeLlm();
    const outcome = await run({ loaded, llm, today: "2026-11-30" });

    expect(outcome.status).toBe("drafted");
    if (outcome.status !== "drafted") return;
    const text = await readFile(outcome.published[0]!.location, "utf8");
    const file = parseDraftFile(text);
    expect(file.meta.draft).toBe(true);
    expect(file.meta.facts.map((f) => f.metric)).toEqual(["lcp_seconds", "lighthouse_performance"]);
    expect(factCheck(checkableText(file), file.meta.facts).ok).toBe(true);
    // The private metric never reached the model.
    expect(llm.calls[0]!.prompt).not.toMatch(/paid.bookings/i);
  });

  it("retries once naming the bad numbers, then fails", async () => {
    const { loaded } = await setupProject();
    const llm = fakeLlm([`${BODY_OK} Bookings rose 47%.`]);
    const outcome = await run({ loaded, llm });
    expect(outcome.status).toBe("fact-check-failed");
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]!.prompt).toContain("47");
  });

  it("recovers when the retry drops the made-up number", async () => {
    const { loaded } = await setupProject();
    const outcome = await run({ loaded, llm: fakeLlm([`${BODY_OK} Bookings rose 47%.`, BODY_OK]), dryRun: true });
    expect(outcome.status).toBe("drafted");
  });

  it("catches a number a person adds when editing the file later", async () => {
    const { loaded } = await setupProject();
    const outcome = await run({ loaded, llm: fakeLlm(), dryRun: true });
    if (outcome.status !== "drafted") throw new Error("expected a draft");
    const edited = { ...outcome.file, body: `${outcome.file.body}\n\nRevenue doubled to 4,500,000.` };
    expect(factCheck(checkableText(edited), edited.meta.facts).unverified).toEqual(["4,500,000"]);
  });
});
