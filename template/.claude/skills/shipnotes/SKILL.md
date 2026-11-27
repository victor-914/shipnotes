---
name: shipnotes
description: Review, edit and approve shipnotes blog drafts in this repo. Use when the user asks about their drafts, post ideas, wants a draft edited or rewritten, wants to check a draft's numbers, or wants to publish (merge) one.
---

# shipnotes drafts

This repo holds blog posts written from the author's project outcomes.

- `drafts/` — drafts under review. Each arrives on its own branch (`shipnotes/<date>-<slug>`) with a pull request titled "Draft: …".
- `published/` — approved posts. Merging a draft PR moves the file here automatically.
- `VOICE.md` — how the author writes. Follow it for every edit.
- Open Issues labelled `shipnotes` — this week's post ideas.

## Finding drafts

Open draft PRs: `gh pr list --search "Draft: in:title" --state open`. Work on the PR's own branch (`gh pr checkout <n>`), never on the default branch.

## Editing a draft

1. Edit the Markdown body, `title` or `excerpt`. Do **not** edit the `facts:` block in the frontmatter: it is the evidence the post is checked against.
2. **Numbers:** only use numbers that appear in `facts` (before, after, their difference, the percent change, or simple roundings). If the author asks for a number that isn't there, say so and phrase it in words instead. Never estimate, total or average.
3. Don't claim one change caused a metric to move. "In the same week" is fine; "because of" is not.
4. Run the fact-check before every commit:

   ```sh
   npx -y github:victor-914/shipnotes check drafts/<file>.md
   ```

   It must print ✓. If it lists numbers, remove or reword them and run it again.
5. Commit to the PR branch with a short message and push. GitHub re-runs the same check on the PR.

## Topics

To draft a topic from the ideas Issue, comment on it: `/shipnotes draft <number>` (`gh issue comment <n> --body "/shipnotes draft 2"`). To have GitHub rewrite a draft instead of editing it here: comment `/shipnotes rewrite <what to change>` on the PR.

## Publishing

Publishing means merging the draft PR, and only when the author explicitly says so ("publish it", "merge it"). Check that the `shipnotes/fact-check` status is green first (`gh pr checks <n>`). Never push to the default branch and never post anywhere directly: the merge workflow moves the file to `published/` and sends it to the configured channels.

To discard a draft, close its PR without merging.
