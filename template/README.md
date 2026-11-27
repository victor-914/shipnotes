# My shipnotes

Blog posts written from my projects' real outcomes, by [shipnotes](https://github.com/victor-914/shipnotes), reviewed and approved by me.

## Set up (5 minutes)

1. **Use this template** to create your own repo.
2. Edit `shipnotes.config.yaml`: your name, and the `outcomes.json` URL of each project ([spec](https://github.com/victor-914/shipnotes/blob/main/SPEC.md)).
3. Edit `VOICE.md` so drafts sound like you.
4. Run `claude setup-token` on your computer and save the token as the repo secret `CLAUDE_CODE_OAUTH_TOKEN`. Add any other secrets your config names.
5. Actions → shipnotes → **Run workflow** to get your first post ideas now instead of waiting for Monday.

## How it works

| When | What happens |
|---|---|
| Every Monday | A **Post ideas** Issue lists topics from what moved in your projects |
| You tick a topic, or comment `/shipnotes draft 2` | A pull request opens with the draft in `drafts/` |
| You edit it (GitHub, or Claude at claude.ai/code) | Every push is fact-checked: numbers must come from your data |
| You comment `/shipnotes rewrite <what to change>` | The draft is rewritten and re-checked |
| You merge | The post moves to `published/` and goes to your configured channels |

Only people with write access to this repo can trigger drafting.

**Optional:** in Settings → Branches, require the `shipnotes/fact-check` status before merging.
