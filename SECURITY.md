# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for a security problem.

Report it privately through GitHub: on this repo, go to **Security → Report a vulnerability**. Include what you found, how to reproduce it, and what an attacker could do with it.

You should get a reply within 7 days. Once a fix is released, the advisory is published and you're credited unless you'd rather not be.

## Supported versions

shipnotes is pre-1.0. Only the latest release (and the moving `v0` tag the template uses) gets fixes.

| Version | Supported |
|---|---|
| latest `0.x` / `@v0` | yes |
| older `0.x` | no |

## What shipnotes handles

shipnotes runs inside your own GitHub Actions and on your own machine. It touches:

| Secret | Where it goes |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | Passed only to the `claude` process. |
| `GITHUB_TOKEN` (the Actions token) | Used by shipnotes to manage Issues, branches, PRs and statuses in the content repo. **Never** passed to Claude. |
| `SHIPNOTES_READ_TOKEN` (optional) | Used to read commits from your project repos. Never passed to Claude. |
| `${NAME}` values in `shipnotes.config.yaml` | Read from the environment, used in request headers to your outcomes endpoints and publishers. Never written to files, never passed to Claude. |

## Security model

These are the guarantees shipnotes is designed to keep. A way to break any of them is a vulnerability.

1. **Only collaborators with write access can trigger the model.** `/shipnotes` commands and topic ticks are checked against the repo's collaborator permission (`admin`, `maintain` or `write`). Comments from bots are ignored. Anyone else is ignored, so they can't spend your Claude usage.
2. **Claude runs with no tools.** shipnotes calls `claude -p` with no tools (`--tools ""`), no MCP servers (`--strict-mcp-config`), no settings files (`--setting-sources ""`) and no saved session. It runs with a minimal environment: an allowlist of `PATH`, `HOME`, locale, proxy and Claude credential variables (see `src/llm/claudeCode.ts`). A prompt injection in a commit message or comment can affect the words of a draft, but it can't run commands or read secrets.
3. **Private metrics never leave the snapshot.** Only metrics with `"public": true` become facts. Private metrics aren't sent to the model, aren't written to drafts, and aren't sent to publishers.
4. **Nothing is published without a merge.** Publishers run only after a person merges a draft PR, and only if the merged file passes the fact-check again.
5. **Model output is data.** It's validated against a JSON schema and fact-checked by plain code before anything is written.

## Known limits (not vulnerabilities)

- **Draft wording can be influenced.** Commit messages from your project repos and the text of `/shipnotes rewrite` instructions reach the model. Someone who can push commits to your project repos can steer the wording of a draft. You still review every draft before merging.
- **Anyone with write access to the content repo is trusted.** They can edit drafts, edit the `facts:` block, or merge. Use branch protection and require the `shipnotes/fact-check` status if you share the repo.
- **The `facts:` frontmatter is the evidence.** If someone edits both the facts and the text of a draft, the fact-check passes. Review diffs to `facts:` in PRs.
- **The action installs Claude Code from npm at run time** (`claude-code-version`, default `latest`). Pin a version if you need reproducible runs.
- **Workflow permissions.** The template workflow needs `contents`, `issues`, `pull-requests` and `statuses` write access to the content repo. Keep shipnotes in a repo of its own, not in a repo that holds production code.

## Hardening checklist for users

- Keep the content repo separate from your application repos.
- Give `SHIPNOTES_READ_TOKEN` read-only access to commits in only the repos it needs (a fine-grained PAT).
- Put your outcomes endpoint behind a read-only key that can't do anything else.
- Make outcomes endpoints return totals only, with no personal data (see [SPEC.md](SPEC.md)).
- Turn on branch protection and require `shipnotes/fact-check`.
- Pin `victor-914/shipnotes` to a release tag or commit SHA if you don't want automatic updates.
