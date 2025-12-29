import type { Value } from "obsidian";

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

  const rest = Array.from(set).sort((a, b) => a.localeCompare(b));

  // Keep (empty) last by default (but still visible if includeEmpty)
  const restNoEmpty = rest.filter((k) => k !== EMPTY_KEY);
  const hasEmpty = rest.includes(EMPTY_KEY);

  return hasEmpty ? [...out, ...restNoEmpty, EMPTY_KEY] : [...out, ...restNoEmpty];
}
