# Publishing an Outcome Snapshot

shipnotes never connects to your database or analytics. Each project publishes one small JSON document, an [Outcome Snapshot](../SPEC.md), and shipnotes reads it. This page shows common ways to produce one.

## What to put in it

- **3–8 metrics** that tell the story of the project: one that matters most (`north_star`), and a few you'd be happy to talk about.
- **`previous` for each one.** Without it there's no change, and so no story.
- **`"public": true` only on numbers you'd post on LinkedIn.** Revenue, user counts and anything sensitive can stay private. They still help you, but they're never shown to the model or published.
- **Totals only.** No names, emails, IDs or anything about one person.
- **`better: "lower"`** for anything where down is good: load time, error rate, churn, cost.

Check it with:

```sh
npx -y github:victor-914/shipnotes validate outcomes.json
# OK: Casmir Realty, 3 metrics (2 public)
```

Your editor can also validate it if you add `"$schema": "https://raw.githubusercontent.com/victor-914/shipnotes/main/schema/outcomes.schema.json"` at the top.

## The period

`period.from` and `period.to` are inclusive. `previous` is the value for the period of the same length just before. For a weekly post on Mondays, use the last 7 full days:

```
period.from = today − 7 days
period.to   = today − 1 day
previous    = the 7 days before period.from
```

## Option 1: an endpoint

Serve it from your app, conventionally at `GET /.well-known/outcomes.json`, behind a read-only key.

**Next.js (App Router):**

```ts
// app/.well-known/outcomes.json/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.OUTCOMES_KEY}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const day = 86_400_000;
  const to = new Date(Date.now() - day);
  const from = new Date(to.getTime() - 6 * day);
  const prevFrom = new Date(from.getTime() - 7 * day);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const bookings = await db.booking.count({ where: { paidAt: { gte: from, lte: to } } });
  const bookingsBefore = await db.booking.count({ where: { paidAt: { gte: prevFrom, lt: from } } });

  return NextResponse.json({
    spec: "outcomes/0.1",
    project: { name: "My App", slug: "my-app", url: "https://myapp.com" },
    period: { from: iso(from), to: iso(to) },
    north_star: "paid_bookings",
    metrics: [
      { name: "paid_bookings", label: "Paid bookings", value: bookings, previous: bookingsBefore, public: false },
    ],
    generated_at: new Date().toISOString(),
  });
}
```

Then in `shipnotes.config.yaml`:

```yaml
projects:
  - outcomes:
      url: https://myapp.com/.well-known/outcomes.json
      headers: { Authorization: "Bearer ${MYAPP_OUTCOMES_KEY}" }
```

The same shape works in any framework: run a few `COUNT`/`SUM` queries for two periods and return JSON.

## Option 2: a file updated by CI

Good for static sites and numbers that come from tools, such as Lighthouse.

```yaml
# .github/workflows/outcomes.yml in your project repo
on:
  schedule: [{ cron: "0 4 * * 1" }]   # before shipnotes runs at 06:00
  workflow_dispatch:
permissions: { contents: write }
jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node scripts/outcomes.mjs > outcomes.json
      - run: npx -y github:victor-914/shipnotes validate outcomes.json
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add outcomes.json && git commit -m "outcomes: weekly snapshot" || true
          git push
```

Point shipnotes at the raw file:

```yaml
projects:
  - outcomes:
      url: https://raw.githubusercontent.com/you/project/main/outcomes.json
      # private repo: headers: { Authorization: "Bearer ${PROJECT_READ_TOKEN}" }
```

Keep `previous` by reading last week's `outcomes.json` before writing the new one.

## Option 3: a file next to the config

For trying things out, or for projects you update by hand, put the file in your content repo:

```yaml
projects:
  - outcomes: { file: ./outcomes/side-project.json }
```

## Shipped items

`shipped` is what changed in the period, written the way you'd say it to a customer ("Faster homepage", not "refactor LCP hero img"). You can:

- write them in the snapshot yourself,
- list repos in `projects[].repos`, and shipnotes adds the period's commit titles, or
- both. Duplicate titles are merged.

Good commit messages make better posts. Numbers in shipped titles become allowed in drafts, so "Release 4" lets a post say "release 4".
