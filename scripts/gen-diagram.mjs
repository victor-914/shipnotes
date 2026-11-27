// Generates docs/images/architecture-{light,dark}.svg (the README diagram).
// Usage: node scripts/gen-diagram.mjs docs/images
import { writeFileSync, mkdirSync } from "node:fs";

const out = process.argv[2];
mkdirSync(out, { recursive: true });

const themes = {
  light: {
    bg: "#ffffff", group: "#f6f8fa", groupStroke: "#d0d7de", box: "#ffffff", boxStroke: "#8c959f",
    text: "#1f2328", muted: "#59636e", arrow: "#6e7781",
    claude: "#fbefe8", claudeStroke: "#c96442", check: "#dafbe1", checkStroke: "#1a7f37",
    you: "#ddf4ff", youStroke: "#0969da",
  },
  dark: {
    bg: "#0d1117", group: "#161b22", groupStroke: "#30363d", box: "#0d1117", boxStroke: "#6e7681",
    text: "#e6edf3", muted: "#9198a1", arrow: "#8b949e",
    claude: "#33201a", claudeStroke: "#e08a63", check: "#0f2d1a", checkStroke: "#3fb950",
    you: "#0c2d4f", youStroke: "#4493f8",
  },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function box(x, y, w, h, title, sub = [], cls = "box") {
  const cx = x + w / 2;
  const lines = 1 + sub.length;
  const top = y + h / 2 - ((lines - 1) * 15) / 2 + 5;
  return [
    `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`,
    `<text class="t" x="${cx}" y="${top}" text-anchor="middle">${esc(title)}</text>`,
    ...sub.map((s, i) => `<text class="s" x="${cx}" y="${top + 16 + i * 15}" text-anchor="middle">${esc(s)}</text>`),
  ].join("\n");
}
const group = (x, y, w, h, label) =>
  `<rect class="g" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>\n<text class="gl" x="${x + 16}" y="${y + 24}">${esc(label)}</text>`;
const arrow = (d) => `<path class="a" d="${d}" marker-end="url(#ah)"/>`;
const line = (d) => `<path class="a" d="${d}"/>`;
const label = (x, y, s, anchor = "start") => `<text class="l" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;

const body = [
  // Your projects
  group(20, 40, 180, 300, "YOUR PROJECTS"),
  box(36, 84, 148, 70, "Outcome Snapshot", ["outcomes.json", "totals only"]),
  box(36, 184, 148, 70, "Project repos", ["commits become", "“shipped” items"]),
  label(110, 292, "Private metrics", "middle"),
  label(110, 308, "never leave here", "middle"),

  // shipnotes
  group(230, 40, 520, 300, "SHIPNOTES · IN YOUR GITHUB ACTIONS"),
  box(250, 84, 110, 70, "Collect", ["fetch + validate"]),
  box(378, 84, 110, 70, "Find stories", ["what moved,", "ranked"]),
  box(506, 84, 110, 70, "Facts", ["public metrics", "only"]),
  box(634, 84, 100, 70, "Fact-check", ["every number", "from facts"], "check"),
  box(378, 200, 238, 90, "Claude Code", ["topics · drafts · rewrites", "channel versions", "no tools · no secrets"], "claude"),
  arrow("M184 119 H246"),
  arrow("M184 219 H215 V140 H246"),
  arrow("M360 119 H374"),
  arrow("M488 119 H502"),
  arrow("M561 154 V196"),
  label(569, 182, "facts"),
  arrow("M616 245 H684 V158"),
  label(624, 238, "words"),

  // content repo
  group(780, 40, 200, 300, "YOUR CONTENT REPO"),
  box(796, 84, 168, 60, "Post ideas Issue", ["weekly topics"]),
  box(796, 172, 168, 60, "Draft pull request", ["drafts/*.md · status"]),
  box(796, 260, 168, 60, "published/", ["approved posts"]),
  arrow("M734 119 H792"),
  arrow("M760 119 V202 H792"),
  label(747, 76, "GitHub API", "middle"),
  arrow("M880 144 V168"),
  label(888, 161, "pick a topic"),
  arrow("M880 232 V256"),
  label(888, 249, "you merge"),

  // after merge
  `<text class="gl" x="1054" y="160" text-anchor="middle">AFTER MERGE</text>`,
  box(1004, 172, 100, 60, "Your site", ["http publisher"]),
  box(1004, 260, 100, 60, "Channels", ["LinkedIn ·", "Substack text"]),
  arrow("M964 290 H1000"),
  arrow("M984 290 V202 H1000"),

  // you
  `<text class="gl" x="20" y="374">YOU</text>`,
  box(36, 384, 148, 64, "Publish a snapshot", ["for each project"], "you"),
  box(378, 384, 238, 64, "Set up once", ["config · VOICE.md · Claude token"], "you"),
  box(796, 384, 168, 64, "Review", ["tick, edit, /shipnotes", "rewrite, merge"], "you"),
  arrow("M110 384 V344"),
  arrow("M497 384 V344"),
  arrow("M880 384 V344"),

  // legend
  `<rect class="box" x="20" y="478" width="18" height="14" rx="3"/>`, label(46, 489, "plain code"),
  `<rect class="claude" x="140" y="478" width="18" height="14" rx="3"/>`, label(166, 489, "Claude: writes words, never numbers"),
  `<rect class="check" x="390" y="478" width="18" height="14" rx="3"/>`, label(416, 489, "gate: blocks unverified numbers"),
  `<rect class="you" x="630" y="478" width="18" height="14" rx="3"/>`, label(656, 489, "you: nothing is published until you merge"),
].join("\n");

for (const [name, c] of Object.entries(themes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 510" width="1120" height="510" role="img" aria-labelledby="title desc">
<title id="title">shipnotes architecture</title>
<desc id="desc">Your projects publish an Outcome Snapshot and commits. shipnotes, running in GitHub Actions, collects them, finds which public metrics moved, turns them into facts, asks Claude Code for topics and drafts, and fact-checks every number. It opens a Post ideas Issue and draft pull requests in your content repo. When you merge, the post moves to published/ and goes to your site and channels.</desc>
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .bg { fill: ${c.bg}; }
  .g { fill: ${c.group}; stroke: ${c.groupStroke}; stroke-width: 1; }
  .gl { fill: ${c.muted}; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; }
  .box { fill: ${c.box}; stroke: ${c.boxStroke}; stroke-width: 1.2; }
  .claude { fill: ${c.claude}; stroke: ${c.claudeStroke}; stroke-width: 1.5; }
  .check { fill: ${c.check}; stroke: ${c.checkStroke}; stroke-width: 1.5; }
  .you { fill: ${c.you}; stroke: ${c.youStroke}; stroke-width: 1.3; stroke-dasharray: 5 4; }
  .t { fill: ${c.text}; font-size: 14px; font-weight: 600; }
  .s { fill: ${c.muted}; font-size: 11.5px; }
  .l { fill: ${c.muted}; font-size: 11px; }
  .a { fill: none; stroke: ${c.arrow}; stroke-width: 1.4; }
  .ah { fill: ${c.arrow}; }
</style>
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah" d="M0 0 L10 5 L0 10 z"/></marker></defs>
<rect class="bg" width="1120" height="510"/>
${body}
</svg>
`;
  writeFileSync(`${out}/architecture-${name}.svg`, svg);
}
