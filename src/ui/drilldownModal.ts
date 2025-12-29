import {
  App,
  Modal,
  BasesEntry,
  BasesPropertyId,
  TFile,
  Notice,
} from "obsidian";

import { EMPTY_KEY } from "../bases/valueCodec";
import type { MultiValueMode } from "../bases/multiValue";

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

type DrilldownArgs = {
  rowLabel: string;
  colLabel: string;
  entries: BasesEntry[];
  rowsProp: BasesPropertyId;
  colsProp: BasesPropertyId;
  targetRowKey: string;
  targetColKey: string;
  reversible: boolean;
  rowsMultiMode: MultiValueMode;
  colsMultiMode: MultiValueMode;
};

function notePropName(propId: BasesPropertyId): string {
  const idx = propId.indexOf(".");
  return idx >= 0 ? propId.slice(idx + 1) : propId;
}

export class MatrixDrilldownModal extends Modal {
  private readonly args: DrilldownArgs;

  constructor(app: App, args: DrilldownArgs) {
    super(app);
    this.args = args;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: `${this.args.rowLabel} × ${this.args.colLabel}` });
    contentEl.createDiv({ text: `${this.args.entries.length} item(s)` });

    const actions = contentEl.createDiv({ cls: "bmv-actions" });

    if (!this.args.reversible) {
      contentEl.createDiv({
        cls: "bmv-hint",
        text: "This bucketing mode is not reversible yet (drag/bulk-set disabled).",
      });
    } else {
      const btn = actions.createEl("button", { text: "Bulk set properties to this cell" });
      btn.addEventListener("click", async () => {
        await this.bulkApply();
      });
    }

    const list = contentEl.createDiv({ cls: "bmv-drill-list" });
    for (const e of this.args.entries) {
      const row = list.createDiv({ cls: "bmv-drill-row" });
      row.createSpan({ text: e.file.path });
      row.onClickEvent(() => void this.app.workspace.getLeaf(false).openFile(e.file));
    }
  }

  private async bulkApply(): Promise<void> {
    const rowName = notePropName(this.args.rowsProp);
    const colName = notePropName(this.args.colsProp);

    const files: TFile[] = this.args.entries.map((e) => e.file);

    try {
      for (const f of files) {
        await this.app.fileManager.processFrontMatter(f, (fm) => {
          writeAxisMove(fm, rowName, EMPTY_KEY, this.args.targetRowKey, this.args.rowsMultiMode);
          writeAxisMove(fm, colName, EMPTY_KEY, this.args.targetColKey, this.args.colsMultiMode);
        });
      }
      new Notice(`Updated ${files.length} file(s)`);
      this.close();
    } catch (err) {
      console.error(err);
      new Notice("Bulk update failed (see console)");
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
