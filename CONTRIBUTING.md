# Contributing to shipnotes

Thanks for helping. shipnotes is small on purpose, so the bar for new features is "does this keep the trust rules and stay simple?"

## Before you start

- **Bugs and small fixes:** open a PR directly.
- **New features, sources or publishers:** open an issue first so we can agree on the shape before you write code.
- **Security problems:** don't open an issue. See [SECURITY.md](SECURITY.md).
- **Changes to the Outcome Snapshot spec:** open an issue titled `spec: …`. The spec is meant to be implemented by other tools, so changes to it are discussed in the open before anyone codes them.

## Set up

You need Node 22 or later. To try drafting, you also need [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and logged in. Tests don't need it.

```sh
git clone https://github.com/victor-914/shipnotes.git
cd shipnotes
npm ci
npm test
```

| Command | What it does |
|---|---|
| `npm run dev -- <command>` | Run the CLI from source, e.g. `npm run dev -- validate examples/outcomes.json` |
| `npm test` | Run the tests (vitest) |
| `npm run typecheck` | Type-check without building |
| `npm run build` | Build `dist/` |
| `npm run schema` | Regenerate `schema/outcomes.schema.json` from `src/spec.ts` |

To try a full local run against the example data:

```sh
cd examples
npx tsx ../src/cli.ts run --dry-run
```

## Map of the code

```
src/
  cli.ts              entry point: run, topics, check, validate, event
  config.ts           shipnotes.config.yaml schema (zod) and ${ENV} interpolation
  spec.ts             Outcome Snapshot schema (source of schema/outcomes.schema.json)
  sources/            where data comes from: outcomes.json (URL/file), GitHub commits
  collect.ts          fetch every project, merge commits into "shipped"
  stories.ts          plain code: which public metrics moved, ranked
  facts.ts            a story as a storable Fact (goes in Issues and draft frontmatter)
  topics.ts           model: propose post ideas from facts
  draft.ts            model: write or rewrite a draft, retried once if the fact-check fails
  channels.ts         model: LinkedIn / Substack short versions
  factcheck.ts        plain code: every number must come from the facts
  draftFile.ts        Markdown + YAML frontmatter format
  publishers.ts       markdown and http targets
  run.ts              the one-shot local flow
  github/             the Issue → PR → merge loop, GitHub API client
  llm/claudeCode.ts   runs `claude -p` with no tools and a minimal environment
template/             the content repo users create (workflow, skill, voice, config)
```

The rule of thumb: **plain code decides what is true, and the model only words it.** Anything that picks numbers, ranks stories, checks drafts or publishes is plain code with tests. The model gets facts and returns JSON that's validated against a schema.

## Rules every change must keep

These are the product. A PR that weakens one will not be merged, however useful it is.

1. No number reaches a published post unless it comes from a fact (see [docs/drafts.md](docs/drafts.md)).
2. Metrics without `"public": true` are never sent to the model, written to a draft, or sent to a publisher.
3. The model never gets tools, MCP servers, the GitHub token, or project secrets.
4. Nothing is published without a person merging a PR.
5. Only collaborators with write access can trigger anything that uses the model.

## Adding a source

A source turns some system (an analytics tool, a database view, an app store) into an Outcome Snapshot, or into `shipped` items.

1. Add `src/sources/<name>.ts` exporting an async function that returns a `Snapshot` (validated with `parseSnapshot`) or `Shipped[]`.
2. Add its config shape to `outcomesSource` (or a new field on `projects[]`) in `src/config.ts`. Use `z.strictObject` and put credentials in `headers` so `${NAME}` interpolation applies.
3. Call it from `collect.ts`.
4. Take `fetchImpl` as a parameter so tests can pass a fake, and set a timeout on every request.
5. Return totals only. Default every metric to `public: false` unless the user opts in.
6. Add tests and document it in [docs/config.md](docs/config.md).

## Adding a publisher

1. Add a variant to the `publisher` union in `src/config.ts`.
2. Handle it in `publishApproved` (after merge) and, if it makes sense locally, in `publishDraftLocally` in `src/publishers.ts`.
3. Publishers only run after merge. Never call one from the drafting path.
4. Add tests and document it in [docs/config.md](docs/config.md).

## Tests

- Every behaviour change needs a test. `test/helpers.ts` has fakes for the LLM, GitHub and `fetch`. Tests never call the real Claude or GitHub.
- Changes to `factcheck.ts` need tests for both directions: a number that should pass, and one that should fail.
- CI runs typecheck, tests, build, `validate examples/outcomes.json`, and checks that `schema/` is up to date.

## Pull requests

- Keep each PR to one change. Explain the why in the description.
- Update the docs in the same PR when behaviour, config or commands change.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
- Don't commit `dist/`. It's built in CI and in the action.

## Releasing (maintainers)

1. Move the **Unreleased** entries in `CHANGELOG.md` under the new version.
2. Bump `version` in `package.json`.
3. Tag `vX.Y.Z` and push it.
4. Move the `v0` tag to the same commit (`git tag -f v0 && git push -f origin v0`). The template uses `@v0`, so this is what ships to users.
5. Create a GitHub release with the changelog section.

## Code of conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
