# Troubleshooting

Start with the Actions log: every line shipnotes prints starts with `shipnotes:`, and the job summary has a one-line result.

## No "Post ideas" Issue appeared

| Log says | Why | Fix |
|---|---|---|
| `No public metric moved enough this period` | Nothing passed the rules. | Check that metrics have `"public": true` and a `previous` value. Lower `rules.min_change_pct`, or turn on `rules.include_declines`. |
| `Topics for this period are already in #N` | An open Issue already covers the same period. | Use that Issue, or close it and run the workflow again. |
| `GET … answered 401/403/404` | Your outcomes endpoint refused the request. | Check the URL, the `headers`, and that the secret is passed in `env:` on the step. |
| `Config uses ${NAME} but that environment variable is not set` | A secret isn't reaching the step. | Add `NAME: ${{ secrets.NAME }}` under `env:` on the shipnotes step, and check the secret exists in the repo settings. |
| `Invalid config …` / `… is not a valid outcomes/0.1 snapshot` | The YAML or JSON doesn't match. | The message names the field. Run `npx -y github:victor-914/shipnotes validate outcomes.json` locally. |
| The workflow didn't run at all | Scheduled workflows only run on the default branch, and GitHub pauses them in repos with no activity for 60 days. | Use **Actions → shipnotes → Run workflow**, and re-enable the workflow if it's been paused. |

## A command did nothing

- The comment must **start** with `/shipnotes` (spaces before it are fine).
- You need write access to the repo. Others are ignored on purpose. Look for `can't run shipnotes here` in the log.
- `draft` and `skip` only work on the topics Issue, and `rewrite` only works on a draft PR.
- Ticking a box only works if the hidden `shipnotes:state` comment is still in the Issue body.

## "Couldn't write a draft … without numbers that aren't in the data"

The model used a number that isn't in the facts, twice. Nothing was saved. Run the command again. If it keeps happening, the topic may need a number you don't have, so add it to your snapshot or pick another topic.

## The fact-check failed on my edit

The comment lists the numbers. For each one, either:

- remove it or say it in words,
- write it the way the fact is written (`2.7 s`, not `2.68 s`), or
- if it really should be allowed, add it to your snapshot. Next period's facts will include it.

Don't edit `facts:` to make the check pass. See [drafts.md](drafts.md#the-fact-check) for exactly what's allowed.

## A merged post wasn't published

The merge comment says why.

- **"merged with unverified numbers"**: the post failed the check at merge time. Fix the file in `drafts/` on the default branch, then move it to `published/` by hand or open a new PR.
- **An `http` publisher failed** (`POST … answered 500`): the run stopped before moving the file. Fix the endpoint. Then either move the file to `published/` and send it by hand, or re-run the failed job.

## Claude errors

| Message | Fix |
|---|---|
| `Claude Code (claude) is not installed` | Locally, run `npm install -g @anthropic-ai/claude-code`. In Actions, the action installs it automatically. |
| `Claude Code returned no structured output` / auth errors | The token is missing, wrong or expired. Run `claude setup-token` again and update the `CLAUDE_CODE_OAUTH_TOKEN` secret. |
| `did not answer within 300s` | Raise `llm.timeout_seconds`, or choose a faster `llm.model`. |

## Commits from my project repos are missing

- The repo must be listed in `projects[].repos` as `owner/repo`.
- Private repos need `read-token` (a fine-grained PAT with **Contents: read**) on the action.
- Only commits dated inside the snapshot's period are read. Merge commits are skipped.

## Pushes made by shipnotes don't run my other workflows

That's how GitHub's Actions token works. shipnotes sets the fact-check status itself on its own commits. If you need other workflows to run on draft branches, give the job a PAT or a GitHub App token instead.

## Still stuck?

Open a [bug report](https://github.com/victor-914/shipnotes/issues/new/choose) with the `shipnotes:` log lines. Remove secrets and private numbers first.
