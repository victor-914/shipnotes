import { pctChange, type Fact } from "./facts.js";

// The "no made-up numbers" guarantee. Every number in a draft must match a
// value from its facts (or a simple rounding of one). This is plain code
// checking the model's output, and anyone's later edits; it trusts no one.

export interface FactCheckResult {
  ok: boolean;
  checked: number;
  unverified: string[];
}

const EPSILON = 1e-9;

function roundings(n: number): number[] {
  const out = [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100];
  return [...out, ...out.map(Math.abs)];
}

/** Every number a draft is allowed to contain, derived from its facts. */
export function allowedNumbers(facts: Fact[], allowSmallIntegers: boolean): number[] {
  const allowed: number[] = [];
  const add = (...values: number[]) => values.forEach((v) => allowed.push(...roundings(v)));

  for (const f of facts) {
    const delta = f.after - f.before;
    add(f.after, f.before, delta);
    const pct = pctChange(f);
    if (pct !== null) add(pct);
    // A ratio is often written as a percentage: 0.19 → 19%.
    if (f.unit === "ratio") add(f.after * 100, f.before * 100, delta * 100);
    // Seconds are often written in ms, and the other way round.
    if (f.unit === "seconds") add(f.after * 1000, f.before * 1000);
    if (f.unit === "ms") add(f.after / 1000, f.before / 1000);
    // "2x faster", "doubled": the ratio between the two values.
    if (f.before !== 0 && f.after !== 0) add(f.after / f.before, f.before / f.after);

    // Dates, and numbers that are part of names.
    for (const date of [f.period.from, f.period.to, ...f.shipped.map((x) => x.date)]) {
      const [y, m, d] = date.split("-").map(Number);
      add(y!, m!, d!);
    }
    for (const text of [f.project_name, f.label ?? "", ...f.shipped.map((x) => x.title)]) {
      for (const n of extractNumbers(text)) add(n.value);
    }
    add(f.shipped.length);
  }
  add(facts.length);
  if (allowSmallIntegers) for (let i = 0; i <= 10; i++) add(i);
  return allowed;
}

interface FoundNumber {
  raw: string;
  value: number;
}

export function extractNumbers(text: string): FoundNumber[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/\]\([^)]*\)/g, "]") // link targets
    .replace(/https?:\/\/\S+/g, " ") // bare URLs
    .replace(/^\s*\d+\.\s/gm, " ") // numbered-list markers
    .replace(/^#{1,6}\s/gm, " "); // heading markers

  const found: FoundNumber[] = [];
  const pattern = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?([kKmM])?(?![\w])/g;
  for (const match of cleaned.matchAll(pattern)) {
    const base = Number(`${match[1]!.replace(/,/g, "")}${match[2] ?? ""}`);
    const suffix = match[3]?.toLowerCase();
    const value = suffix === "k" ? base * 1_000 : suffix === "m" ? base * 1_000_000 : base;
    found.push({ raw: match[0].trim(), value });
  }
  return found;
}

export function factCheck(text: string, facts: Fact[], allowSmallIntegers = true): FactCheckResult {
  const allowed = allowedNumbers(facts, allowSmallIntegers);
  const numbers = extractNumbers(text);
  const unverified = numbers
    .filter((n) => !allowed.some((a) => Math.abs(a - n.value) < EPSILON || matchesLooseRounding(a, n.value)))
    .map((n) => n.raw);
  return { ok: unverified.length === 0, checked: numbers.length, unverified: [...new Set(unverified)] };
}

// "2,140" written as "2.1k" or "2,100": allow rounding to 2 significant figures
// only for numbers of 1,000 and above.
function matchesLooseRounding(allowed: number, found: number): boolean {
  if (Math.abs(allowed) < 1000) return false;
  const magnitude = 10 ** (Math.floor(Math.log10(Math.abs(allowed))) - 1);
  return Math.abs(Math.round(allowed / magnitude) * magnitude - found) < EPSILON;
}
