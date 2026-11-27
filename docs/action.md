# GitHub Action reference

`victor-914/shipnotes` is a composite action. The easiest way to use it is the workflow in [`template/`](../template/.github/workflows/shipnotes.yml). This page is for writing or changing that workflow yourself.

## Minimal workflow

```yaml
name: shipnotes

on:
  schedule:
    - cron: "0 6 * * 1"          # topics every Monday 06:00 UTC
  workflow_dispatch:              # "Run workflow" button
  issue_comment:
    types: [created]              # /shipnotes commands
  issues:
    types: [edited]               # ticking a topic
  pull_request:
    types: [opened, synchronize, reopened, closed]
    paths: ["drafts/**"]          # must match github.drafts_dir

permissions:
  contents: write                 # draft branches, moving posts to published/
  issues: write                   # topics Issue and replies
  pull-requests: write            # draft PRs
  statuses: write                 # shipnotes/fact-check

jobs:
  shipnotes:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: victor-914/shipnotes@v0
        with:
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

The template also has an `if:` on the job that skips comments without `/shipnotes`, Issue edits outside the topics Issue, and PR pushes made by shipnotes itself, so those events don't use a runner. Keep it when you copy the workflow.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `command` | `event` | `event` handles the current GitHub event (below). `run` drafts once and saves the files on the runner (rarely useful in CI). `check` fact-checks `files`. |
| `config` | `shipnotes.config.yaml` | Path to the config, relative to the repo root. |
| `files` | `""` | For `command: check`: space-separated draft paths. |
| `claude-code-oauth-token` | none | From `claude setup-token`, so your Claude subscription pays for the writing. Pass it from a secret. |
| `anthropic-api-key` | none | Use this instead of the OAuth token to pay per use through the API. Pass it from a secret. |
| `read-token` | none | A fine-grained PAT with **Contents: read** on private project repos listed in `projects[].repos`. Without it, the Actions token is used, and it can only read this repo. |
| `claude-code-version` | `latest` | The version of `@anthropic-ai/claude-code` to install. Pin it for reproducible runs. |

You need one of the two Claude credentials for anything that writes (topics, drafts, rewrites). Fact-checking and publishing don't use Claude, so on `pull_request` events, and for `command: check`, Claude Code isn't installed at all.

Secrets your config uses as `${NAME}` go in `env:` on the step:

```yaml
      - uses: victor-914/shipnotes@v0
        with:
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
        env:
          MYAPP_OUTCOMES_KEY: ${{ secrets.MYAPP_OUTCOMES_KEY }}
```

## What each event does

| Event | What shipnotes does | Uses Claude |
|---|---|---|
| `schedule`, `workflow_dispatch` | Collects facts and opens a **Post ideas** Issue labelled `shipnotes`. If nothing moved enough, it does nothing. If an open Issue already covers the same period, it does nothing. | yes |
| `issue_comment`: `/shipnotes draft <n>` on the topics Issue | Writes a draft for topic *n*, fact-checks it, and opens a PR on a new branch. | yes |
| `issue_comment`: `/shipnotes skip` on the topics Issue | Closes the Issue as not planned. | no |
| `issue_comment`: `/shipnotes rewrite <text>` on a draft PR | Rewrites the draft (and channel versions) on its branch, then fact-checks it. If the check fails, the current version is kept. | yes |
| `issues.edited` on the topics Issue | Drafts each newly ticked topic, at most 3 per edit. | yes |
| `pull_request` opened / synchronize / reopened | Fact-checks every `.md` file in `drafts/` that the PR changes, and sets the `shipnotes/fact-check` status. Failures are also posted as a comment. | no |
| `pull_request.closed`, merged | Fact-checks again, sends each post to the `http` publishers, moves it and its channel versions to `published/`, and comments with links and ready-to-paste channel text. | no |
| `pull_request.closed`, not merged | Nothing. | no |

Commands must be at the start of the comment (spaces before them are fine) and are case-insensitive. They only run for users with `admin`, `maintain` or `write` permission on the repo. Comments from bots are ignored.

## Pinning

| Ref | What you get |
|---|---|
| `@v0` | The latest `0.x` release. This is what the template uses. |
| `@v0.2.0` | Exactly that release. |
| `@<commit sha>` | Exactly that commit. This is the safest option. |

## Exit codes and job status

The step fails (exit `2`) when shipnotes couldn't do what was asked: a fact-check failed, a draft couldn't be written without unverified numbers, or a topic number didn't exist. It also fails (exit `1`) on errors such as an invalid config, a missing secret, or an endpoint answering with an error. Doing nothing because nothing moved counts as success.

A one-line result is written to the job summary.

## Notes

- The action builds shipnotes from source on every run (`npm ci && npm run build` in the action's folder). This adds about 20–40 seconds.
- Commits and PRs made with the default Actions token **don't trigger other workflows**. That's why shipnotes sets the fact-check status itself when it writes or rewrites a draft.
- To require the check before merging: **Settings → Branches → branch protection → Require status checks → `shipnotes/fact-check`**.
