// A small GitHub REST client: only what shipnotes needs, on plain fetch.

export interface GithubContext {
  token: string;
  repo: string; // owner/name
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface Issue {
  number: number;
  body: string | null;
  title: string;
  state: string;
  labels: Array<{ name: string } | string>;
  pull_request?: unknown;
}

export interface PullRequest {
  number: number;
  html_url: string;
  merged: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const fromB64 = (data: string) => Buffer.from(data, "base64").toString("utf8");

export function github(ctx: GithubContext) {
  const base = (ctx.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
  const f = ctx.fetchImpl ?? fetch;
  const repoPath = `/repos/${ctx.repo}`;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await f(`${base}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${ctx.token}`,
        "x-github-api-version": "2022-11-28",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new GithubError(`GitHub ${method} ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  return {
    request,

    async defaultBranch(): Promise<string> {
      return (await request<{ default_branch: string }>("GET", repoPath)).default_branch;
    },

    async canWrite(user: string): Promise<boolean> {
      try {
        const r = await request<{ permission: string }>("GET", `${repoPath}/collaborators/${encodeURIComponent(user)}/permission`);
        return ["admin", "maintain", "write"].includes(r.permission);
      } catch (err) {
        if (err instanceof GithubError && (err.status === 404 || err.status === 403)) return false;
        throw err;
      }
    },

    getIssue: (n: number) => request<Issue>("GET", `${repoPath}/issues/${n}`),
    createIssue: (title: string, body: string, labels: string[]) => request<Issue>("POST", `${repoPath}/issues`, { title, body, labels }),
    updateIssue: (n: number, patch: { body?: string; state?: "open" | "closed"; state_reason?: string }) =>
      request<Issue>("PATCH", `${repoPath}/issues/${n}`, patch),
    comment: (n: number, body: string) => request<unknown>("POST", `${repoPath}/issues/${n}/comments`, { body }),
    openIssuesWithLabel: (label: string) =>
      request<Issue[]>("GET", `${repoPath}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=50`),

    getPull: (n: number) => request<PullRequest>("GET", `${repoPath}/pulls/${n}`),
    pullFiles: (n: number) => request<Array<{ filename: string; status: string }>>("GET", `${repoPath}/pulls/${n}/files?per_page=100`),
    createPull: (title: string, head: string, baseRef: string, body: string) =>
      request<PullRequest>("POST", `${repoPath}/pulls`, { title, head, base: baseRef, body }),

    async branchSha(branch: string): Promise<string> {
      return (await request<{ object: { sha: string } }>("GET", `${repoPath}/git/ref/heads/${branch}`)).object.sha;
    },
    async branchExists(branch: string): Promise<boolean> {
      try {
        await request("GET", `${repoPath}/git/ref/heads/${branch}`);
        return true;
      } catch (err) {
        if (err instanceof GithubError && err.status === 404) return false;
        throw err;
      }
    },
    createBranch: (branch: string, sha: string) => request("POST", `${repoPath}/git/refs`, { ref: `refs/heads/${branch}`, sha }),

    async getFile(path: string, ref: string): Promise<{ text: string; sha: string } | null> {
      try {
        const r = await request<{ content: string; sha: string }>("GET", `${repoPath}/contents/${path}?ref=${encodeURIComponent(ref)}`);
        return { text: fromB64(r.content), sha: r.sha };
      } catch (err) {
        if (err instanceof GithubError && err.status === 404) return null;
        throw err;
      }
    },
    async putFile(path: string, branch: string, text: string, message: string, sha?: string): Promise<string> {
      const r = await request<{ commit: { sha: string } }>("PUT", `${repoPath}/contents/${path}`, {
        message,
        content: b64(text),
        branch,
        ...(sha ? { sha } : {}),
      });
      return r.commit.sha;
    },
    deleteFile: (path: string, branch: string, sha: string, message: string) =>
      request("DELETE", `${repoPath}/contents/${path}`, { message, sha, branch }),

    /** Commit status shown on the PR; can be made a required check. */
    setStatus: (sha: string, state: "success" | "failure", description: string) =>
      request("POST", `${repoPath}/statuses/${sha}`, { state, context: "shipnotes/fact-check", description: description.slice(0, 140) }),
  };
}

export type Github = ReturnType<typeof github>;
