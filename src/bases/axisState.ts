import type { BasesViewConfig } from "obsidian";
import type { AxisBucketSpec } from "./bucketSpec";
import { defaultBucketSpec } from "./bucketSpec";

export type AxisId = "rows" | "cols";

export type AxisStateV1 = {
  v: 1;
  // Manual order of bucket keys (stable strings).
  order?: string[];
  // Display alias per bucket key.
  aliases?: Record<string, string>;
  bucketSpec?: AxisBucketSpec;
};

const KEY_ROWS = "rowsAxisState";
const KEY_COLS = "colsAxisState";

function keyFor(axis: AxisId): string {
  return axis === "rows" ? KEY_ROWS : KEY_COLS;
}

export function getAxisState(config: BasesViewConfig, axis: AxisId): AxisStateV1 {
  const raw = config.get(keyFor(axis));

  // We store objects directly via config.set(); but tolerate JSON strings if needed.
  if (raw && typeof raw === "object") {
    const o = raw as Partial<AxisStateV1>;
    if (o.v === 1) return {
      v: 1,
      order: o.order ?? [],
      aliases: o.aliases ?? {},
      bucketSpec: (o.bucketSpec) ?? defaultBucketSpec(),
    };
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const o = JSON.parse(raw) as Partial<AxisStateV1>;
      if (o.v === 1) return {
        v: 1,
        order: o.order ?? [],
        aliases: o.aliases ?? {},
        bucketSpec: (o.bucketSpec) ?? defaultBucketSpec(),
      };
    } catch {
      // ignore
    }
  }
  return { v: 1, order: [], aliases: {}, bucketSpec: defaultBucketSpec() };
}

export function setAxisState(config: BasesViewConfig, axis: AxisId, next: AxisStateV1): void {
  config.set(keyFor(axis), next);
}

export function setAlias(config: BasesViewConfig, axis: AxisId, bucketKey: string, alias: string | null): void {
  const st = getAxisState(config, axis);
  const aliases = { ...(st.aliases ?? {}) };
  if (!alias || alias.trim().length === 0) delete aliases[bucketKey];
  else aliases[bucketKey] = alias.trim();
  setAxisState(config, axis, { ...st, aliases });
}

export function setOrder(config: BasesViewConfig, axis: AxisId, order: string[]): void {
  const st = getAxisState(config, axis);
  setAxisState(config, axis, { ...st, order });
}

export function setBucketSpec(config: BasesViewConfig, axis: AxisId, spec: AxisBucketSpec): void {
  const st = getAxisState(config, axis);
  setAxisState(config, axis, { ...st, bucketSpec: spec });
}
