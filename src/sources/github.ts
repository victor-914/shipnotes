import type { Shipped } from "../spec.js";

interface GithubCommit {
  sha: string;
  html_url: string;
  parents: unknown[];
  commit: { message: string; author: { date: string } | null };
}

// Commits in the period, as "shipped" items. Merge commits are skipped: the
// commits they bring in are listed on their own.
export async function collectCommits(
  repo: string,
  period: { from: string; to: string },
  token: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<Shipped[]> {
  const until = new Date(`${period.to}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 1);
  const shipped: Shipped[] = [];

  for (let page = 1; page <= 5; page++) {
    const url = new URL(`https://api.github.com/repos/${repo}/commits`);
    url.searchParams.set("since", `${period.from}T00:00:00Z`);
    url.searchParams.set("until", until.toISOString());
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const res = await fetchImpl(url, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub commits for ${repo} answered ${res.status}`);
    }
    const commits = (await res.json()) as GithubCommit[];
    for (const c of commits) {
      const title = c.commit.message.split("\n")[0]?.trim() ?? "";
      if (c.parents.length > 1 || !title || /^merge\b/i.test(title)) continue;
      shipped.push({
        title: title.slice(0, 200),
        date: (c.commit.author?.date ?? `${period.to}T00:00:00Z`).slice(0, 10),
        ref: `${repo}@${c.sha.slice(0, 7)}`,
        url: c.html_url,
      });
    }
    if (commits.length < 100) break;
  }
  return shipped;
}
