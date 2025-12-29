import { App, Menu } from "obsidian";
import type { BasesPropertyId, BasesViewConfig } from "obsidian";
import type { AxisBucketSpec } from "../bases/bucketSpec";
import type { MultiValueMode } from "../bases/multiValue";
import { BucketConfigModal } from "./bucketConfigModal";
import { PropertyPickerModal } from "./propertyPickerModal";
import { CardFieldsTemplateEditor } from "./cardFieldsTemplateEditor";
import { TextPromptModal } from "./textPromptModal";
import { parseCommaList } from "../bases/cardConfig";
import { setAlias, setBucketSpec } from "../bases/axisState";

function propLabel(propId: BasesPropertyId | null): string {
  if (!propId) return "(none)";
  return propId.startsWith("note.") ? propId.slice("note.".length) : propId;
}

function bucketLabel(spec: AxisBucketSpec): string {
  if (spec.type === "categorical") return "Categorical";
  if (spec.type === "dateRelative") return "Date: Relative";
  if (spec.type === "numberRanges") return "Number: Ranges";
  if (spec.type === "numberQuantiles") return `Number: Quantiles`;
  return "Bucketing";
}

function multiLabel(mode: MultiValueMode): string {
  if (mode === "disallow") return "Single only";
  if (mode === "explode") return "Explode";
  return "Primary";
}

export function renderAxisBar(args: {
  app: App;
  containerEl: HTMLElement;
  config: BasesViewConfig;

  rowsProp: BasesPropertyId | null;
  colsProp: BasesPropertyId | null;

  rowSpec: AxisBucketSpec;
  colSpec: AxisBucketSpec;

  rowsMultiMode: MultiValueMode;
  colsMultiMode: MultiValueMode;

  availableNoteProps: string[];
  cardFields: string[];
  sampleEntry: unknown;

  heatmapMode: string;
  maxCellCount: number;

  onPickRowsProp: (propName: string) => void;
  onPickColsProp: (propName: string) => void;

  onPickRowsMultiMode: (mode: MultiValueMode) => void;
  onPickColsMultiMode: (mode: MultiValueMode) => void;

  onPickCardFields: (fields: string[]) => void;

  dragStatusText: string;

  onRerender: () => void;
}): void {
  const {
    app, containerEl, config,
    rowsProp, colsProp,
    rowSpec, colSpec,
    rowsMultiMode, colsMultiMode,
    availableNoteProps, cardFields, sampleEntry,
    heatmapMode, maxCellCount,
    dragStatusText,
    onRerender, onPickCardFields,
  } = args;

  containerEl.empty();

  const bar = containerEl.createDiv({ cls: "bmv-axisbar" });

  const left = bar.createDiv({ cls: "bmv-axisbar-left" });

  // Rows group
  const rowsGroup = left.createDiv({ cls: "bmv-axisgroup" });
  rowsGroup.createDiv({ cls: "bmv-axislabel", text: "Rows" });

  const rowsPropChip = rowsGroup.createEl("button", { cls: "bmv-chip", text: propLabel(rowsProp) });
  rowsPropChip.onclick = () => {
    new PropertyPickerModal(app, {
      title: "Rows property",
      items: args.availableNoteProps,
      current: rowsProp?.startsWith("note.") ? rowsProp.slice("note.".length) : undefined,
      onPick: (propName) => args.onPickRowsProp(propName),
    }).open();
  };

  const rowsBucketChip = rowsGroup.createEl("button", { cls: "bmv-chip", text: bucketLabel(rowSpec) });
  rowsBucketChip.onclick = () => {
    new BucketConfigModal(app, {
      axisLabel: "Rows",
      initial: rowSpec,
      onSave: (spec) => { setBucketSpec(config, "rows", spec); onRerender(); },
    }).open();
  };

  const rowsMultiChip = rowsGroup.createEl("button", { cls: "bmv-chip", text: multiLabel(rowsMultiMode) });
  rowsMultiChip.onclick = () => {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Disallow").setChecked(rowsMultiMode === "disallow").onClick(() => args.onPickRowsMultiMode("disallow")));
    menu.addItem((i) => i.setTitle("Explode").setChecked(rowsMultiMode === "explode").onClick(() => args.onPickRowsMultiMode("explode")));
    menu.addItem((i) => i.setTitle("Primary").setChecked(rowsMultiMode === "primary").onClick(() => args.onPickRowsMultiMode("primary")));
    menu.showAtMouseEvent(window.event as MouseEvent);
  };

  // Columns group
  const colsGroup = left.createDiv({ cls: "bmv-axisgroup" });
  colsGroup.createDiv({ cls: "bmv-axislabel", text: "Cols" });

  const colsPropChip = colsGroup.createEl("button", { cls: "bmv-chip", text: propLabel(colsProp) });
  colsPropChip.onclick = () => {
    new PropertyPickerModal(app, {
      title: "Columns property",
      items: args.availableNoteProps,
      current: colsProp?.startsWith("note.") ? colsProp.slice("note.".length) : undefined,
      onPick: (propName) => args.onPickColsProp(propName),
    }).open();
  };

  const colsBucketChip = colsGroup.createEl("button", { cls: "bmv-chip", text: bucketLabel(colSpec) });
  colsBucketChip.onclick = () => {
    new BucketConfigModal(app, {
      axisLabel: "Columns",
      initial: colSpec,
      onSave: (spec) => { setBucketSpec(config, "cols", spec); onRerender(); },
    }).open();
  };

  const colsMultiChip = colsGroup.createEl("button", { cls: "bmv-chip", text: multiLabel(colsMultiMode) });
  colsMultiChip.onclick = () => {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Disallow").setChecked(colsMultiMode === "disallow").onClick(() => args.onPickColsMultiMode("disallow")));
    menu.addItem((i) => i.setTitle("Explode").setChecked(colsMultiMode === "explode").onClick(() => args.onPickColsMultiMode("explode")));
    menu.addItem((i) => i.setTitle("Primary").setChecked(colsMultiMode === "primary").onClick(() => args.onPickColsMultiMode("primary")));
    menu.showAtMouseEvent(window.event as MouseEvent);
  };

  // Display options section
  const displayGroup = left.createDiv({ cls: "bmv-axisgroup" });
  displayGroup.createDiv({ cls: "bmv-axislabel", text: "Display" });

  const cardFieldsChip = displayGroup.createEl("button", {
    cls: "bmv-chip",
    text: cardFields.length > 0 ? `${cardFields.length} fields` : "Card fields"
  });
  cardFieldsChip.onclick = () => {
    new CardFieldsTemplateEditor(app, {
      mode: "cards",
      items: availableNoteProps,
      current: cardFields,
      sampleEntry: sampleEntry,
      onSave: (selectedFields) => {
        onPickCardFields(selectedFields);
        onRerender();
      },
    }).open();
  };

  const compactFieldsChip = displayGroup.createEl("button", {
    cls: "bmv-chip",
    text: "Compact..."
  });
  compactFieldsChip.onclick = () => {
    // Get current compact fields from config
    const currentCompactFields = parseCommaList((config.get("compactFields") as string) ?? "");

    new CardFieldsTemplateEditor(app, {
      mode: "compact",
      items: availableNoteProps,
      current: currentCompactFields,
      sampleEntry: sampleEntry,
      onSave: (selectedFields) => {
        config.set("compactFields", selectedFields.join(","));
        onRerender();
      },
    }).open();
  };

  // Right side drag status
  const right = bar.createDiv({ cls: "bmv-axisbar-right" });

  // Heatmap legend (only if heatmap is enabled)
  if (heatmapMode !== "off") {
    const legend = right.createDiv({ cls: "bmv-heatmap-legend" });
    legend.createSpan({ text: `Heatmap: 0 → ${maxCellCount}`, cls: "bmv-heatmap-text" });

    // Tiny gradient swatch
    legend.createDiv({ cls: "bmv-heatmap-swatch" });
  }

  right.createDiv({ cls: "bmv-dragstatus", text: dragStatusText });

  // Optional: right-click on axis labels for quick alias rename (nice)
  rowsGroup.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    const menu = new Menu();
    menu.addItem((i) => {
      i.setTitle("Rename '(empty)' label…");
      i.onClick(() => {
        new TextPromptModal(app, {
          title: "Rows: alias for (empty)",
          initialValue: "",
          placeholder: "Example: Unset",
          onSubmit: (v) => { setAlias(config, "rows", "__EMPTY__", v); onRerender(); },
        }).open();
      });
    });
    menu.showAtPosition({ x: evt.pageX, y: evt.pageY });
  });
}
