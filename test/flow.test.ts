import { describe, expect, it } from "vitest";
import { parseDraftFile, renderDraftFile } from "../src/draftFile.js";
import type { Github, Issue, PullRequest } from "../src/github/api.js";
import { handleEvent, parseCommand, type FlowDeps } from "../src/github/flow.js";
import { readState } from "../src/github/topicsIssue.js";
import { BODY_OK, fakeLlm, setupProject } from "./helpers.js";

/** An in-memory GitHub: branches of files, issues, pulls, comments, statuses. */
function fakeGithub(writers = ["owner"]) {
  const branches = new Map<string, Map<string, string>>([["main", new Map()]]);
  const issues = new Map<number, Issue>();
  const pulls = new Map<number, PullRequest & { files: string[] }>();
  const comments: Array<{ n: number; body: string }> = [];
  const statuses: Array<{ sha: string; state: string }> = [];
  let next = 1;
  let commit = 0;
  const sha = () => `sha${++commit}`;
  const files = (b: string) => branches.get(b) ?? new Map<string, string>();

  const gh = {
    defaultBranch: async () => "main",
    canWrite: async (u: string) => writers.includes(u),
    getIssue: async (n: number) => issues.get(n)!,
    createIssue: async (title: string, body: string, labels: string[]) => {
      const issue: Issue = { number: next++, title, body, state: "open", labels: labels.map((name) => ({ name })) };
      issues.set(issue.number, issue);
      return issue;
    },
    updateIssue: async (n: number, patch: Partial<Issue>) => Object.assign(issues.get(n)!, patch),
    comment: async (n: number, body: string) => void comments.push({ n, body }),
    openIssuesWithLabel: async () => [...issues.values()].filter((i) => i.state === "open"),
    getPull: async (n: number) => pulls.get(n)!,
    pullFiles: async (n: number) => pulls.get(n)!.files.map((filename) => ({ filename, status: "added" })),
    createPull: async (title: string, head: string, base: string) => {
      const pr = { number: next++, html_url: "", merged: false, head: { ref: head, sha: "" }, base: { ref: base }, files: [...files(head).keys()] };
      pulls.set(pr.number, pr);
      return pr;
    },
    branchSha: async () => "base-sha",
    branchExists: async (b: string) => branches.has(b),
    createBranch: async (b: string) => void branches.set(b, new Map(files("main"))),
    getFile: async (path: string, ref: string) => {
      const text = files(ref).get(path);
      return text === undefined ? null : { text, sha: `blob-${path}` };
    },
    putFile: async (path: string, branch: string, text: string) => {
      files(branch).set(path, text);
      if (!branches.has(branch)) branches.set(branch, new Map([[path, text]]));
      return sha();
    },
    deleteFile: async (path: string, branch: string) => void files(branch).delete(path),
    setStatus: async (s: string, state: string) => void statuses.push({ sha: s, state }),
  };
  return { gh: gh as unknown as Github, branches, issues, pulls, comments, statuses };
}

async function deps(llm = fakeLlm(), writers?: string[]) {
  const { loaded } = await setupProject();
  const g = fakeGithub(writers);
  const d: FlowDeps = { gh: g.gh, llm, loaded, today: "2026-12-01", log: () => {} };
  return { d, g, llm };
}

const comment = (n: number, body: string, login = "owner", isPr = false) => ({
  comment: { body, user: { login } },
  issue: { number: n, ...(isPr ? { pull_request: {} } : {}) },
});

describe("parseCommand", () => {
  it("reads commands and ignores other comments", () => {
    expect(parseCommand("/shipnotes draft 2")).toEqual({ name: "draft", arg: "2" });
    expect(parseCommand("/shipnotes rewrite shorter\nand warmer")).toEqual({ name: "rewrite", arg: "shorter\nand warmer" });
    expect(parseCommand("looks good to me")).toBeNull();
  });
});

describe("GitHub flow", () => {
  it("schedule → topics Issue with hidden state; same period is not repeated", async () => {
    const { d, g } = await deps();
    const first = await handleEvent(d, "schedule", {});
    expect(first.ok).toBe(true);
    const issue = g.issues.get(1)!;
    expect(issue.body).toContain("- [ ] **1. A faster homepage");
    expect(readState(issue.body)?.topics).toHaveLength(2);

    await handleEvent(d, "schedule", {});
    expect(g.issues.size).toBe(1);
  });

  it("/shipnotes draft 1 → branch, draft file with facts, PR, passing status, ticked box", async () => {
    const { d, g } = await deps();
    await handleEvent(d, "schedule", {});
    const result = await handleEvent(d, "issue_comment", comment(1, "/shipnotes draft 1"));
    expect(result.ok).toBe(true);

    const pr = g.pulls.get(2)!;
    expect(pr.head.ref).toBe("shipnotes/2026-12-01-a-faster-homepage-for-guests-on-slow-networks");
    const path = pr.files[0]!;
    expect(path).toBe("drafts/2026-12-01-a-faster-homepage-for-guests-on-slow-networks.md");
    const file = parseDraftFile(g.branches.get(pr.head.ref)!.get(path)!);
    expect(file.meta.topic_issue).toBe(1);
    expect(file.meta.facts).toHaveLength(2);
    expect(g.statuses.at(-1)?.state).toBe("success");
    expect(g.issues.get(1)!.body).toContain("- [x] **1. A faster homepage for guests on slow networks** → #2");
    expect(g.branches.get("main")!.size).toBe(0); // nothing lands on main before merge
  });

  it("ticking a box drafts that topic", async () => {
    const { d, g } = await deps();
    await handleEvent(d, "schedule", {});
    const issue = g.issues.get(1)!;
    issue.body = issue.body!.replace("- [ ] **1.", "- [x] **1.");
    await handleEvent(d, "issues", { action: "edited", sender: { login: "owner" }, issue: { number: 1, labels: [{ name: "shipnotes" }] } });
    expect(g.pulls.size).toBe(1);
    expect(readState(g.issues.get(1)!.body)?.drafted).toEqual({ "1": 2 });
  });

  it("ignores commands from people without write access", async () => {
    const { d, g, llm } = await deps();
    await handleEvent(d, "schedule", {});
    const calls = llm.calls.length;
    await handleEvent(d, "issue_comment", comment(1, "/shipnotes draft 1", "stranger"));
    expect(g.pulls.size).toBe(0);
    expect(llm.calls.length).toBe(calls); // no Claude usage spent
  });

  it("does not open a PR when the draft fails the fact-check", async () => {
    const { d, g } = await deps(fakeLlm([`${BODY_OK} Bookings rose 47%.`]));
    await handleEvent(d, "schedule", {});
    const result = await handleEvent(d, "issue_comment", comment(1, "/shipnotes draft 1"));
    expect(result.ok).toBe(false);
    expect(g.pulls.size).toBe(0);
    expect(g.comments.at(-1)?.body).toContain("47");
  });

  it("/shipnotes rewrite on the PR updates the draft on its branch", async () => {
    const llm = fakeLlm([BODY_OK, `Shorter now. Load time fell from 6.3 s to 2.7 s. ${"Faster for guests on slow phones. ".repeat(6)}`]);
    const { d, g } = await deps(llm);
    await handleEvent(d, "schedule", {});
    await handleEvent(d, "issue_comment", comment(1, "/shipnotes draft 1"));
    const result = await handleEvent(d, "issue_comment", comment(2, "/shipnotes rewrite make it shorter", "owner", true));
    expect(result.ok).toBe(true);
    const pr = g.pulls.get(2)!;
    expect(g.branches.get(pr.head.ref)!.get(pr.files[0]!)).toContain("Shorter now.");
    expect(llm.calls.at(-1)!.prompt).toContain("EDIT REQUEST:\nmake it shorter");
  });

  it("a person's push with a made-up number fails the check", async () => {
    const { d, g } = await deps();
    await handleEvent(d, "schedule", {});
    await handleEvent(d, "issue_comment", comment(1, "/shipnotes draft 1"));
    const pr = g.pulls.get(2)!;
    const path = pr.files[0]!;
    const file = parseDraftFile(g.branches.get(pr.head.ref)!.get(path)!);
    g.branches.get(pr.head.ref)!.set(path, renderDraftFile({ ...file, body: `${file.body}\n\nWe now have 900 happy guests.` }));
    pr.head.sha = pr.head.ref; // fake: read the file at the branch

    const result = await handleEvent(d, "pull_request", { action: "synchronize", pull_request: pr });
    expect(result.ok).toBe(false);
    expect(g.statuses.at(-1)?.state).toBe("failure");
    expect(g.comments.at(-1)?.body).toContain("900");
  });

  it("merge → moved to published/ with draft: false; closing unmerged publishes nothing", async () => {
    const { d, g } = await deps();
    await handleEvent(d, "schedule", {});
    await handleEvent(d, "issue_comment", comment(1, "/shipnotes draft 1"));
    const pr = g.pulls.get(2)!;
    const path = pr.files[0]!;

    await handleEvent(d, "pull_request", { action: "closed", pull_request: pr });
    expect(g.branches.get("main")!.size).toBe(0);

    g.branches.get("main")!.set(path, g.branches.get(pr.head.ref)!.get(path)!); // the merge
    pr.merged = true;
    const result = await handleEvent(d, "pull_request", { action: "closed", pull_request: pr });
    expect(result.ok).toBe(true);
    const main = g.branches.get("main")!;
    expect(main.has(path)).toBe(false);
    const published = parseDraftFile(main.get(path.replace("drafts/", "published/"))!);
    expect(published.meta.draft).toBe(false);
    expect(published.meta.published_at).toBe("2026-12-01");
    expect(g.comments.some((c) => c.n === 1 && c.body.startsWith("Published from #2"))).toBe(true);
  });
});

describe("channels and footer", () => {
  it("adds LinkedIn and Substack versions with UTM links and the footer, and hands them back on merge", async () => {
    const { loaded } = await setupProject(
      `site: { post_url: "https://vikthurr.com/blog/{slug}" }\nchannels: [linkedin, substack]\n`,
      `author: { name: Test, footer: "Drafted from real project data. Why I work this way: [The Era of Builders](https://vikthurr.com/blog/era-of-builders)." }`
    );
    const g = fakeGithub();
    const d: FlowDeps = { gh: g.gh, llm: fakeLlm(), loaded, today: "2026-12-01", log: () => {} };
    await handleEvent(d, "schedule", {});
    await handleEvent(d, "issue_comment", comment(1, "/shipnotes draft 1"));

    const pr = g.pulls.get(2)!;
    const branch = g.branches.get(pr.head.ref)!;
    expect(pr.files.sort()).toEqual([
      "drafts/2026-12-01-a-faster-homepage-for-guests-on-slow-networks.linkedin.md",
      "drafts/2026-12-01-a-faster-homepage-for-guests-on-slow-networks.md",
      "drafts/2026-12-01-a-faster-homepage-for-guests-on-slow-networks.substack.md",
    ]);
    const linkedin = branch.get("drafts/2026-12-01-a-faster-homepage-for-guests-on-slow-networks.linkedin.md")!;
    expect(linkedin).toContain(
      "Full post: https://vikthurr.com/blog/a-faster-homepage-for-guests-on-slow-networks?utm_source=linkedin&utm_medium=post&utm_campaign=a_faster_homepage_for_guests_on_slow_networks"
    );
    expect(branch.get(pr.files.find((f) => f.endsWith("networks.md"))!)).toContain("[The Era of Builders]");

    // A person adds a made-up number to the LinkedIn version: the check catches it.
    branch.set("drafts/2026-12-01-a-faster-homepage-for-guests-on-slow-networks.linkedin.md", `${linkedin}\nWe now have 900 bookings.`);
    pr.head.sha = pr.head.ref;
    expect((await handleEvent(d, "pull_request", { action: "synchronize", pull_request: pr })).ok).toBe(false);
    branch.set("drafts/2026-12-01-a-faster-homepage-for-guests-on-slow-networks.linkedin.md", linkedin);

    // Merge: all three move to published/, and the PR gets paste-ready text.
    for (const f of pr.files) g.branches.get("main")!.set(f, branch.get(f)!);
    pr.merged = true;
    expect((await handleEvent(d, "pull_request", { action: "closed", pull_request: pr })).ok).toBe(true);
    const main = [...g.branches.get("main")!.keys()].sort();
    expect(main).toEqual(pr.files.map((f) => f.replace("drafts/", "published/")).sort());
    expect(g.comments.at(-1)?.body).toContain("linkedin — ready to paste");
  });
});
