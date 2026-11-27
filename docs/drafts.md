# Draft format and the fact-check

Every draft is a Markdown file with YAML frontmatter. The frontmatter carries the **facts** the post is allowed to use. Because the facts travel with the file, anyone can re-run the fact-check on any copy, whoever edited it: on GitHub, in an editor, or in Claude.

## File names

```
drafts/2026-11-10-how-the-homepage-got-twice-as-fast.md            the post
drafts/2026-11-10-how-the-homepage-got-twice-as-fast.linkedin.md   channel version (optional)
drafts/2026-11-10-how-the-homepage-got-twice-as-fast.substack.md   channel version (optional)
```

The pattern is `<date>-<slug>.md`. The slug comes from the title (see [config.md](config.md#site)). On merge, every file moves to `published/` with the same name.

Draft branches are named `shipnotes/<date>-<slug>`, cut to 50 characters, with `-2`, `-3`… added if the name is taken.

## Example

```markdown
---
title: How the homepage got twice as fast
excerpt: Largest paint went from 6.3 s to 2.7 s in a week of small fixes.
date: 2026-11-10
tags:
  - performance
  - web
draft: true
projects:
  - casmir-realty
topic_issue: 12
generator: shipnotes
facts:
  - id: casmir-realty/lcp_seconds
    project: casmir-realty
    project_name: Casmir Realty
    project_url: https://casmirshortlets.com
    metric: lcp_seconds
    label: Homepage LCP
    unit: seconds
    better: lower
    before: 6.3
    after: 2.7
    period: { from: 2026-11-03, to: 2026-11-10 }
    north_star: false
    early_signal: false
    improved: true
    shipped:
      - { title: Speed up the homepage, date: 2026-11-09 }
---

The [Casmir Realty](https://casmirshortlets.com) homepage now paints its
largest element in 2.7 s, down from 6.3 s a week ago…

---

Drafted by shipnotes from real project data, approved by me.
```

## Frontmatter fields

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | The post title. It's fact-checked. |
| `excerpt` | no | One or two sentences. It's fact-checked. |
| `date` | yes | `YYYY-MM-DD`, the day the draft was written. |
| `tags` | no | Up to 6 short lowercase tags. |
| `draft` | no | `true` while under review. Set to `false` on publish. |
| `published_at` | no | Added on publish (`YYYY-MM-DD`). |
| `projects` | no | Slugs of the projects the post is about. |
| `topic_issue` | no | The topics Issue this came from. The Issue gets a comment when the post is published. |
| `generator` | no | `shipnotes`. |
| `facts` | yes, at least one | The evidence. See below. **Don't edit it by hand.** |

Other keys are allowed and kept, so your static site can add its own (for example `cover_image`).

The body is everything after the closing `---`. If `author.footer` is set, the footer is the last part of the body, after a `---` line. Rewrites keep it.

### Facts

Each fact is one public metric change from one project's snapshot.

| Field | Meaning |
|---|---|
| `id` | `<project-slug>/<metric-name>` |
| `project`, `project_name`, `project_url` | From the snapshot's `project`. |
| `metric`, `label` | From the snapshot metric. |
| `unit` | `count`, `ratio`, `percent`, `seconds`, `ms`, `score` or `currency`. |
| `better` | `higher` or `lower`. |
| `before`, `after` | The metric's `previous` and `value`. |
| `period` | The snapshot's period. |
| `north_star` | Whether this is the project's north-star metric. |
| `early_signal` | A `count` too small to call a trend (see `rules.min_count`). |
| `improved` | Whether it moved in the `better` direction. |
| `shipped` | Up to 15 `{ title, date }` items shipped in the period. |

Only metrics marked `"public": true` in the snapshot ever become facts.

## Channel versions

`.linkedin.md` and `.substack.md` files are plain text with no frontmatter. They're checked against the facts of the post they sit next to (same name without the channel part). If that post is missing, the check fails.

---

## The fact-check

The fact-check is plain code (`src/factcheck.ts`). It finds every number a reader would see and makes sure each one comes from the facts. It runs:

- on every draft and rewrite the model writes. If it fails, the model gets one retry with the bad numbers listed. If it fails again, nothing is saved, and the Issue or PR gets a comment saying so.
- on every push to a draft PR, reported as the `shipnotes/fact-check` commit status, with a comment listing any failures.
- again on merge. A merged post that fails isn't moved to `published/` and isn't sent to any publisher.
- whenever you run `npx shipnotes check <file>…`.

### What is checked

For a post: the `title`, the `excerpt` and the body. For a channel version: the whole file.

These are ignored, so numbers inside them never fail:

- fenced code blocks and `inline code`
- link targets, `[text](…)`, and bare `http(s)://` URLs. The link text is still checked.
- numbered-list markers (`1. `) and heading markers (`## `)
- numbers touching letters, like `v2`, `mp3`, `H1` and `utf8`. This also means `5x`, `10s`, `500ms` and `3rd` are **not checked** today (see [limits](#what-the-fact-check-does-not-do)).

Numbers are read as written: `2,140`, `2140`, `2.7`, `2.1k`, `3m` (k = thousand, m = million). `$1,200`, `40%` and `2.3×` are read as 1200, 40 and 2.3. A minus sign isn't read, so `-12` is checked as `12`.

### What is allowed

For each fact, all of these, plus their roundings:

| Allowed | Example (before 6.3 s, after 2.7 s) |
|---|---|
| `before`, `after` | 6.3, 2.7 |
| The difference | 3.6 |
| The percent change | 57 (−57.14…%) |
| The ratio, both ways | 2.3 ("2.3× faster"), 0.43 |
| Ratios as percents (`unit: ratio`) | 0.19 → 19 |
| Seconds as ms and back (`unit: seconds` / `ms`) | 2700, 6300 |
| Year, month and day of the period and shipped dates | 2026, 11, 3, 10, 9 |
| Numbers inside the project name, metric label and shipped titles | "Release 4" → 4 |
| How many shipped items there are, and how many facts the draft has | |
| 0–10, when `rules.allow_small_integers` is on (the default) | "three steps", "2 pages" |

**Roundings:** any allowed number may be written as itself, rounded to a whole number, or rounded to 1 or 2 decimals, with or without its sign. Numbers of 1,000 or more may also be rounded to 2 significant figures: 2,140 can appear as `2,100` or `2.1k`.

### What fails

Anything else: a total, an average, an estimate, a projection, a number from memory, or a number that only appears in a commit message nobody put in a shipped title. If you need the point, say it in words ("most visitors", "about twice as many" works only if the ratio rounds to 2).

### `shipnotes check`

```sh
npx shipnotes check drafts/*.md
npx shipnotes check --strict drafts/my-post.md
```

| Output | Meaning |
|---|---|
| `✓ drafts/x.md: 9 numbers verified` | Passed. |
| `✗ drafts/x.md: not in the facts: 40%, 1,200` | These numbers don't come from the facts. |

The exit code is `0` if every file passed, `2` if any failed, and `1` if a file can't be read or its frontmatter is invalid.

`--strict` turns off the 0–10 allowance. The CLI doesn't read your config, so `rules.allow_small_integers: false` only applies to the GitHub checks. Use `--strict` locally to match it.

### What the fact-check does not do

- **It doesn't check numbers joined to letters.** `5x faster`, `10s`, `500ms` and `3rd` slip through. Write `5×`, `10 s` or `500 ms` (with a space) so they're checked, and look for these when reviewing.
- **It doesn't check claims in words.** "Bookings tripled" passes the check even if they didn't. Read the draft.
- **It doesn't check which fact a number belongs to.** If the facts contain 12 and 7, a draft saying "7 bookings, up from 12" passes. Read the draft.
- **It trusts the `facts:` block.** If someone edits the facts, the check follows them. Look at any change to `facts:` in a PR diff.

That's why every post is a pull request: the fact-check guarantees the numbers exist in your data, and you guarantee the post is right.
