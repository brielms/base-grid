import {
  BasesView,
  type QueryController,
  type BasesPropertyId,
  ListValue,
  TFile,
  Notice,
  Menu,
} from "obsidian";

import { valueToBucketKey, bucketKeyToDisplay, EMPTY_KEY, applyManualOrder, displayForBucketKey } from "./valueCodec";
import { bucketScalarValue, computeQuantileBuckets, quantileLabelFor, defaultOrderForSpec, INVALID_KEY } from "./bucketEngine";
import { bucketKeysForValue, isMultiValue, type MultiValueMode } from "./multiValue";
import type { CellMode, DragPayload } from "./matrixTypes";
import { MatrixDrilldownModal } from "../ui/drilldownModal";
import { TextPromptModal } from "../ui/textPromptModal";
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

function toList(v: any): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim().length) return [v.trim()];
  return [];
}

function dedupe(a: string[]): string[] {
  return Array.from(new Set(a));
}

function writeAxisMove(
  fm: any,
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
  v: any,
  multiMode: MultiValueMode,
  spec: AxisBucketSpec,
  now: Date,
  quantEdges: number[]
): string[] {
  // Reuse existing multi-value extraction:
  // - explode: bucket each element
  // - primary: bucket first element
  // - disallow: bucket the whole list as one scalar string (works for categorical; for non-categorical will likely become INVALID)
  const values: any[] = [];

  if (v === null) values.push(null);
  else if (v instanceof ListValue) {
    const arr = (v as any).values;
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

export class MatrixBasesView extends BasesView {
  readonly type = VIEW_TYPE_MATRIX;

  private rootEl: HTMLElement;
  private headerEl: HTMLElement;
  private gridEl: HTMLElement;

  constructor(controller: QueryController, parentEl: HTMLElement) {
    super(controller);

    this.rootEl = parentEl.createDiv({ cls: "bases-matrix-root" });
    this.headerEl = this.rootEl.createDiv({ cls: "bases-matrix-header" });
    this.gridEl = this.rootEl.createDiv({ cls: "bases-matrix-grid" });

    // If your old code built selectors/topbar, build them here and persist to this.config.set(...)
  }

  private computeWritebackDiagnostics(
    entries: any[],
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

  private collectFrontmatterPropertyNames(entries: any[]): string[] {
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

  onDataUpdated(): void {
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
        if (v && !(v as any).values) { // crude skip ListValue; we'll handle elements below
          const n = Number(v.toString());
          if (Number.isFinite(n)) nums.push(n);
        }
      }
      rowQuantEdges = computeQuantileBuckets(nums, rowSpec.k!).edges;
    }

    if (colSpec.type === "numberQuantiles") {
      const nums: number[] = [];
      for (const entry of entries) {
        const v = entry.getValue(colsProp);
        if (v && !(v as any).values) {
          const n = Number(v.toString());
          if (Number.isFinite(n)) nums.push(n);
        }
      }
      colQuantEdges = computeQuantileBuckets(nums, colSpec.k!).edges;
    }

    const diag = this.computeWritebackDiagnostics(this.data.data, rowsProp, colsProp, rowsMultiMode, colsMultiMode);
    const rowReversible = isReversibleSpec(rowSpec);
    const colReversible = isReversibleSpec(colSpec);
    const writebackAllowed = diag.allowed && rowReversible && colReversible;

    // Debug logging
    console.log("🔍 DRAG/DROP DEBUG:");
    console.log(`  Properties: ${rowsProp} (row), ${colsProp} (col)`);
    console.log(`  Bucket types: ${rowSpec.type} (row), ${colSpec.type} (col)`);
    console.log(`  Checks: rowReversible=${rowReversible}, colReversible=${colReversible}, diag.allowed=${diag.allowed}`);
    console.log(`  Result: writebackAllowed=${writebackAllowed}`);
    console.log(`  Full specs:`, { rowSpec, colSpec });

    // Now call your existing matrix builder/render path:
    // - bucket rows/cols
    // - build cells
    // - render headers + stacks
    // - wire click -> drilldown modal
    // - wire drag (only if writebackAllowed AND bucket reversible)
    this.renderMatrix(entries, rowsProp, colsProp, writebackAllowed, rowSpec, colSpec, now, rowsState, colsState, rowsMultiMode, colsMultiMode, diag, rowQuantEdges, colQuantEdges, rowReversible, colReversible);
  }

  private renderMatrix(
    entries: any[],
    rowsProp: BasesPropertyId,
    colsProp: BasesPropertyId,
    writebackAllowed: boolean,
    rowSpec: AxisBucketSpec,
    colSpec: AxisBucketSpec,
    now: Date,
    rowsState: any,
    colsState: any,
    rowsMultiMode: MultiValueMode,
    colsMultiMode: MultiValueMode,
    diag: any,
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
    const enableDrag = this.config.get("enableDrag") ?? true;

    const enableDragSetting = this.config.get("enableDrag") ?? true;
    const rowsIsNote = isNoteProperty(rowsProp);
    const colsIsNote = isNoteProperty(colsProp);
    const writebackAllowedFinal = writebackAllowed && enableDragSetting && rowsIsNote && colsIsNote;

    // Debug logging
    console.log("🎯 FINAL DRAG/DROP CHECK:");
    console.log(`  writebackAllowed: ${writebackAllowed}`);
    console.log(`  enableDragSetting: ${enableDragSetting}`);
    console.log(`  rowsIsNote: ${rowsIsNote} (${rowsProp})`);
    console.log(`  colsIsNote: ${colsIsNote} (${colsProp})`);
    console.log(`  FINAL RESULT: writebackAllowedFinal=${writebackAllowedFinal}`);
    if (diag.reasons.length > 0) {
      console.log(`  diag reasons:`, diag.reasons);
    }

    // Add status banner
    const status = this.rootEl.createDiv({ cls: "bmv-status" });

    if (!enableDragSetting) {
      status.setText("Drag & drop is OFF (enable it in Configure view).");
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
    const cells = new Map<CellKey, any[]>();

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

        const cellEl = grid.createDiv({ cls: "bmv-cell" });
        cellEl.dataset.rowKey = rKey;
        cellEl.dataset.colKey = cKey;

        // Click cell -> drilldown
        cellEl.onClickEvent(() => {
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
          }).open();
        });

        // Cell header (count)
        cellEl.createDiv({ cls: "bmv-cell-count", text: `${cellEntries.length}` });

        // Cards / compact / count-only
        if (cellMode !== "count" && cellEntries.length > 0) {
          const listEl = cellEl.createDiv({ cls: cellMode === "compact" ? "bmv-list-compact" : "bmv-list" });

          const shown = cellEntries.slice(0, maxCardsPerCell);
          for (const e of shown) {
            const card = listEl.createDiv({ cls: "bmv-card", text: e.file.basename });

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
}
