import type { Value } from "obsidian";
import { INVALID_KEY } from "./bucketEngine";
import type { AxisBucketSpec } from "./bucketSpec";

export const EMPTY_KEY = "__EMPTY__";

function isNullishString(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "null" || t === "undefined";
}

export function valueToBucketKey(value: Value | null): string {
  if (value === null) return EMPTY_KEY;

  const s = value.toString();
  if (!s || isNullishString(s)) return EMPTY_KEY;

  // Treat empty-string as empty
  if (s.trim().length === 0) return EMPTY_KEY;

  return s;
}

export function bucketKeyToDisplay(key: string): string {
  if (key === EMPTY_KEY) return "(empty)";
  return key;
}

export function displayForBucketKey(key: string, aliases?: Record<string, string>): string {
  if (aliases && aliases[key]) return aliases[key];
  if (key === EMPTY_KEY) return "(empty)";
  return key;
}

function isStrictNumberKey(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s);
}

function isISODateKey(s: string): boolean {
  // Basic YYYY-MM-DD pattern or valid ISO date
  const basicDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (basicDatePattern.test(s)) return true;

  // For broader ISO parsing, try Date.parse but be conservative
  const parsed = Date.parse(s);
  return !isNaN(parsed) && isFinite(parsed);
}

function smartCategoricalSort(keys: string[]): string[] {
  // Separate special keys
  const specialKeys = [INVALID_KEY, EMPTY_KEY];
  const remainingKeys = keys.filter(k => !specialKeys.includes(k));

  if (remainingKeys.length <= 1) {
    return [...remainingKeys, ...specialKeys.filter(k => keys.includes(k))];
  }

  let sorted: string[];

  if (remainingKeys.every(isStrictNumberKey)) {
    // Sort numerically
    sorted = remainingKeys.sort((a, b) => Number(a) - Number(b));
  } else if (remainingKeys.every(isISODateKey)) {
    // Sort by date
    sorted = remainingKeys.sort((a, b) => {
      const dateA = Date.parse(a);
      const dateB = Date.parse(b);
      return dateA - dateB;
    });
  } else {
    // Fallback to lexicographic
    sorted = remainingKeys.sort((a, b) => a.localeCompare(b));
  }

  // Append special keys in order: INVALID_KEY then EMPTY_KEY
  const result = [...sorted];
  if (keys.includes(INVALID_KEY)) result.push(INVALID_KEY);
  if (keys.includes(EMPTY_KEY)) result.push(EMPTY_KEY);

  return result;
}

export function applyManualOrder(keys: string[], order?: string[]): string[] {
  const set = new Set(keys);

  const out: string[] = [];
  if (order && order.length > 0) {
    for (const k of order) {
      if (set.has(k)) {
        out.push(k);
        set.delete(k);
      }
    }
  }

  // Use smart categorical sorting for remaining keys
  const rest = smartCategoricalSort(Array.from(set));

  return [...out, ...rest];
}

/**
 * Determines if a bucket key can be mapped back to a writable value for frontmatter.
 * Used when creating new notes in matrix cells to set appropriate properties.
 */
export function bucketKeyToWritableValue(
  spec: AxisBucketSpec,
  key: string
): { ok: boolean; value?: any; reason?: string } {
  // Skip empty buckets
  if (key === EMPTY_KEY) {
    return { ok: false };
  }

  // Skip invalid buckets
  if (key === INVALID_KEY) {
    return { ok: false, reason: "invalid" };
  }

  // Handle different bucket spec types
  if (spec.type === "categorical") {
    // For categorical, we can use the key directly as it's a string representation
    // of the original value (from valueToBucketKey)
    return { ok: true, value: key };
  }

  if (spec.type === "dateRelative") {
    // Derived buckets - not supported for writeback yet
    return { ok: false, reason: "derived-not-supported" };
  }

  if (spec.type === "numberRanges") {
    // For MVP, skip range-based buckets as they don't have clean midpoint mapping
    return { ok: false, reason: "derived-not-supported" };
  }

  if (spec.type === "numberQuantiles") {
    // Quantile buckets are derived - not supported for writeback yet
    return { ok: false, reason: "derived-not-supported" };
  }

  // Fallback for unknown spec types
  return { ok: false, reason: "unknown-spec-type" };
}
