# Config reference

shipnotes reads `shipnotes.config.yaml` (or the path given with `--config` / the action's `config` input). Unknown keys are errors, so typos fail loudly.

Relative paths are resolved from the folder the config file is in.

## Full example

```yaml
author:
  name: Ada
  voice: ./VOICE.md
  footer: "Drafted by shipnotes from real project data, approved by me."

site:
  post_url: https://example.com/blog/{slug}

channels: [linkedin, substack]

projects:
  - outcomes:
      url: https://api.example.com/.well-known/outcomes.json
      headers: { Authorization: "Bearer ${MYAPP_OUTCOMES_KEY}" }
    repos: [ada/myapp-web, ada/myapp-api]
  - outcomes:
      file: ./side-project/outcomes.json

llm:
  provider: claude-code
  model: sonnet
  timeout_seconds: 300

rules:
  min_change_pct: 10
  min_count: 30
  max_stories: 5
  include_declines: false
  allow_small_integers: true

publish:
  - type: http
    url: https://example.com/api/posts
    headers: { Authorization: "Bearer ${SITE_TOKEN}" }
    on_merge: draft

github:
  drafts_dir: drafts
  published_dir: published
```

## Secrets: `${NAME}`

Any string can contain `${NAME}`. It's replaced from the environment when the config loads. Names must be `UPPER_CASE` (letters, digits, `_`). If a variable is missing or empty, loading fails with an error naming it.

In GitHub Actions, pass the values with `env:` on the shipnotes step:

```yaml
- uses: victor-914/shipnotes@v0
  with:
    claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
  env:
    MYAPP_OUTCOMES_KEY: ${{ secrets.MYAPP_OUTCOMES_KEY }}
```

Never write secret values in the config file itself.

---

## `author` (required)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | required | Your name, as the post's author. |
| `voice` | path | none | A Markdown file describing how you write. It's given to the model for every topic, draft and rewrite. See [`template/VOICE.md`](../template/VOICE.md). |
| `footer` | string, max 1000 chars | none | Markdown added to the end of every post, after a `---` line. It's kept when a draft is rewritten. |

## `site`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `post_url` | string containing `{slug}` | none | Where approved posts will live. Channel versions link here, with UTM tags (`utm_source=linkedin`, and so on) so you can count readers from each channel. Without it, channel versions have no link. |

The slug is the post title lowercased, with accents removed, non-alphanumerics turned into `-`, cut to 80 characters.

## `channels`

A list from `linkedin` and `substack`. Default: `[]`.

For each channel, a short version of the post is written next to the draft (`drafts/<file>.linkedin.md`) in the same PR. Channel versions get the same fact-check as the main post. If the model can't write one without inventing numbers after one retry, that channel is skipped and the draft still opens. After merge, they're moved to `published/` and posted in the PR as ready-to-paste text. shipnotes doesn't post to these platforms itself.

## `projects` (required, at least one)

Each item is one project.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `outcomes` | object | required | Where the project's [Outcome Snapshot](../SPEC.md) is. See below. |
| `repos` | list of `owner/repo` | `[]` | GitHub repos whose commits in the snapshot's period are added to its `shipped` list. Merge commits are skipped. Commits whose first line matches an existing shipped title (ignoring case) are skipped too. At most 500 commits per repo per period. |

### `outcomes`: one of

```yaml
outcomes:
  url: https://api.example.com/.well-known/outcomes.json
  headers: { Authorization: "Bearer ${KEY}" }   # optional
```

```yaml
outcomes:
  file: ./outcomes.json
```

URLs are fetched with `GET` and a 20-second timeout, and must answer `2xx` with JSON. Every snapshot is validated against the spec. An invalid snapshot stops the run with an error saying which field is wrong.

**Private repos:** commits are read with `SHIPNOTES_READ_TOKEN` if it's set, otherwise with `GITHUB_TOKEN`. In Actions, the default token can only read the content repo itself, so for other private repos create a fine-grained PAT with **Contents: read** on those repos and pass it as the action's `read-token`.

## `llm`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `provider` | `claude-code` | `claude-code` | The only provider for now: your own installed Claude Code, run as `claude -p`. |
| `model` | string | Claude Code's default | Passed to `claude --model`, e.g. `sonnet`, `opus`, or a full model ID. |
| `timeout_seconds` | positive integer | `300` | How long to wait for each model call before giving up. |

Credentials: locally, Claude Code uses its own login. In Actions it uses `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY`.

## `rules`

These decide which metric changes count as stories. It's all plain code, no model. See [how-it-works.md](how-it-works.md#how-stories-are-picked) for the scoring.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `min_change_pct` | number ≥ 0 | `10` | A metric must move at least this many percent to count. A change from `0` counts as 100%. |
| `min_count` | number ≥ 0 | `30` | For `count` metrics, if both values are below this, the story is marked as an **early signal**. It ranks lower, and drafts say it's early rather than calling it a trend. |
| `max_stories` | integer 1–10 | `5` | The most stories (facts) passed on for topics each period. |
| `include_declines` | boolean | `false` | Also write about metrics that got worse. Off by default; turn it on for honest "what went wrong" posts. |
| `allow_small_integers` | boolean | `true` | Allow the bare numbers 0–10 in a draft without a matching fact ("three steps", "2 pages"). Turn off for the strictest check. |

## `publish`

Where approved posts go **in addition to** `published/` in your content repo. Default: `[]`.

### `markdown`

```yaml
- type: markdown
  dir: ./drafts      # default
```

Used only by `shipnotes run` (local). It saves the draft and its channel versions as files in `dir`. If `publish` is empty, `shipnotes run` saves to `github.drafts_dir`. It's ignored in the GitHub flow, where drafts always go to a PR.

### `http`

```yaml
- type: http
  url: https://example.com/api/posts
  headers: { Authorization: "Bearer ${SITE_TOKEN}" }
  on_merge: published   # or: draft
```

| Key | Default | Meaning |
|---|---|---|
| `url` | required | Receives a `POST` with a JSON body (below), with a 30-second timeout. |
| `headers` | `{}` | Extra request headers. |
| `on_merge` | `published` | After merge, send the post as live (`"published": true`) or as a draft on your site for a second review (`"published": false`). |

`shipnotes run` (local, not dry-run) also sends to `http` targets, always with `"published": false`.

**Request body:**

```json
{
  "title": "How the homepage got twice as fast",
  "slug": "how-the-homepage-got-twice-as-fast",
  "excerpt": "One-line summary.",
  "body": "Markdown body, including the footer.",
  "tags": ["performance"],
  "date": "2026-11-10",
  "projects": ["casmir-realty"],
  "published": true,
  "generator": "shipnotes",
  "facts": [ { "id": "casmir-realty/lcp_seconds", "...": "..." } ]
}
```

`facts` only ever contains public metrics. See [drafts.md](drafts.md#facts) for its shape.

**Response:** any `2xx`. If the JSON response has a `url` field, or the response has a `Location` header, that link is shown in the PR's "Published" comment. Any other status fails the publish step, and the error, including the first 300 characters of the response, appears in the Actions log.

> If an `http` target fails after merge, the post may not have been moved to `published/`. Check the Actions log, fix the endpoint, and send the post again by hand.

## `github`

| Key | Default | Meaning |
|---|---|---|
| `drafts_dir` | `drafts` | Folder for drafts in draft PRs. The template workflow's `pull_request.paths` filter must match it. |
| `published_dir` | `published` | Folder approved posts are moved to on merge. Point your static site at it. |

If you change `drafts_dir`, also change `paths: ["drafts/**"]` in `.github/workflows/shipnotes.yml`.
