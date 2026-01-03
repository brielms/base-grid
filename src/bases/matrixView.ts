import {
  BasesView,
  type QueryController,
  type BasesPropertyId,
  ListValue,
  TFile,
  Notice,
  Menu,
} from "obsidian";

import { EMPTY_KEY, applyManualOrder, displayForBucketKey, bucketKeyToWritableValue } from "./valueCodec";
import { bucketScalarValue, computeQuantileBuckets, quantileLabelFor, defaultOrderForSpec, INVALID_KEY } from "./bucketEngine";
import { isMultiValue, type MultiValueMode } from "./multiValue";
import { parseCommaList, asNoteProp } from "./cardConfig";
import type { CellMode, DragPayload } from "./matrixTypes";
import { MatrixDrilldownModal } from "../ui/drilldownModal";
import { TextPromptModal } from "../ui/textPromptModal";
import { CreateNoteModal } from "../ui/createNoteModal";
import { getAxisState, setAlias, setOrder, setBucketSpec } from "./axisState";
import { BucketConfigModal } from "../ui/bucketConfigModal";
import { renderAxisBar } from "../ui/axisBar";
import type { AxisBucketSpec } from "./bucketSpec";
import { isReversibleSpec } from "./bucketSpec";

export const VIEW_TYPE_MATRIX = "bases-matrix-view.matrix";

type CellKey = `${string}||${string}`;

function cellKey(rowKey: string, colKey: string): CellKey {
  return `${rowKey}||${colKey}`;
}

function isNoteProperty(propId: BasesPropertyId): boolean {
  return propId.startsWith("note.");
}

function notePropName(propId: BasesPropertyId): string {
  // "note.status" -> "status"
  const idx = propId.indexOf(".");
  return idx >= 0 ? propId.slice(idx + 1) : propId;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim().length) return [v.trim()];
  return [];
}

function dedupe(a: string[]): string[] {
  return Array.from(new Set(a));
}

function writeAxisMove(
  fm: unknown,
  propName: string,
  fromKey: string,
  toKey: string,
  mode: MultiValueMode
): void {
  if (toKey === EMPTY_KEY) {
    // Clear property entirely when moving to (empty)
    delete fm[propName];
    return;
  }

  const cur = fm[propName];

  if (mode === "explode") {
    // Treat scalar as single-item list; remove fromKey; add toKey; keep tidy (scalar if length=1)
    let arr = toList(cur);
    if (fromKey !== EMPTY_KEY) arr = arr.filter((x) => x !== fromKey);
    arr.push(toKey);
    arr = dedupe(arr);

    if (arr.length === 0) delete fm[propName];
    else if (arr.length === 1) fm[propName] = arr[0];
    else fm[propName] = arr;
    return;
  }

  if (mode === "primary") {
    // If array: replace first element only; keep rest.
    if (Array.isArray(cur)) {
      const arr = cur.map(String);
      if (arr.length === 0) fm[propName] = [toKey];
      else {
        arr[0] = toKey;
        fm[propName] = arr;
      }
      return;
    }
    // Scalar or missing: set scalar
    fm[propName] = toKey;
    return;
  }

  // disallow: scalar set
  fm[propName] = toKey;
}

function bucketKeysFor(
  v: unknown,
  multiMode: MultiValueMode,
  spec: AxisBucketSpec,
  now: Date,
  quantEdges: number[]
): string[] {
  // Reuse existing multi-value extraction:
  // - explode: bucket each element
  // - primary: bucket first element
  // - disallow: bucket the whole list as one scalar string (works for categorical; for non-categorical will likely become INVALID)
  const values: unknown[] = [];

  if (v === null) values.push(null);
  else if (v instanceof ListValue) {
    const arr = (v).values;
    const elems = Array.isArray(arr) ? arr : [];
    if (multiMode === "explode") values.push(...elems);
    else if (multiMode === "primary") values.push(elems[0] ?? null);
    else values.push(v);
  } else {
    values.push(v);
  }

  const keys: string[] = [];
  for (const sv of values) {
    const res = bucketScalarValue(sv, spec, now);

    // Quantile placeholder: "__QVALUE__:N"
    if (spec.type === "numberQuantiles" && res.bucketKey.startsWith("__QVALUE__:")) {
      const n = Number(res.bucketKey.split(":")[1]);
      if (Number.isFinite(n)) keys.push(quantileLabelFor(n, quantEdges));
      else keys.push(spec.invalidLabel ?? INVALID_KEY);
    } else {
      keys.push(res.bucketKey);
    }
  }

  // de-dupe + empty handling
  return Array.from(new Set(keys));
}

function compareEntriesForSorting(a: unknown, b: unknown, sortProp: BasesPropertyId, direction: "asc" | "desc"): number {
  const aVal = a.getValue(sortProp);
  const bVal = b.getValue(sortProp);

  // Handle ListValue: use first element only
  const aEffective = isMultiValue(aVal) ? (aVal).values?.[0] : aVal;
  const bEffective = isMultiValue(bVal) ? (bVal).values?.[0] : bVal;

  // Missing values sort last
  if (aEffective === null || aEffective === undefined) return 1;
  if (bEffective === null || bEffective === undefined) return -1;

  const aStr = String(aEffective);
  const bStr = String(bEffective);

  // Try numeric comparison
  const aNum = Number(aStr);
  const bNum = Number(bStr);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return direction === "desc" ? bNum - aNum : aNum - bNum;
  }

  // Try date comparison
  const aDate = new Date(aStr);
  const bDate = new Date(bStr);
  if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
    return direction === "desc" ? bDate.getTime() - aDate.getTime() : aDate.getTime() - bDate.getTime();
  }

  // Fallback to text comparison (case-insensitive)
  const result = aStr.toLowerCase().localeCompare(bStr.toLowerCase());
  return direction === "desc" ? -result : result;
}

function computeCellSummary(entries: unknown[], summaryMode: string, summaryField: BasesPropertyId | ""): { count: number; sum?: number; avg?: number; min?: number; max?: number; numericCount: number } {
  const count = entries.length;
  if (summaryMode === "count" || summaryMode === "off") {
    return { count, numericCount: 0 };
  }

  if (!summaryField) {
    return { count, numericCount: 0 };
  }

  let sum = 0;
  let countValid = 0;
  let min: number | undefined;
  let max: number | undefined;

  for (const entry of entries) {
    const val = entry.getValue(summaryField);
    // Handle ListValue: use first element only
    const effective = isMultiValue(val) ? (val).values?.[0] : val;
    if (effective !== null && effective !== undefined) {
      const num = Number(String(effective));
      if (!isNaN(num)) {
        sum += num;
        countValid++;
        if (min === undefined || num < min) min = num;
        if (max === undefined || num > max) max = num;
      }
    }
  }

  if (countValid === 0) {
    return { count, numericCount: 0 };
  }

  return {
    count,
    sum: Math.round(sum * 100) / 100, // Round to 2 decimals
    avg: Math.round((sum / countValid) * 100) / 100,
    min: min !== undefined ? Math.round(min * 100) / 100 : undefined,
    max: max !== undefined ? Math.round(max * 100) / 100 : undefined,
    numericCount: countValid,
  };
}

export class MatrixBasesView extends BasesView {
  readonly type = VIEW_TYPE_MATRIX;

  private rootEl: HTMLElement;
  private headerEl: HTMLElement;
  private gridEl: HTMLElement;
  private previewEntry: unknown | null = null;

  constructor(controller: QueryController, parentEl: HTMLElement) {
    super(controller);

    this.rootEl = parentEl.createDiv({ cls: "bases-matrix-root" });
    this.headerEl = this.rootEl.createDiv({ cls: "bases-matrix-header" });
    this.gridEl = this.rootEl.createDiv({ cls: "bases-matrix-grid" });

    // If your old code built selectors/topbar, build them here and persist to this.config.set(...)
  }

  private computeWritebackDiagnostics(
    entries: unknown[],
    rowsProp: BasesPropertyId,
    colsProp: BasesPropertyId,
    rowsMode: MultiValueMode,
    colsMode: MultiValueMode
  ): { allowed: boolean; rowMulti: number; colMulti: number; reasons: string[] } {
    let rowMulti = 0;
    let colMulti = 0;

    for (const entry of entries) {
      if (isMultiValue(entry.getValue(rowsProp))) rowMulti++;
      if (isMultiValue(entry.getValue(colsProp))) colMulti++;
    }

    const reasons: string[] = [];
    if (rowMulti > 0 && rowsMode === "disallow") reasons.push(`Rows has multi-values in ${rowMulti} note(s) (set Rows multi-value to Explode/Primary).`);
    if (colMulti > 0 && colsMode === "disallow") reasons.push(`Columns has multi-values in ${colMulti} note(s) (set Columns multi-value to Explode/Primary).`);

    const allowed = reasons.length === 0;
    return { allowed, rowMulti, colMulti, reasons };
  }

  private collectFrontmatterPropertyNames(entries: unknown[]): string[] {
    const counts = new Map<string, number>();

    for (const entry of entries) {
      const file = entry.file;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;

      for (const k of Object.keys(fm)) {
        if (!k) continue;
        if (k === "position") continue; // common internal-ish key
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }

    const arr = Array.from(counts.entries());
    arr.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
    return arr.map(([k]) => k);
  }

  private ensureViewDefaults(): void {
    const defaults: Record<string, unknown> = {
      cardFields: "",
      cellSortBy: "",
      cellSortDir: "asc",
      cellSummaryMode: "count",
      cellSummaryField: "",
      compactFields: "",
      compactMaxFields: 2,
      heatmapMode: "off",
      heatmapStrength: 35,
      heatmapScale: "linear",
      showCountChip: true,
    };

    for (const [k, def] of Object.entries(defaults)) {
      const v = this.config.get(k);
      if (v === undefined || v === null) {
        this.config.set(k, def);
      }
    }
  }

  private getSampleEntry(): unknown | null {
    // Prefer contextual preview entry (from clicked cell), otherwise use global first entry
    if (this.previewEntry) {
      return this.previewEntry;
    }
    // Get the first entry from current data for preview
    // This is called during onDataUpdated, so we have access to this.data
    return this.data && this.data.data && this.data.data.length > 0 ? this.data.data[0] : null;
  }

  onDataUpdated(): void {
    // Ensure all new view options have defaults for existing views
    this.ensureViewDefaults();

    // ✅ Bases gives you the latest query output here:
    // this.data is BasesQueryResult
    // this.config is BasesViewConfig
    // this.app is App
    const rowsProp = this.config.getAsPropertyId("rowsProp");
    const colsProp = this.config.getAsPropertyId("colsProp");
    const rowsMultiMode = (this.config.get("rowsMultiMode") as MultiValueMode) ?? "disallow";
    const colsMultiMode = (this.config.get("colsMultiMode") as MultiValueMode) ?? "disallow";

    // Render a friendly empty state until configured
    if (!rowsProp || !colsProp) {
      this.gridEl.empty();
      this.gridEl.createDiv({
        cls: "bases-matrix-empty",
        text: "Pick row + column properties to render the matrix.",
      });
      return;
    }

    // Ungrouped entries (already filtered/sorted/limited by Base)
    const entries = this.data.data;

    const rowsState = getAxisState(this.config, "rows");
    const colsState = getAxisState(this.config, "cols");

    const rowSpec: AxisBucketSpec = rowsState.bucketSpec ?? { type: "categorical" };
    const colSpec: AxisBucketSpec = colsState.bucketSpec ?? { type: "categorical" };
    const now = new Date();

    // Compute quantile edges for each axis if spec is quantiles
    let rowQuantEdges: number[] = [];
    let colQuantEdges: number[] = [];

    if (rowSpec.type === "numberQuantiles") {
      const nums: number[] = [];
      for (const entry of entries) {
        const v = entry.getValue(rowsProp);
        if (v && !(v as unknown).values) { // crude skip ListValue; we'll handle elements below
          const n = Number(v.toString());
          if (Number.isFinite(n)) nums.push(n);
        }
      }
      rowQuantEdges = computeQuantileBuckets(nums, rowSpec.k).edges;
    }

    if (colSpec.type === "numberQuantiles") {
      const nums: number[] = [];
      for (const entry of entries) {
        const v = entry.getValue(colsProp);
        if (v && !(v as unknown).values) {
          const n = Number(v.toString());
          if (Number.isFinite(n)) nums.push(n);
        }
      }
      colQuantEdges = computeQuantileBuckets(nums, colSpec.k).edges;
    }

    const diag = this.computeWritebackDiagnostics(this.data.data, rowsProp, colsProp, rowsMultiMode, colsMultiMode);
    const rowReversible = isReversibleSpec(rowSpec);
    const colReversible = isReversibleSpec(colSpec);
    const writebackAllowed = diag.allowed && rowReversible && colReversible;

    // Debug logging
    console.debug("🔍 DRAG/DROP DEBUG:");
    console.debug(`  Properties: ${rowsProp} (row), ${colsProp} (col)`);
    console.debug(`  Bucket types: ${rowSpec.type} (row), ${colSpec.type} (col)`);
    console.debug(`  Checks: rowReversible=${rowReversible}, colReversible=${colReversible}, diag.allowed=${diag.allowed}`);
    console.debug(`  Result: writebackAllowed=${writebackAllowed}`);
    console.debug(`  Full specs:`, { rowSpec, colSpec });

    // Now call your existing matrix builder/render path:
    // - bucket rows/cols
    // - build cells
    // - render headers + stacks
    // - wire click -> drilldown modal
    // - wire drag (only if writebackAllowed AND bucket reversible)
    this.renderMatrix(entries, rowsProp, colsProp, writebackAllowed, rowSpec, colSpec, now, rowsState, colsState, rowsMultiMode, colsMultiMode, diag, rowQuantEdges, colQuantEdges, rowReversible, colReversible);
  }

  private renderMatrix(
    entries: unknown[],
    rowsProp: BasesPropertyId,
    colsProp: BasesPropertyId,
    writebackAllowed: boolean,
    rowSpec: AxisBucketSpec,
    colSpec: AxisBucketSpec,
    now: Date,
    rowsState: unknown,
    colsState: unknown,
    rowsMultiMode: MultiValueMode,
    colsMultiMode: MultiValueMode,
    diag: unknown,
    rowQuantEdges: number[],
    colQuantEdges: number[],
    rowReversible: boolean,
    colReversible: boolean
  ) {
    // ✅ Move your existing DOM renderer here.
    // Use this.gridEl as the container.
    // Use this.config.get()/set() for persisted state (order, aliases, etc).
    // Use this.app.fileManager.processFrontMatter(...) for writeback.

    const includeEmpty = this.config.get("includeEmpty") ?? true;
    const cellMode = (this.config.get("cellMode") as CellMode) ?? "cards";
    const maxCardsPerCell = clamp(Number(this.config.get("maxCardsPerCell")) || 6, 0, 50);

    // New cell rendering options
    const cardFieldsRaw = (this.config.get("cardFields") as string) ?? "";
    const cardFields = parseCommaList(cardFieldsRaw);
    const cellSortByRaw = ((this.config.get("cellSortBy") as string) ?? "").trim();
    const cellSortBy = cellSortByRaw ? asNoteProp(cellSortByRaw) : "";
    const cellSortDir = ((this.config.get("cellSortDir") as string) ?? "asc") as "asc" | "desc";
    const cellSummaryMode = (this.config.get("cellSummaryMode") as string) ?? "count";
    const cellSummaryFieldRaw = ((this.config.get("cellSummaryField") as string) ?? "").trim();
    const cellSummaryField = cellSummaryFieldRaw ? asNoteProp(cellSummaryFieldRaw) : "";
    const showCountChip = this.config.get("showCountChip") !== false;
    const compactFieldsRaw = (this.config.get("compactFields") as string) ?? "";
    const compactFields = parseCommaList(compactFieldsRaw);
    const compactMaxFields = Number(this.config.get("compactMaxFields")) || 2;

    // Heatmap options
    const heatmapMode = (this.config.get("heatmapMode") as string) ?? "off";
    const heatmapStrength = Number(this.config.get("heatmapStrength")) || 35;
    const heatmapScale = (this.config.get("heatmapScale") as string) ?? "linear";

    const enableDragSetting = this.config.get("enableDrag") ?? true;
    const rowsIsNote = isNoteProperty(rowsProp);
    const colsIsNote = isNoteProperty(colsProp);
    const writebackAllowedFinal = writebackAllowed && enableDragSetting && rowsIsNote && colsIsNote;

    // Debug logging
    console.debug("🎯 FINAL DRAG/DROP CHECK:");
    console.debug(`  writebackAllowed: ${writebackAllowed}`);
    console.debug(`  enableDragSetting: ${String(enableDragSetting)}`);
    console.debug(`  rowsIsNote: ${rowsIsNote} (${rowsProp})`);
    console.debug(`  colsIsNote: ${colsIsNote} (${colsProp})`);
    console.debug(`  FINAL RESULT: writebackAllowedFinal=${writebackAllowedFinal}`);
    if (diag.reasons.length > 0) {
      console.debug(`  diag reasons:`, diag.reasons);
    }

    // Add status banner
    const status = this.rootEl.createDiv({ cls: "bmv-status" });

    if (!enableDragSetting) {
      status.setText("Drag & drop is off (enable it in configure view).");
    } else if (!rowsIsNote || !colsIsNote) {
      status.setText("Drag disabled: only note.* properties are writable.");
    } else if (!writebackAllowed) {
      const reasons = diag.reasons.slice();
      if (!rowReversible || !colReversible) {
        reasons.push("bucketing is non-reversible (Date/Number).");
      }
      status.setText(`Drag disabled: ${reasons.join(" ")}`);
    } else {
      status.setText("Drag enabled.");
    }

    // Build buckets
    const rowKeys = new Set<string>();
    const colKeys = new Set<string>();

    // Cell -> entries
    const cells = new Map<CellKey, unknown[]>();

    // Track uniques so explode doesn't duplicate the same file in same cell
    const seen = new Map<string, Set<string>>(); // cellKey -> set(filePath)

    for (const entry of entries) {
      const rv = entry.getValue(rowsProp);
      const cv = entry.getValue(colsProp);

      const rKeys = bucketKeysFor(rv, rowsMultiMode, rowSpec, now, rowQuantEdges);
      const cKeys = bucketKeysFor(cv, colsMultiMode, colSpec, now, colQuantEdges);

      for (const rKey of rKeys) {
        for (const cKey of cKeys) {
          if (!includeEmpty && (rKey === EMPTY_KEY || cKey === EMPTY_KEY)) continue;

          if (includeEmpty || rKey !== EMPTY_KEY) rowKeys.add(rKey);
          if (includeEmpty || cKey !== EMPTY_KEY) colKeys.add(cKey);

          const ck = cellKey(rKey, cKey);
          const fp = entry.file.path;

          const s = seen.get(ck) ?? new Set<string>();
          if (s.has(fp)) continue;
          s.add(fp);
          seen.set(ck, s);

          const arr = cells.get(ck) ?? [];
          arr.push(entry);
          cells.set(ck, arr);
        }
      }
    }

    const rowDefaultOrder = defaultOrderForSpec(rowSpec);
    const colDefaultOrder = defaultOrderForSpec(colSpec);

    const sortedRowKeys = applyManualOrder(Array.from(rowKeys), rowDefaultOrder ?? rowsState.order);
    const sortedColKeys = applyManualOrder(Array.from(colKeys), colDefaultOrder ?? colsState.order);

    const rowLabel = (k: string) => displayForBucketKey(k, rowsState.aliases);
    const colLabel = (k: string) => displayForBucketKey(k, colsState.aliases);

    // Compute heatmap values
    let maxCellCount = 0;
    if (heatmapMode !== "off") {
      for (const rKey of sortedRowKeys) {
        for (const cKey of sortedColKeys) {
          const ck = cellKey(rKey, cKey);
          const cellEntries = cells.get(ck) ?? [];
          maxCellCount = Math.max(maxCellCount, cellEntries.length);
        }
      }
    }

    // Render axis bar
    if (!this.headerEl) {
      this.headerEl = this.rootEl.createDiv({ cls: "bmv-header" });
    }

    const dragStatusText = writebackAllowedFinal ? "Drag: Enabled" : `Drag: Disabled — ${diag.reasons.join(" ")}`;

    const available = this.collectFrontmatterPropertyNames(entries);

    renderAxisBar({
      app: this.app,
      containerEl: this.headerEl,
      config: this.config,
      rowsProp,
      colsProp,
      rowSpec,
      colSpec,
      rowsMultiMode,
      colsMultiMode,
      availableNoteProps: available,
      cardFields,
      sampleEntry: this.getSampleEntry(),
      heatmapMode,
      maxCellCount,
      onPickRowsProp: (propName) => {
        this.config.set("rowsProp", `note.${propName}`);
        this.onDataUpdated();
      },
      onPickColsProp: (propName) => {
        this.config.set("colsProp", `note.${propName}`);
        this.onDataUpdated();
      },
      onPickRowsMultiMode: (mode) => {
        this.config.set("rowsMultiMode", mode);
        this.onDataUpdated();
      },
      onPickColsMultiMode: (mode) => {
        this.config.set("colsMultiMode", mode);
        this.onDataUpdated();
      },
      onPickCardFields: (fields: string[]) => {
        this.config.set("cardFields", fields.join(","));
        this.onDataUpdated();
      },
      dragStatusText,
      onRerender: () => this.onDataUpdated(),
    });

    // Render grid
    this.gridEl.empty();
    const grid = this.gridEl.createDiv({ cls: "bmv-grid" });
    grid.style.gridTemplateColumns = `180px repeat(${sortedColKeys.length}, 220px)`;

    // Top-left corner
    grid.createDiv({ cls: "bmv-corner" });

    // Column headers
    for (const cKey of sortedColKeys) {
      const colHeaderEl = grid.createDiv({ cls: "bmv-col-h", text: colLabel(cKey) });

      colHeaderEl.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        const menu = new Menu();

        menu.addItem((i) => {
          i.setTitle("Rename label…");
          i.onClick(() => {
            new TextPromptModal(this.app, {
              title: `Rename column "${colLabel(cKey)}"`,
              initialValue: colsState.aliases?.[cKey] ?? "",
              placeholder: "Display label (does not change data)",
              onSubmit: (v) => setAlias(this.config, "cols", cKey, v),
            }).open();
          });
        });

        menu.addItem((i) => {
          i.setTitle("Clear label");
          i.onClick(() => setAlias(this.config, "cols", cKey, null));
        });

        menu.addSeparator();
        menu.addItem((i) => {
          i.setTitle("Bucketing…");
          i.onClick(() => {
            new BucketConfigModal(this.app, {
              axisLabel: "Columns",
              initial: colSpec,
              onSave: (spec) => setBucketSpec(this.config, "cols", spec),
            }).open();
          });
        });

        menu.showAtPosition({ x: evt.pageX, y: evt.pageY });
      });

      colHeaderEl.draggable = true;
      colHeaderEl.addEventListener("dragstart", (ev) => {
        ev.dataTransfer?.setData("application/x-bmv-header", JSON.stringify({ axis: "cols", key: cKey }));
      });
      colHeaderEl.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        colHeaderEl.addClass("bmv-h-drop");
      });
      colHeaderEl.addEventListener("dragleave", () => colHeaderEl.removeClass("bmv-h-drop"));
      colHeaderEl.addEventListener("drop", (ev) => {
        ev.preventDefault();
        colHeaderEl.removeClass("bmv-h-drop");

        const raw = ev.dataTransfer?.getData("application/x-bmv-header");
        if (!raw) return;

        let payload: { axis: "cols" | "rows"; key: string };
        try { payload = JSON.parse(raw); } catch { return; }
        if (payload.axis !== "cols") return;

        const from = payload.key;
        const to = cKey;
        if (from === to) return;

        const current = sortedColKeys.slice(); // current displayed order
        const fromIdx = current.indexOf(from);
        const toIdx = current.indexOf(to);
        if (fromIdx < 0 || toIdx < 0) return;

        current.splice(fromIdx, 1);
        current.splice(toIdx, 0, from);

        setOrder(this.config, "cols", current);
      });
    }

    // Rows
    for (const rKey of sortedRowKeys) {
      const rowHeaderEl = grid.createDiv({ cls: "bmv-row-h", text: rowLabel(rKey) });

      rowHeaderEl.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        const menu = new Menu();

        menu.addItem((i) => {
          i.setTitle("Rename label…");
          i.onClick(() => {
            new TextPromptModal(this.app, {
              title: `Rename row "${rowLabel(rKey)}"`,
              initialValue: rowsState.aliases?.[rKey] ?? "",
              placeholder: "Display label (does not change data)",
              onSubmit: (v) => setAlias(this.config, "rows", rKey, v),
            }).open();
          });
        });

        menu.addItem((i) => {
          i.setTitle("Clear label");
          i.onClick(() => setAlias(this.config, "rows", rKey, null));
        });

        menu.addSeparator();
        menu.addItem((i) => {
          i.setTitle("Bucketing…");
          i.onClick(() => {
            new BucketConfigModal(this.app, {
              axisLabel: "Rows",
              initial: rowSpec,
              onSave: (spec) => setBucketSpec(this.config, "rows", spec),
            }).open();
          });
        });

        menu.showAtPosition({ x: evt.pageX, y: evt.pageY });
      });

      rowHeaderEl.draggable = true;
      rowHeaderEl.addEventListener("dragstart", (ev) => {
        ev.dataTransfer?.setData("application/x-bmv-header", JSON.stringify({ axis: "rows", key: rKey }));
      });
      rowHeaderEl.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        rowHeaderEl.addClass("bmv-h-drop");
      });
      rowHeaderEl.addEventListener("dragleave", () => rowHeaderEl.removeClass("bmv-h-drop"));
      rowHeaderEl.addEventListener("drop", (ev) => {
        ev.preventDefault();
        rowHeaderEl.removeClass("bmv-h-drop");

        const raw = ev.dataTransfer?.getData("application/x-bmv-header");
        if (!raw) return;

        let payload: { axis: "cols" | "rows"; key: string };
        try { payload = JSON.parse(raw); } catch { return; }
        if (payload.axis !== "rows") return;

        const from = payload.key;
        const to = rKey;
        if (from === to) return;

        const current = sortedRowKeys.slice(); // current displayed order
        const fromIdx = current.indexOf(from);
        const toIdx = current.indexOf(to);
        if (fromIdx < 0 || toIdx < 0) return;

        current.splice(fromIdx, 1);
        current.splice(toIdx, 0, from);

        setOrder(this.config, "rows", current);
      });

      for (const cKey of sortedColKeys) {
        const ck = cellKey(rKey, cKey);
        const cellEntries = cells.get(ck) ?? [];

        // Apply cell sorting if configured
        if (cellSortBy) {
          cellEntries.sort((a, b) => compareEntriesForSorting(a, b, cellSortBy, cellSortDir));
        }

        const cellEl = grid.createDiv({ cls: "bmv-cell" });
        cellEl.dataset.rowKey = rKey;
        cellEl.dataset.colKey = cKey;

        // Set heatmap CSS variables
        if (heatmapMode !== "off") {
          const count = cellEntries.length;
          let t = 0;
          if (maxCellCount > 0) {
            if (heatmapScale === "log") {
              t = Math.log(1 + count) / Math.log(1 + maxCellCount);
            } else {
              t = count / maxCellCount;
            }
          }
          cellEl.style.setProperty("--bmv-hm", t.toString());
          cellEl.style.setProperty("--bmv-hm-strength", (heatmapStrength / 100).toString());
        }

        // Click cell -> drilldown
        cellEl.onClickEvent(() => {
          // Set contextual preview entry for template editors
          this.previewEntry = cellEntries.length > 0 ? cellEntries[0] : null;

          new MatrixDrilldownModal(this.app, {
            rowLabel: rowLabel(rKey),
            colLabel: colLabel(cKey),
            entries: cellEntries,
            rowsProp,
            colsProp,
            targetRowKey: rKey,
            targetColKey: cKey,
            reversible: writebackAllowedFinal,
            rowsMultiMode,
            colsMultiMode,
            rowSpec,
            colSpec,
            onCreateNote: (rowKey, colKey) => this.createNoteForCell(rowKey, colKey, rowSpec, colSpec, rowsProp, colsProp),
          }).open();
        });

        // Cell summary chips
        const summary = computeCellSummary(cellEntries, cellSummaryMode, cellSummaryField);
        if (cellSummaryMode !== "off") {
          const cellTop = cellEl.createDiv({ cls: "bmv-cell-top" });
          const chips = cellTop.createDiv({ cls: "bmv-cell-chips" });

          // Show count chip if enabled, or if in count-only mode
          if (showCountChip || cellMode === "count") {
            chips.createDiv({ cls: "bmv-chip-mini bmv-chip-count", text: `${summary.count}` });
          }

          // Show sum/avg/min/max if applicable
          if ((summary.sum !== undefined && (cellSummaryMode === "sum" || cellSummaryMode === "avg")) ||
              (summary.min !== undefined && cellSummaryMode === "min") ||
              (summary.max !== undefined && cellSummaryMode === "max")) {
            let label: string;
            let value: number | undefined;

            if (cellSummaryMode === "sum") {
              label = "SUM";
              value = summary.sum;
            } else if (cellSummaryMode === "avg") {
              label = "AVG";
              value = summary.avg;
            } else if (cellSummaryMode === "min") {
              label = "MIN";
              value = summary.min;
            } else { // max
              label = "MAX";
              value = summary.max;
            }

            const valueStr = value !== undefined ? value?.toFixed(2) : "—";
            const countStr = summary.numericCount !== undefined ? `(${summary.numericCount})` : "(0)";
            chips.createDiv({ cls: "bmv-chip-mini bmv-chip-summary", text: `${label}${countStr}: ${valueStr}` });
          }
        }

        // Cards / compact / count-only
        if (cellMode !== "count" && cellEntries.length > 0) {
          const cellBody = cellEl.createDiv({ cls: "bmv-cell-body" });
          const listEl = cellBody.createDiv({ cls: cellMode === "compact" ? "bmv-list-compact" : "bmv-list" });

          const shown = cellEntries.slice(0, maxCardsPerCell);
          for (const e of shown) {
            const card = listEl.createDiv({ cls: "bmv-card" });

            // Card title
            card.createDiv({ cls: "bmv-card-title", text: e.file.basename });

            // Compact subtitle (only in compact mode)
            if (cellMode === "compact" && compactFields.length > 0 && compactMaxFields > 0) {
              const subtitleValues: string[] = [];
              for (const field of compactFields) {
                if (subtitleValues.length >= compactMaxFields) break;
                const propId = asNoteProp(field);
                const val = e.getValue(propId);
                if (val === null || val === undefined) continue;

                let valueText: string;
                if (isMultiValue(val)) {
                  const values = (val).values?.map(String) || [];
                  valueText = values.length > 0 ? values[0] : "";
                } else {
                  valueText = String(val).trim();
                }

                if (valueText) {
                  subtitleValues.push(valueText);
                }
              }

              if (subtitleValues.length > 0) {
                card.createDiv({ cls: "bmv-card-subtitle", text: subtitleValues.join(" • ") });
              }
            }

            // Card fields as pills (only in cards mode)
            if (cellMode === "cards") {
              const metaEl = card.createDiv({ cls: "bmv-card-meta" });
              for (const field of cardFields) {
                const propId = asNoteProp(field);
                const val = e.getValue(propId);
                if (val === null || val === undefined) continue;

                let displayText: string;
                let tooltipText: string;
                if (isMultiValue(val)) {
                  const values = (val).values?.map(String) || [];
                  if (values.length === 0) continue;
                  const capped = values.slice(0, 3);
                  displayText = `${capped.join(", ")}${values.length > 3 ? ` +${values.length - 3}` : ""}`;
                  tooltipText = `${field}: ${values.join(", ")}`;
                } else {
                  const strVal = String(val).trim();
                  if (!strVal) continue;
                  displayText = strVal;
                  tooltipText = `${field}: ${strVal}`;
                }

                const pillEl = metaEl.createSpan({ cls: "bmv-pill", text: displayText });
                pillEl.setAttr("title", tooltipText);
              }
            }

            card.onClickEvent((evt) => {
              evt.stopPropagation();
              void this.app.workspace.getLeaf(false).openFile(e.file);
            });

            if (writebackAllowedFinal) {
              card.draggable = true;
              card.addEventListener("dragstart", (ev) => {
                const payload: DragPayload = { filePath: e.file.path, fromRowKey: rKey, fromColKey: cKey };
                ev.dataTransfer?.setData("application/json", JSON.stringify(payload));
                ev.dataTransfer?.setData("text/plain", e.file.path);
              });
            }
          }

          if (cellEntries.length > shown.length) {
            listEl.createDiv({ cls: "bmv-more", text: `+${cellEntries.length - shown.length} more` });
          }
        }

        // Drop handling
        if (writebackAllowedFinal) {
          cellEl.addEventListener("dragover", (ev) => {
            ev.preventDefault();
            cellEl.addClass("bmv-drop-target");
          });
          cellEl.addEventListener("dragleave", () => cellEl.removeClass("bmv-drop-target"));
          cellEl.addEventListener("drop", async (ev) => {
            ev.preventDefault();
            cellEl.removeClass("bmv-drop-target");

            const raw = ev.dataTransfer?.getData("application/json");
            if (!raw) return;

            let payload: DragPayload;
            try {
              payload = JSON.parse(raw) as DragPayload;
            } catch {
              return;
            }

            const file = this.app.vault.getAbstractFileByPath(payload.filePath);
            if (!(file instanceof TFile)) return;

            // MVP safety rules:
            // - Only allow dropping into "real" buckets (string keys), including empty = clear
            // - We do NOT support derived buckets yet (dates/quantiles), so this is purely exact string assignment.
            await this.applyMove(file, rowsProp, colsProp, payload.fromRowKey, payload.fromColKey, rKey, cKey, rowsMultiMode, colsMultiMode);
          });
        }
      }
    }
  }

  private async applyMove(
    file: TFile,
    rowsProp: BasesPropertyId,
    colsProp: BasesPropertyId,
    fromRowKey: string,
    fromColKey: string,
    targetRowKey: string,
    targetColKey: string,
    rowsMode: MultiValueMode,
    colsMode: MultiValueMode
  ): Promise<void> {
    const rowName = notePropName(rowsProp);
    const colName = notePropName(colsProp);

    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        writeAxisMove(fm, rowName, fromRowKey, targetRowKey, rowsMode);
        writeAxisMove(fm, colName, fromColKey, targetColKey, colsMode);
      });

      new Notice("Updated properties");
    } catch (err) {
      console.error(err);
      new Notice("Failed to update properties (see console)");
    }
  }

  private async createNoteForCell(
    rowKey: string,
    colKey: string,
    rowSpec: AxisBucketSpec,
    colSpec: AxisBucketSpec,
    rowsProp: BasesPropertyId,
    colsProp: BasesPropertyId
  ): Promise<void> {
    // Determine writable values for each axis
    const rowMapping = bucketKeyToWritableValue(rowSpec, rowKey);
    const colMapping = bucketKeyToWritableValue(colSpec, colKey);

    // Check if either axis is unset
    const hasRowsProp = rowsProp && rowsProp !== "";
    const hasColsProp = colsProp && colsProp !== "";

    if (!hasRowsProp || !hasColsProp) {
      new Notice("Cannot create note: row and column properties must be configured");
      return;
    }

    // Show modal to get note title and folder
    const result = await new Promise<{ title: string; folder: string } | null>((resolve) => {
      new CreateNoteModal(this.app, {
        rowKey,
        colKey,
        rowMapping,
        colMapping,
        onSubmit: (title, folder) => resolve({ title, folder }),
        onCancel: () => resolve(null),
      }).open();
    });

    if (!result) return;

    const { title, folder } = result;

    try {
      // Create safe filename
      const safeTitle = title.replace(/[<>:"/\\|?*]/g, "").trim() || "Untitled";
      const filename = `${safeTitle}.md`;
      const fullPath = folder ? `${folder}/${filename}` : filename;

      // Build frontmatter
      const frontmatter: Record<string, any> = {};

      // Set row property if mapping is valid
      if (rowMapping.ok) {
        const propName = notePropName(rowsProp);
        frontmatter[propName] = rowMapping.value;
      }

      // Set column property if mapping is valid
      if (colMapping.ok) {
        const propName = notePropName(colsProp);
        frontmatter[propName] = colMapping.value;
      }

      // Convert to YAML string
      const yamlLines = ["---"];
      for (const [key, value] of Object.entries(frontmatter)) {
        yamlLines.push(`${key}: ${JSON.stringify(value)}`);
      }
      yamlLines.push("---");
      const content = yamlLines.join("\n") + "\n";

      // Create the file
      const file = await this.app.vault.create(fullPath, content);

      // Open in new leaf/tab
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(file);

      new Notice(`Created note: ${file.basename}`);
    } catch (err) {
      console.error("Failed to create note:", err);
      new Notice("Failed to create note (see console)");
    }
  }
}
