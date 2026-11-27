# shipnotes

**Turn your projects' real outcomes into blog drafts you review as pull requests. No made-up numbers.**

You build things. Keeping a blog or social presence going takes time away from building, so most builders go quiet and their best work stays invisible. shipnotes reads what your projects actually achieved, suggests what's worth writing about, and drafts it. You review it like code: edit, comment, merge.

> AI levelled the playing field. What matters now is outcomes. — *The Era of Builders*

## How it works

Everything happens in one GitHub repo of yours (made from [`template/`](template)):

```
Monday (GitHub Actions)     You                     shipnotes                       You              On merge
───────────────────────     ───                     ─────────                       ───              ────────
read outcomes + commits ─►  "Post ideas" Issue  ─►  tick a topic, or          ─►   draft PR    ─►   edit / comment  ─►  moved to published/,
find what moved             with ranked topics      /shipnotes draft 2             drafts/*.md      merge = approve     sent to your channels
```

| Step | Who does it |
|---|---|
| Fetch snapshots and commits, find what moved, rank it | Plain code |
| Suggest topics, write and rewrite drafts | Claude (your own Claude Code, no tools enabled) |
| Fact-check every number, on every push | Plain code |
| Issues, branches, PRs, publishing | Plain code (GitHub API) |

Edit drafts wherever you like: on GitHub, locally, or in Claude at claude.ai/code (the template ships a Claude skill for it). Every push re-runs the fact-check and reports it as the `shipnotes/fact-check` status.

## Trust rules

1. **No made-up numbers.** Each draft carries its `facts:` in its frontmatter. Any number in the post that isn't one of them (or a simple rounding) fails the check, whoever wrote it.
2. **Private by default.** Only metrics marked `"public": true` are ever shown to the model.
3. **No fake causes.** Drafts say what shipped and what moved in the same period, not that one caused the other.
4. **You approve.** Nothing is published until you merge.
5. **Only you can trigger it.** Commands from people without write access are ignored, so nobody else spends your Claude usage.
6. **Silence is fine.** If nothing moved, nothing is written.

## Get started

1. **Publish an Outcome Snapshot** for each project: see [SPEC.md](SPEC.md) and [examples/outcomes.json](examples/outcomes.json). Validate it with `npx shipnotes validate outcomes.json`.
2. **Create your content repo** from [`template/`](template), and follow its README (config, voice, one secret).
3. **Try it locally first**, if you like. shipnotes uses your installed, logged-in [Claude Code](https://docs.claude.com/en/docs/claude-code):

   ```sh
   npx shipnotes topics            # this period's topic ideas
   npx shipnotes run --dry-run     # a full draft, printed
   npx shipnotes check drafts/*.md # fact-check any draft file
   ```

## Commands

| Where | Command | What happens |
|---|---|---|
| Post ideas Issue | tick a box, or `/shipnotes draft <n>` | Opens a draft PR for that topic |
| Post ideas Issue | `/shipnotes skip` | Closes the Issue |
| Draft PR | `/shipnotes rewrite <what to change>` | Rewrites the draft on its branch and re-checks it |
| Draft PR | merge | Publishes |

## Publishing targets

Approved posts always land in `published/` in your repo, so any static-site blog can read them from there. You can also send them elsewhere after merge:

| Type | What it does |
|---|---|
| `http` | POSTs the post as JSON to your site's endpoint, live or as a draft there (`on_merge: published \| draft`) |

More sources and targets (analytics tools, Dev.to, Ghost, LinkedIn drafts) are on the roadmap. Each is a small module.

## Claude access

shipnotes never asks for or stores your credentials. It runs your own Claude Code (`claude -p`) with no tools, MCP servers or settings, and passes it only its own token: not your GitHub token or project keys. In Actions it uses `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY`. Check Anthropic's current terms for how your plan may be used in automation.

## Exit codes

`0` ok, or nothing worth writing · `1` error · `2` fact-check failed

## Status

v0.2, early. The spec (`outcomes/0.1`) may still change. Built first for its author's own projects, starting with [Casmir Realty](https://casmirshortlets.com).

## License

MIT
