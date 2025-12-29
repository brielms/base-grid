export type BucketType = "categorical" | "dateRelative" | "numberRanges" | "numberQuantiles";

export type DateRelativeMode = "overdue-today-week-nextweek-month-later";

export type NumberRange = {
  label: string;
  min?: number; // inclusive
  max?: number; // exclusive
};

export type AxisBucketSpec =
  | { type: "categorical" }
  | { type: "dateRelative"; mode: DateRelativeMode }
  | { type: "numberRanges"; ranges: NumberRange[]; invalidLabel?: string }
  | { type: "numberQuantiles"; k: number; invalidLabel?: string };

export function defaultBucketSpec(): AxisBucketSpec {
  return { type: "categorical" };
}

export function isReversibleSpec(spec: AxisBucketSpec): boolean {
  return spec.type === "categorical";
}
