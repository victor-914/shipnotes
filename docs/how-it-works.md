# How it works

shipnotes is a pipeline where **plain code decides what's true and the model only words it.**

```
 outcomes.json ─┐
 (per project)  │   collect      stories        topics         draft          fact-check      PR / publish
                ├─► snapshots ─► what moved ─► post ideas ─► Markdown ────► every number ─► review, merge,
 GitHub commits ┘   + shipped    ranked         (model)       (model)        from facts?     published/
                    (code)       (code)                                      (code)          (code)
```

| Step | File | Model? |
|---|---|---|
| Fetch each project's snapshot (URL or file), validate it against the spec | `sources/outcomesJson.ts`, `spec.ts` | no |
| Add commits from `repos` in the period as shipped items | `sources/github.ts`, `collect.ts` | no |
| Find the public metrics that moved, score and rank them | `stories.ts` | no |
| Turn each story into a **fact**: a small, storable record | `facts.ts` | no |
| Propose 1–5 post ideas, each using some facts | `topics.ts` | yes |
| Write or rewrite the post from the facts, the topic and `VOICE.md` | `draft.ts` | yes |
| Write the LinkedIn and Substack versions | `channels.ts` | yes |
| Check every number against the facts. Retry once with feedback if it fails | `factcheck.ts`, `draft.ts` | no |
| Issues, branches, PRs, statuses, moving to `published/`, publishers | `github/flow.ts`, `publishers.ts` | no |

## What the model sees

- **Facts, already worked out.** Before/after values formatted with units, the percent change ("down 57%"), whether it improved, whether it's an early signal, and what shipped in the period. The model never has to do arithmetic, so it has no reason to make up a number.
- Your `VOICE.md`, the chosen topic and angle, and, for rewrites, the current draft and your request (cut to 2,000 characters).
- Nothing else. No private metrics, no tokens, no repo access, no tools.

It must answer as JSON that matches a schema (title, excerpt, body, tags; or topics). Answers that don't match are rejected.

## How stories are picked

All of this happens in `stories.ts`. For each metric in each snapshot:

1. Skip it unless it's `"public": true` and has a `previous` value.
2. Skip it if it didn't change.
3. Work out the size of the change: `|value − previous| / |previous| × 100`. A change from `0` counts as 100.
4. Skip it if the size is below `rules.min_change_pct`.
5. Skip it if it got worse, unless `rules.include_declines` is on. "Worse" depends on `better`: for load time, going up is worse.
6. Mark it as an **early signal** if it's a `count` and both values are below `rules.min_count`.

Then score it:

| Part | Points |
|---|---|
| Size of change, capped at 200%, halved | 0–100 |
| It's the project's `north_star` | +30 |
| The project shipped something in the period | +20 |
| It improved | +10 |
| It's an early signal | −25 |

The top `rules.max_stories` become the facts for the period. If none are left, nothing is written: no Issue, no draft. That's on purpose ("silence is fine").

**Period:** when there are several projects, the topics Issue covers the earliest `from` to the latest `to` across their snapshots. Each fact keeps its own project's period.

## The topics Issue

The weekly Issue is titled `Post ideas: <from> → <to>` and labelled `shipnotes`. Its state (the topics, their facts, and which ones already have a draft PR) is stored in a hidden HTML comment at the end of the body, base64-encoded JSON. That's why ticking a box or commenting works without a database.

Don't delete that comment when editing the Issue. If it's gone, shipnotes no longer recognises the Issue.

## The draft PR

- Branch: `shipnotes/<date>-<slug>`
- Files: `drafts/<date>-<slug>.md`, plus channel versions
- Title: `Draft: <title>`
- Body: the excerpt, the facts in plain words, the fact-check result, and what to do next

You can edit the draft on GitHub, locally, or in Claude at claude.ai/code. The template ships a `shipnotes` skill and a `CLAUDE.md` that teach Claude the rules. Every push is fact-checked. Merging publishes, and closing the PR throws the draft away.

## Local runs

`shipnotes run` goes through the same pipeline without GitHub. It writes one post from all the facts (there's no topic step), fact-checks it, and saves it through the `publish` targets, or to `drafts/` if there are none. `--dry-run` prints it instead. `shipnotes topics` prints the ideas without drafting.
