# Tutorial: from your project's numbers to a published post

By the end of this tutorial:

- your project publishes its weekly numbers in a standard format (an **Outcome Snapshot**);
- a private GitHub repo of yours runs shipnotes every Monday, suggests post ideas from what moved, and drafts the one you pick as a pull request;
- every number in a draft is checked against your data before you can merge;
- merging publishes the post, with LinkedIn and Substack versions ready to paste;
- optionally, you have a private dashboard of all your projects' outcomes.

Allow about 45 minutes. Every command is meant to be run in your own terminal. Replace `you` with your GitHub username and `my-app` with your project's name.

> **Worked example.** Each part shows how it was done for **[Casmir Realty](https://casmirshortlets.com)** (a shortlet booking site with an Express/TypeScript API and its own analytics) and **[vikthurr.com](https://vikthurr.com)** (the author's Next.js portfolio and blog). Look for the 🏠 boxes.

---

## Contents

0. [Before you start](#0-before-you-start)
1. [Publish your project's numbers](#1-publish-your-projects-numbers)
2. [Create your content repo](#2-create-your-content-repo)
3. [Your first post](#3-your-first-post)
4. [Get posts onto your blog](#4-get-posts-onto-your-blog)
5. [Your weekly routine](#5-your-weekly-routine)
6. [Optional: a private outcomes dashboard](#6-optional-a-private-outcomes-dashboard)
7. [Troubleshooting](#7-troubleshooting)

---

## 0. Before you start

You need:

| What | Check it with | Get it |
|---|---|---|
| A GitHub account and the `gh` CLI, logged in | `gh auth status` | [cli.github.com](https://cli.github.com), then `gh auth login` |
| Node.js 22 or newer | `node -v` | [nodejs.org](https://nodejs.org) |
| Claude Code, logged in to a Claude subscription (or an Anthropic API key) | `claude --version` | `npm install -g @anthropic-ai/claude-code`, then run `claude` once to log in |
| A project with numbers you can count (visitors, sign-ups, bookings, load time…) | | |
| Somewhere to publish posts (a blog, a site, or just Markdown files) | | |
| `openssl` (to make keys) and, optionally, `jq` (to read JSON) | `openssl version` | Preinstalled on macOS and most Linux |

Run all three checks now:

```sh
gh auth status
node -v
claude --version
```

> `gh` needs the `repo` and `workflow` scopes, because you'll create a repo with a workflow file. If a later command says it lacks a scope, run `gh auth refresh -s repo,workflow`.

### How the pieces fit

```
your project                      your content repo (private)                      you
────────────                      ───────────────────────────                      ───
outcomes.json  ──── every Monday ───►  shipnotes (GitHub Action)
(numbers + the                          1. reads the snapshot + commits
 period before)                         2. finds what moved            ──►  "Post ideas" Issue
                                        3. Claude drafts the topic you pick ──►  draft pull request
                                        4. code checks every number            edit / comment
                                        5. on merge: published/ + channels ◄── merge = approve
```

Three repos are involved, and only one is yours to work in:

| Repo | What it is |
|---|---|
| [`victor-914/shipnotes`](https://github.com/victor-914/shipnotes) | The tool (code, GitHub Action, spec). You never edit it. |
| [`victor-914/shipnotes-template`](https://github.com/victor-914/shipnotes-template) | The starter kit you copy once. |
| `you/my-shipnotes` | **Your content repo**: config, voice, ideas, drafts, published posts. |

---

## 1. Publish your project's numbers

shipnotes never touches your database. Your project publishes a small JSON document, an [Outcome Snapshot](../SPEC.md), and shipnotes reads it.

### 1.1 Choose your metrics

Pick:

- **one north star**: the number that matters most (paid bookings, active users, revenue);
- **5–10 supporting metrics**: what leads to it (visitors, sign-ups, checkouts started, load time);
- for each, **which way is good** (`better: "higher"` or `"lower"`), and whether it may appear in **public posts** (`public: true`). Everything is private unless you say otherwise. Private metrics never reach the model.

Every metric needs a `previous` value (the same-length period just before) or shipnotes can't tell whether it moved.

> 🏠 **Casmir Realty** reports: paid bookings (north star, **private**), visitors, sessions, page views, visitors who opened a listing, visitors who clicked Book, checkouts started, paid bookings per 100 visitors, live listings, and visitors from the top 5 sources. Only the ones listed in its `OUTCOMES_PUBLIC_METRICS` setting are public.

### 1.2 Option A: a static file (no code, 5 minutes)

Good for a first try, or for numbers you copy from a dashboard by hand.

Create `outcomes.json`:

```json
{
  "spec": "outcomes/0.1",
  "project": { "name": "My App", "slug": "my-app", "url": "https://myapp.com" },
  "period": { "from": "2026-11-20", "to": "2026-11-26" },
  "north_star": "signups",
  "metrics": [
    { "name": "signups", "label": "Sign-ups", "value": 48, "previous": 31, "public": true },
    { "name": "visitors", "label": "Visitors", "value": 2140, "previous": 1810, "public": true },
    { "name": "lcp_seconds", "label": "Homepage load time", "value": 2.7, "previous": 6.3, "unit": "seconds", "better": "lower", "public": true },
    { "name": "revenue", "label": "Revenue", "value": 900000, "previous": 610000, "unit": "currency", "currency": "NGN" }
  ],
  "shipped": [
    { "title": "Smaller images and fonts on the homepage", "date": "2026-11-24" }
  ]
}
```

Check it:

```sh
npx -y github:victor-914/shipnotes validate outcomes.json
```

You should see `OK: My App, 4 metrics (3 public)`. You'll put this file in your content repo in [step 2.5](#25-configure-shipnotes).

> The first `npx` run takes a minute: it downloads and builds shipnotes. Later runs are cached.

### 1.3 Option B: an endpoint in your app (the real thing)

Your app computes the numbers itself, every time it's asked. The convention is `GET /.well-known/outcomes.json`, protected by a **read-only key**.

**1. Make a key** (keep this terminal open; you'll use the key twice):

```sh
openssl rand -hex 32
```

**2. Add the endpoint.** In Express with TypeScript:

```ts
// outcomes.ts
import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const DAY = 24 * 60 * 60 * 1000;

function keyMatches(header: string | undefined, key: string): boolean {
  const presented = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b); // constant-time compare
}

// The last `days` complete days, ending at midnight UTC today.
function period(days: number, now = new Date()) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - days * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from, to, label: { from: iso(from), to: iso(new Date(to.getTime() - 1)) } };
}

// Replace with your own queries: return totals for [from, to).
async function totals(from: Date, to: Date) {
  return {
    signups: await db.users.countDocuments({ createdAt: { $gte: from, $lt: to } }),
    visitors: await countUniqueVisitors(from, to),
  };
}

export async function getOutcomes(req: Request, res: Response) {
  const key = process.env.OUTCOMES_API_KEY;
  if (!key) return res.status(404).json({ error: "Not found" }); // feature off until a key is set
  if (!keyMatches(req.headers.authorization, key)) return res.status(401).json({ error: "Unauthorized" });

  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 45);
  const p = period(days);
  const before = { from: new Date(p.from.getTime() - days * DAY), to: p.from };
  const [now, prev] = await Promise.all([totals(p.from, p.to), totals(before.from, before.to)]);
  const isPublic = (name: string) => (process.env.OUTCOMES_PUBLIC_METRICS ?? "").split(",").includes(name);

  res.set("Cache-Control", "private, max-age=300").json({
    spec: "outcomes/0.1",
    project: { name: "My App", slug: "my-app", url: "https://myapp.com" },
    period: p.label,
    north_star: "signups",
    metrics: [
      { name: "signups", label: "Sign-ups", value: now.signups, previous: prev.signups, public: isPublic("signups") },
      { name: "visitors", label: "Visitors", value: now.visitors, previous: prev.visitors, public: isPublic("visitors") },
    ],
    shipped: [],
    generated_at: new Date().toISOString(),
  });
}

// app.ts, before your 404 handler:
// app.get("/.well-known/outcomes.json", getOutcomes);
```

Three rules worth keeping from this example:

- **Totals only.** Never return names, emails or anything about one person.
- **No key set, no endpoint** (404). Merging the code exposes nothing until you configure it.
- **Private by default.** A metric is public only if you list it in `OUTCOMES_PUBLIC_METRICS`.

For a Next.js version, a CI-generated file, and how to fill `shipped`, see [Publishing a snapshot](publishing-outcomes.md).

**3. Configure and deploy.** Set these environment variables wherever your app runs (Heroku/Render/Fly config, a Kubernetes Secret, `.env` on a VPS):

```sh
OUTCOMES_API_KEY=<the key from step 1>
OUTCOMES_PUBLIC_METRICS=visitors,signups
```

Deploy, then **check that the new version is actually running**: it's easy to merge and still be serving the old build.

**4. Test it** from your terminal:

```sh
KEY=<the key>
curl -s https://api.myapp.com/.well-known/outcomes.json                                   # expect 401 (or 404 if no key is set)
curl -s -H "Authorization: Bearer $KEY" https://api.myapp.com/.well-known/outcomes.json | jq '.period, .metrics[].name'
curl -s -H "Authorization: Bearer $KEY" https://api.myapp.com/.well-known/outcomes.json -o outcomes.json
npx -y github:victor-914/shipnotes validate outcomes.json
```

> 🏠 **Casmir Realty** builds the snapshot from its first-party analytics (event counts, a booking funnel, traffic sources) in Lagos days. Its endpoint answers both `/.well-known/outcomes.json` and `/api/v1/outcomes`, and `?days=` from 1 to 45. The key lives in the API's encrypted Secret. One lesson from setting it up: the merge built a new image, but the cluster kept running the old one until the image tag was bumped by hand. If your endpoint answers "Route not found" after a merge, check which version is live.

---

## 2. Create your content repo

### 2.1 Create it from the template

```sh
gh repo create my-shipnotes --private --template victor-914/shipnotes-template --clone
cd my-shipnotes
ls -A
```

You'll see: `.github/workflows/shipnotes.yml`, `shipnotes.config.yaml`, `VOICE.md`, `drafts/`, `published/`, `CLAUDE.md`, `.claude/skills/shipnotes/`, `README.md`.

**Why private?** Draft pull requests contain unapproved writing. Keep them private until you merge; publish the posts wherever you like. A private repo gets 2,000 free Actions minutes a month; a shipnotes run takes 1–3 minutes.

### 2.2 Let Actions open pull requests

New repos don't let workflows create pull requests. Turn it on:

```sh
echo '{"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}' \
  | gh api -X PUT repos/you/my-shipnotes/actions/permissions/workflow --input -

gh api repos/you/my-shipnotes/actions/permissions/workflow
```

The second command should print `"default_workflow_permissions":"write","can_approve_pull_request_reviews":true`. (Same thing in the browser: Settings → Actions → General → Workflow permissions → **Read and write** + **Allow GitHub Actions to create and approve pull requests**.)

### 2.3 Give it access to Claude

shipnotes writes with **your own Claude Code**. In GitHub Actions it signs in with a long-lived token from your subscription.

Do this in a terminal of its own, so the token doesn't end up in a log or a chat:

```sh
claude setup-token
```

A browser opens; approve it. The terminal prints a token starting with `sk-ant-oat`. Copy it, then:

```sh
# macOS: read the clipboard and strip the line breaks the terminal adds when the token wraps
pbpaste | tr -d '[:space:]' | gh secret set CLAUDE_CODE_OAUTH_TOKEN -R you/my-shipnotes

# Linux (X11): xclip -o -selection clipboard | tr -d '[:space:]' | gh secret set CLAUDE_CODE_OAUTH_TOKEN -R you/my-shipnotes
```

Then clear your clipboard and screen:

```sh
echo -n | pbcopy; clear
```

> **Why the `tr`?** A pasted token that wrapped across lines carries line breaks, and Claude rejects it with `401 OAuth access token is invalid`. This is the most common setup failure.

Prefer an API key? Set `ANTHROPIC_API_KEY` instead and pass it to the action's `anthropic-api-key` input.

### 2.4 Other secrets (only if you need them)

| Secret | Needed when | How |
|---|---|---|
| Your project's key, e.g. `MYAPP_OUTCOMES_KEY` | You used [Option B](#13-option-b-an-endpoint-in-your-app-the-real-thing) | `gh secret set MYAPP_OUTCOMES_KEY -R you/my-shipnotes` and paste the key from 1.3 |
| `SHIPNOTES_READ_TOKEN` | You list **private** project repos under `repos:` (to turn their commits into "what shipped") | Create a fine-grained token at github.com → Settings → Developer settings → Fine-grained tokens: *Repository access* = only those repos; *Permissions* = **Contents: Read-only** (Metadata is added automatically). Then `gh secret set SHIPNOTES_READ_TOKEN -R you/my-shipnotes`. |

For every secret your config uses as `${NAME}`, also pass it to the action in `.github/workflows/shipnotes.yml`:

```yaml
      - uses: victor-914/shipnotes@v0
        with:
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          read-token: ${{ secrets.SHIPNOTES_READ_TOKEN }}
        env:
          MYAPP_OUTCOMES_KEY: ${{ secrets.MYAPP_OUTCOMES_KEY }}
```

Check what's set (values are never shown):

```sh
gh secret list -R you/my-shipnotes
```

### 2.5 Configure shipnotes

Open `shipnotes.config.yaml`. A complete example (every option is in the [config reference](config.md)):

```yaml
author:
  name: Your Name
  voice: ./VOICE.md
  footer: "Drafted from my projects' real data with [shipnotes](https://github.com/victor-914/shipnotes), approved by me."

site:
  post_url: https://myblog.com/blog/{slug}   # where approved posts will live

channels: [linkedin, substack]              # paste-ready versions in every draft PR

projects:
  # Option B: the endpoint
  - outcomes:
      url: https://api.myapp.com/.well-known/outcomes.json
      headers: { Authorization: "Bearer ${MYAPP_OUTCOMES_KEY}" }
    repos: [you/my-app]                     # commits in the period become "what shipped"

  # Option A instead: the file, committed next to this config
  # - outcomes:
  #     file: ./outcomes.json

rules:
  min_change_pct: 10   # a metric must move at least 10% to become a topic
  min_count: 30        # smaller counts are called an "early signal", not a trend
  max_stories: 5

publish: []            # see part 4
```

Then edit **`VOICE.md`**: how you write, who you write for, words you never use. Drafts follow it closely; ten honest lines beat a page of adjectives.

If you chose Option A, copy your file in: `cp ../outcomes.json .`

Commit and push:

```sh
git add -A
git commit -m "Configure shipnotes"
git push
```

> 🏠 **vikthurr.com's content repo** uses `post_url: https://vikthurr.com/blog/{slug}`, LinkedIn and Substack channels, and a footer linking to the author's manifesto post, [This Is the Era of Builders, Not Coders](https://vikthurr.com/blog/this-is-the-era-of-builders-not-coders). It started on a committed snapshot of Casmir's homepage speed work (Lighthouse 53 → 73, load time 6.3 s → 2.7 s) and switched to Casmir's live endpoint once that was deployed.

### 2.6 Optional: try it locally first

From the content repo, with your own Claude Code login:

```sh
export MYAPP_OUTCOMES_KEY=<the key>            # only for Option B
npx -y github:victor-914/shipnotes topics      # this period's post ideas, printed
npx -y github:victor-914/shipnotes run --dry-run   # a full draft + LinkedIn/Substack, printed, nothing saved
```

If `topics` says *"No public metric moved enough this period"*, either nothing moved by `min_change_pct`, nothing has a `previous`, or no metric is `public`.

---

## 3. Your first post

### 3.1 Get post ideas now (instead of waiting for Monday)

```sh
gh workflow run shipnotes -R you/my-shipnotes
sleep 10
gh run watch -R you/my-shipnotes $(gh run list -R you/my-shipnotes --limit 1 --json databaseId -q '.[0].databaseId')
gh issue list -R you/my-shipnotes
```

A new Issue titled **Post ideas: \<from\> → \<to\>** appears with up to five topics, each listing the numbers it would use:

```sh
gh issue view 1 -R you/my-shipnotes
```

### 3.2 Pick a topic

Either tick the topic's box on GitHub, or comment:

```sh
gh issue comment 1 -R you/my-shipnotes --body "/shipnotes draft 2"
```

Two to four minutes later a pull request opens, and the Issue links to it:

```sh
gh pr list -R you/my-shipnotes
```

It contains three files in `drafts/`: the post (`<date>-<slug>.md`), a `.linkedin.md` and a `.substack.md`. The post's frontmatter holds a `facts:` block: the only numbers it may contain.

Only people with write access to the repo can trigger drafting. Comments from anyone else are ignored, so nobody can spend your Claude usage.

### 3.3 Review it

```sh
gh pr checkout 2 -R you/my-shipnotes
cat drafts/*.md
```

The fact-check covers **numbers only**. Read for claims the data doesn't support: "guests book from the bus", "users love it". Keep them if they're true, cut them if not. That judgement is the point of reviewing.

### 3.4 Edit it, any way you like

Every push to the PR is fact-checked and reported as the **shipnotes/fact-check** status.

| How | Steps |
|---|---|
| **In the browser** | PR → *Files changed* → `…` on a file → *Edit file* → commit to the same branch. |
| **Locally** | Edit the files, then: `npx -y github:victor-914/shipnotes check drafts/*.md` (must print ✓), `git commit -am "Edit draft"`, `git push`. |
| **Ask shipnotes to rewrite** | `gh pr comment 2 -R you/my-shipnotes --body "/shipnotes rewrite shorter, and end with a question about December travel"`. Rewrites the post and its LinkedIn/Substack versions, then re-checks. |
| **With Claude** | Open the repo in Claude Code (or claude.ai/code) and ask: *"Open the draft in PR #2, tighten the intro and cut the bus line."* The template's `shipnotes` skill and `CLAUDE.md` teach it the rules: don't touch `facts:`, run the check before committing, never merge unless you say so. |

If you add a number that isn't in `facts:`, the check fails and lists it. Remove it, or say it in words.

Want merging blocked until the check is green? Settings → Branches → add a rule for `main` → **Require status checks** → `shipnotes/fact-check`.

### 3.5 Merge = approve

```sh
gh pr checks 2 -R you/my-shipnotes      # shipnotes/fact-check should be "pass"
gh pr merge 2 -R you/my-shipnotes --merge
```

shipnotes then moves the three files to `published/`, runs your `publish:` targets (part 4), and comments on the PR with the LinkedIn and Substack text ready to copy:

```sh
gh pr view 2 -R you/my-shipnotes --comments
```

> 🏠 **The first vikthurr.com post** was drafted from Casmir's speed numbers, then reframed in Claude as *"Speed used to be a post-launch chore. Now it's a launch requirement"*, with a hero image added to the PR. The fact-check passed on every push, and the LinkedIn and Substack links pointed at the right address because they follow the draft's file name.

---

## 4. Get posts onto your blog

Pick one.

### 4.1 By hand (fine to start)

Copy the body of `published/<date>-<slug>.md` (everything after the second `---`) into your blog's editor.

**Use the slug from the file name** (the part after the date, without `.md`). The LinkedIn and Substack versions already link to `post_url` with that slug, so a different slug means a broken link.

### 4.2 A static site that reads `published/`

If your blog is built from Markdown (Astro, Hugo, Eleventy, Next.js with MDX), point it at this repo's `published/` folder: as a git submodule, or a CI step that copies the files in. The frontmatter has `title`, `excerpt`, `date`, `tags` and `published_at`.

### 4.3 Automatically, with the `http` publisher

Give your site an endpoint that accepts a post, and shipnotes sends it on merge:

```yaml
publish:
  - type: http
    url: https://myblog.com/api/posts
    headers: { Authorization: "Bearer ${SITE_TOKEN}" }
    on_merge: draft      # "draft": lands unpublished on your site for a last look; "published": goes live
```

Add `SITE_TOKEN` as a repo secret (2.4) and pass it under `env:` in the workflow. Your endpoint must:

1. check the bearer token;
2. accept the JSON body: `title`, `slug`, `excerpt`, `body` (Markdown), `tags`, `date`, `projects`, `published`, `generator`, `facts`;
3. create the post (or update it if the slug exists);
4. answer `2xx`, ideally `{ "url": "https://myblog.com/blog/<slug>" }`, which then shows in the PR comment.

The [config reference](config.md#publish) has the exact payload.

> 🏠 **vikthurr.com** currently publishes by hand (4.1). A `POST /api/agent/posts` endpoint that saves posts as unpublished in its admin is planned, so merging will put drafts straight into the site's admin.

### LinkedIn and Substack

shipnotes doesn't post to them (neither offers a practical API for this). After each merge, copy the text from the PR comment:

- **LinkedIn:** paste as a post; attach an image if you made one.
- **Substack:** paste as a new post or note.

Their links carry UTM tags (`utm_source=linkedin`, `utm_source=substack`), so your analytics can tell which channel brought readers.

---

## 5. Your weekly routine

| When | What | Time |
|---|---|---|
| Monday 07:00 Lagos time (06:00 UTC, set in the workflow's `cron`) | A **Post ideas** Issue appears, if anything moved | 0 |
| Monday | Pick a topic, or `/shipnotes skip` | 1 min |
| Within a few minutes | Review and edit the draft PR | 10–20 min |
| When ready | Merge, then paste LinkedIn/Substack | 2 min |

Change the schedule in `.github/workflows/shipnotes.yml` (cron is in UTC). GitHub can run scheduled workflows a few minutes late, and pauses them in public repos after 60 days without activity.

---

## 6. Optional: a private outcomes dashboard

The same snapshot that feeds shipnotes can feed a private page that shows all your projects at once: this week vs last, a trend line, which metrics are public. shipnotes doesn't include one; here is the pattern used on vikthurr.com, in any stack:

1. **List your sources in environment variables**, never in the database: `OUTCOME_SOURCES=my-app=https://api.myapp.com/.well-known/outcomes.json` and one key per project (`OUTCOMES_TOKEN_MY_APP=<key>`).
2. **Fetch on page load**, server-side, with a 10-second timeout and `?days=7` or `?days=30`.
3. **Store each response** in a collection or table, unique per project + period length + period dates. Replace on refetch; never duplicate.
4. **Reuse a stored copy that's under ~10 minutes old**, so reloading doesn't hammer your apps.
5. **If a project is down, show its last stored copy and the error**, not an empty page.
6. **Draw trends from the stored copies**, oldest first.
7. **Run a weekly job that fetches and stores**, so trends fill in even on weeks you don't open the page.
8. **Put it behind your admin login.** It shows private numbers.

> 🏠 **vikthurr.com** has this at `/admin/outcomes` (Next.js + MongoDB): a north-star card per project, then every metric with this period, previous, change (green or red depending on which way is good), a sparkline and a Public/Private badge, with a 7/30-day switch. A weekly `outcomes:collect` job keeps the history.

---

## 7. Troubleshooting

The common cases are in [Troubleshooting](troubleshooting.md). These came up while setting up the worked example:

| Symptom | Cause | Fix |
|---|---|---|
| `Claude Code returned no structured output … 401 OAuth access token is invalid` | The pasted token had line breaks or was cut short. | Redo [2.3](#23-give-it-access-to-claude) with the `tr -d '[:space:]'` pipe. |
| Workflow ran, no Issue, log says permission denied creating issues/PRs | Actions can't write. | [2.2](#22-let-actions-open-pull-requests). |
| `Couldn't reach my-app: … answered 401 (check the token)` | The content repo's key doesn't match the app's `OUTCOMES_API_KEY`, or isn't passed under `env:` in the workflow. | Set both to the same key; check `gh secret list`. |
| The endpoint answers 404 / "Route not found" after you merged it | The new version isn't deployed yet, or `OUTCOMES_API_KEY` isn't set. | Check which version is live; set the key; redeploy. |
| A new page or endpoint 404s although the PR is merged and CI built it | Your deploy pipeline didn't roll out the new image (for example, Flux image automation failing). | Bump the image tag or redeploy by hand, then fix the automation. |
| Your `/shipnotes …` comment did nothing | You don't have write access, or the comment doesn't contain `/shipnotes`. | Check the Actions tab: a skipped run means the filter didn't match. |
| An "Approve and run" banner on a draft PR | A workflow run triggered by the bot is waiting for approval. | Harmless: shipnotes reports the fact-check on its own PRs. Templates from Nov 2026 onward skip that run. |
| *"No public metric moved enough this period"* | Nothing moved by `min_change_pct`, there's no `previous`, or nothing is `public`. | Lower `min_change_pct`, add `previous`, or mark metrics public. |
| Very small numbers | Your tracking is new: the "previous" period is from before it existed. | Wait a full period or two. shipnotes calls small counts an "early signal". |
| The LinkedIn link 404s | The post was published with a different slug. | Use the slug from the draft's file name (4.1). |

Still stuck? Open an issue on [victor-914/shipnotes](https://github.com/victor-914/shipnotes/issues) with the Actions log (remove any secrets first).
