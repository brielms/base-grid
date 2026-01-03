import { Plugin } from "obsidian";
import { VIEW_TYPE_MATRIX, MatrixBasesView } from "./bases/matrixView";

export default class BasesMatrixViewPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerBasesView(VIEW_TYPE_MATRIX, {
      name: "Matrix",
      icon: "lucide-layout-grid",
      factory: (controller, containerEl) => {
        return new MatrixBasesView(controller, containerEl);
      },

      options: (() => [
        {
          key: "rowsProp",
          type: "property",
          displayName: "Rows",
          placeholder: "Pick a property",
          // MVP: only allow note.* properties (frontmatter properties)
          filter: (propId: unknown) => typeof propId === "string" && propId.startsWith("note."),
        },
        {
          key: "colsProp",
          type: "property",
          displayName: "Columns",
          placeholder: "Pick a property",
          filter: (propId: unknown) => typeof propId === "string" && propId.startsWith("note."),
        },
        {
          key: "rowsMultiMode",
          type: "dropdown",
          displayName: "Rows multi-value",
          default: "disallow",
          options: {
            disallow: "Disallow (safe)",
            explode: "Explode (show in multiple)",
            primary: "Primary (use first)",
          },
        },
        {
          key: "colsMultiMode",
          type: "dropdown",
          displayName: "Columns multi-value",
          default: "disallow",
          options: {
            disallow: "Disallow (safe)",
            explode: "Explode (show in multiple)",
            primary: "Primary (use first)",
          },
        },
        {
          key: "includeEmpty",
          type: "toggle",
          displayName: "Include empty",
          default: true,
        },
        {
          key: "cellMode",
          type: "dropdown",
          displayName: "Cell display",
          default: "cards",
          options: {
            cards: "Cards",
            compact: "Compact",
            count: "Count only",
          },
        },
        {
          key: "maxCardsPerCell",
          type: "slider",
          displayName: "Max cards per cell",
          min: 0,
          max: 20,
          step: 1,
          default: 6,
        },
        {
          key: "enableDrag",
          type: "toggle",
          displayName: "Enable drag & drop",
          default: true,
        },
        {
          key: "cardFields",
          type: "text",
          displayName: "Card fields (comma-separated)",
          default: "",
          placeholder: "status,priority,due",
          description: "Frontmatter fields shown on cards (without note.). Use the 'Card fields' button in the Matrix view axis bar for easier selection.",
        },
        {
          key: "cellSortBy",
          type: "text",
          displayName: "Cell sort by (field)",
          default: "",
          placeholder: "due",
          description: "Field to sort cards within each cell. Example: due or score",
        },
        {
          key: "cellSortDir",
          type: "dropdown",
          displayName: "Cell sort direction",
          default: "asc",
          options: { asc: "Ascending", desc: "Descending" },
        },
        {
          key: "cellSummaryMode",
          type: "dropdown",
          displayName: "Cell summary",
          default: "count",
          options: { off: "Off", count: "Count only", sum: "Sum (numeric)", avg: "Average (numeric)", min: "Minimum (numeric)", max: "Maximum (numeric)" },
        },
        {
          key: "showCountChip",
          type: "toggle",
          displayName: "Show count chip",
          default: true,
        },
        {
          key: "cellSummaryField",
          type: "text",
          displayName: "Cell summary field (numeric)",
          default: "",
          placeholder: "budget",
          description: "Used for Sum/Avg. Example: estimate",
        },
        {
          key: "compactFields",
          type: "text",
          displayName: "Compact fields (comma-separated)",
          default: "",
          placeholder: "priority,due",
          description: "Fields shown as subtitle in compact mode. Example: priority,due",
        },
        {
          key: "compactMaxFields",
          type: "slider",
          displayName: "Compact max fields",
          min: 0,
          max: 5,
          step: 1,
          default: 2,
        },
        {
          key: "heatmapMode",
          type: "dropdown",
          displayName: "Heatmap",
          default: "off",
          options: { off: "Off", count: "Count" },
        },
        {
          key: "heatmapStrength",
          type: "slider",
          displayName: "Heatmap strength",
          min: 0,
          max: 60,
          step: 5,
          default: 35,
        },
        {
          key: "heatmapScale",
          type: "dropdown",
          displayName: "Heatmap scale",
          default: "linear",
          options: { linear: "Linear", log: "Log" },
        },
      ]) as unknown,
    });
  }
}
