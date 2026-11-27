# Changelog

All notable changes to shipnotes and to the Outcome Snapshot spec. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [semver](https://semver.org/), but while shipnotes is `0.x`, minor versions may include breaking changes. They're marked **Breaking**.

The template's workflow uses `victor-914/shipnotes@v0`, which always points at the latest `0.x` release.

## [Unreleased]

### Added
- Docs: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, a config reference, a draft format and fact-check reference, an action reference, how it works, troubleshooting, and a guide to publishing Outcome Snapshots.
- Issue and pull request templates.

### Changed
- `shipnotes --help` now lists the `check --strict` flag.

### Fixed
- Template: `/shipnotes` commands with leading spaces or blank lines before them are accepted.
- Template: pushes made by shipnotes itself don't re-trigger the fact-check workflow.

## [0.2.0] - 2026-11-27

First public release.

### Added
- **Outcome Snapshot spec `outcomes/0.1`** ([SPEC.md](SPEC.md)) with a JSON schema in `schema/outcomes.schema.json`.
- **GitHub review loop**, all from one workflow in your content repo:
  - a weekly "Post ideas" Issue with ranked topics
  - `/shipnotes draft <n>`, or ticking a topic, opens a draft PR
  - `/shipnotes rewrite <what to change>` on a draft PR
  - `/shipnotes skip` closes the Issue
  - the `shipnotes/fact-check` status on every push
  - merging moves the post to `published/` and sends it to publishers
- **Fact-check**: every number in a draft must come from its `facts:` frontmatter, or a simple rounding of one.
- **Channel versions** for LinkedIn and Substack, fact-checked and handed back ready to paste after merge.
- **Sources**: Outcome Snapshot from a URL or file, and commits from GitHub repos as shipped items.
- **Publishers**: `markdown` (local runs) and `http` (`on_merge: published | draft`).
- **CLI**: `run`, `topics`, `check`, `validate`, `event`.
- **Template content repo** with workflow, Claude skill, `CLAUDE.md`, `VOICE.md` and config.
- Uses your own Claude Code (`claude -p`) with no tools, no MCP servers and a minimal environment.

[Unreleased]: https://github.com/victor-914/shipnotes/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/victor-914/shipnotes/releases/tag/v0.2.0
