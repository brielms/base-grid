import { ListValue, type Value } from "obsidian";
import { EMPTY_KEY, valueToBucketKey } from "./valueCodec";

export type MultiValueMode = "disallow" | "explode" | "primary";

function uniq(keys: string[]): string[] {
  return Array.from(new Set(keys));
}

function listElements(v: ListValue): Value[] {
  // Bases ListValue usually has .values: Value[]; fall back to empty array safely.
  const anyV = v as unknown;
  const arr = anyV.values;
  return Array.isArray(arr) ? (arr as Value[]) : [];
}

export function isMultiValue(v: Value | null): boolean {
  return v instanceof ListValue;
}

/**
 * Returns one or many bucket keys for a value, depending on mode.
 * - disallow: treat list as a single combined value (e.g. "high, urgent")
 * - explode: one key per element, de-duped
 * - primary: first element only
 */
export function bucketKeysForValue(v: Value | null, mode: MultiValueMode): string[] {
  if (v === null) return [EMPTY_KEY];

  if (v instanceof ListValue) {
    const elems = listElements(v);
    const keys = uniq(elems.map((e) => valueToBucketKey(e)).filter((k) => k !== EMPTY_KEY));

    if (mode === "explode") return keys.length > 0 ? keys : [EMPTY_KEY];
    if (mode === "primary") return keys.length > 0 ? [keys[0]] : [EMPTY_KEY];

    // disallow
    return [valueToBucketKey(v as unknown)];
  }

  const key = valueToBucketKey(v);
  return [key];
}
