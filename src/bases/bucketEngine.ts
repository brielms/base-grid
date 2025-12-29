import { moment, type Value } from "obsidian";
import { EMPTY_KEY, valueToBucketKey } from "./valueCodec";
import type { AxisBucketSpec, NumberRange } from "./bucketSpec";

export const INVALID_KEY = "__INVALID__";

export function defaultOrderForSpec(spec: AxisBucketSpec): string[] | null {
  if (spec.type === "dateRelative") {
    return ["Overdue", "Today", "This Week", "Next Week", "This Month", "Later", EMPTY_KEY, INVALID_KEY];
  }
  return null;
}

function parseNumber(v: Value): number | null {
  const s = v.toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: Value): moment.Moment | null {
  const s = v.toString().trim();
  if (!s) return null;
  const m = moment(s, ["YYYY-MM-DD", moment.ISO_8601], true);
  return m.isValid() ? m : null;
}

export function bucketScalarValue(
  v: Value | null,
  spec: AxisBucketSpec,
  now: Date
): { bucketKey: string; reversibleValue?: string } {
  if (v === null) return { bucketKey: EMPTY_KEY };

  if (spec.type === "categorical") {
    const k = valueToBucketKey(v);
    return k === EMPTY_KEY ? { bucketKey: EMPTY_KEY } : { bucketKey: k, reversibleValue: k };
  }

  if (spec.type === "numberRanges") {
    const n = parseNumber(v);
    const invalid = spec.invalidLabel ?? INVALID_KEY;
    if (n === null) return { bucketKey: invalid };

    for (const r of spec.ranges) {
      const minOk = r.min === undefined || n >= r.min;
      const maxOk = r.max === undefined || n < r.max;
      if (minOk && maxOk) return { bucketKey: r.label };
    }
    return { bucketKey: invalid };
  }

  if (spec.type === "numberQuantiles") {
    // Quantiles are computed at render-time because they depend on distribution.
    // Return placeholder; caller must override with computed quantile bucket.
    const n = parseNumber(v);
    const invalid = spec.invalidLabel ?? INVALID_KEY;
    if (n === null) return { bucketKey: invalid };
    return { bucketKey: `__QVALUE__:${n}` };
  }

  // dateRelative
  const d = parseDate(v);
  if (!d) return { bucketKey: INVALID_KEY };

  const today = moment(now).startOf("day");
  const day = d.clone().startOf("day");

  if (day.isBefore(today, "day")) return { bucketKey: "Overdue" };
  if (day.isSame(today, "day")) return { bucketKey: "Today" };

  const endThisWeek = today.clone().endOf("week");
  const endNextWeek = today.clone().add(1, "week").endOf("week");
  const endThisMonth = today.clone().endOf("month");

  if (day.isSameOrBefore(endThisWeek, "day")) return { bucketKey: "This Week" };
  if (day.isSameOrBefore(endNextWeek, "day")) return { bucketKey: "Next Week" };
  if (day.isSameOrBefore(endThisMonth, "day")) return { bucketKey: "This Month" };
  return { bucketKey: "Later" };
}

export function computeQuantileBuckets(values: number[], k: number): { edges: number[]; labels: string[] } {
  const clean = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const n = clean.length;
  if (n === 0 || k <= 1) return { edges: [], labels: [] };

  const edges: number[] = [];
  for (let i = 1; i < k; i++) {
    const idx = Math.floor((i * (n - 1)) / k);
    if (idx >= 0 && idx < n) {
      edges.push(clean[idx]!);
    }
  }

  const labels: string[] = [];
  for (let i = 0; i < k; i++) labels.push(`Q${i + 1}`);

  return { edges, labels };
}

export function quantileLabelFor(n: number, edges: number[]): string {
  // edges length = k-1
  for (let i = 0; i < edges.length; i++) {
    if (n <= edges[i]!) return `Q${i + 1}`;
  }
  return `Q${edges.length + 1}`;
}
