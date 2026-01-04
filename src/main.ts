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
        // A) Axes
        {
          type: "group",
          displayName: "Axes",
          items: [
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
          ],
        },
        // B) Cells
        {
          type: "group",
          displayName: "Cells",
          items: [
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
              key: "showCountChip",
              type: "toggle",
              displayName: "Show count chip",
              default: true,
            },
          ],
        },
        // C) Sorting
        {
          type: "group",
          displayName: "Sorting",
          shouldHide: (config) => {
            const sortBy = String(config.get("cellSortBy") ?? "").trim();
            return sortBy === "";
          },
          items: [
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
          ],
        },
        // D) Summary
        {
          type: "group",
          displayName: "Summary",
          shouldHide: (config) => {
            const mode = String(config.get("cellSummaryMode") ?? "count");
            return mode === "off";
          },
          items: [
            {
              key: "cellSummaryMode",
              type: "dropdown",
              displayName: "Cell summary",
              default: "count",
              options: { off: "Off", count: "Count only", sum: "Sum (numeric)", avg: "Average (numeric)", min: "Minimum (numeric)", max: "Maximum (numeric)" },
            },
            {
              key: "cellSummaryField",
              type: "text",
              displayName: "Cell summary field (numeric)",
              default: "",
              placeholder: "budget",
              description: "Used for Sum/Avg. Example: estimate",
              shouldHide: (config) => {
                const mode = String(config.get("cellSummaryMode") ?? "count");
                return !["sum", "avg", "min", "max"].includes(mode);
              },
            },
          ],
        },
        // E) Cards
        {
          type: "group",
          displayName: "Cards",
          items: [
            {
              key: "cardFields",
              type: "text",
              displayName: "Card fields (comma-separated)",
              default: "",
              placeholder: "status,priority,due",
              description: "Frontmatter fields shown on cards (without note.). Use the 'Card fields' button in the Matrix view axis bar for easier selection.",
            },
            // Compact options - conditionally shown
            {
              type: "group",
              displayName: "Compact Options",
              shouldHide: (config) => {
                const cellMode = String(config.get("cellMode") ?? "cards");
                return cellMode !== "compact";
              },
              items: [
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
              ],
            },
            // Thumbnail mode (always visible)
            {
              key: "cardThumbMode",
              type: "dropdown",
              displayName: "Card thumbnail mode",
              default: "off",
              options: {
                off: "Off",
                frontmatter: "Frontmatter field",
                firstEmbedded: "First embedded image",
              },
            },
            // Thumbnail options - conditionally shown when mode != "off"
            {
              type: "group",
              displayName: "Thumbnail Settings",
              shouldHide: (config) => {
                const thumbMode = String(config.get("cardThumbMode") ?? "off");
                return thumbMode === "off";
              },
              items: [
                {
                  key: "cardThumbField",
                  type: "text",
                  displayName: "Thumbnail field",
                  default: "cover",
                  placeholder: "cover",
                  description: "Frontmatter field containing the image path (only used when mode is 'Frontmatter field'). Use the 'Thumbnail field' button in the Matrix view axis bar for easier selection.",
                },
                {
                  key: "cardThumbSize",
                  type: "dropdown",
                  displayName: "Thumbnail size",
                  default: "sm",
                  options: {
                    sm: "Small",
                    md: "Medium",
                  },
                },
                {
                  key: "allowRemoteThumbs",
                  type: "toggle",
                  displayName: "Allow remote thumbnails",
                  default: false,
                  description: "Allow HTTP(S) URLs in frontmatter fields (only if explicitly enabled).",
                },
              ],
            },
          ],
        },
        // F) Heatmap
        {
          type: "group",
          displayName: "Heatmap",
          items: [
            {
              key: "heatmapMode",
              type: "dropdown",
              displayName: "Heatmap",
              default: "off",
              options: { off: "Off", count: "Count" },
            },
            // Heatmap options - conditionally shown
            {
              type: "group",
              displayName: "Heatmap Settings",
              shouldHide: (config) => {
                const heatmapMode = String(config.get("heatmapMode") ?? "off");
                return heatmapMode === "off";
              },
              items: [
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
              ],
            },
          ],
        },
        // G) Creation
        {
          type: "group",
          displayName: "Creation",
          items: [
            {
              key: "createNoteTemplatePath",
              type: "text",
              displayName: "Default template note (path)",
              default: "",
              placeholder: "Templates/Scene Template.md",
              description: "Default template note path to use when creating notes in cells",
            },
            {
              key: "lastCreateNoteFolder",
              type: "text",
              displayName: "Last create note folder",
              default: "",
              description: "Last folder path used when creating notes in cells",
            },
            {
              key: "lastCreateNoteTemplatePath",
              type: "text",
              displayName: "Last create note template",
              default: "",
              description: "Last template path used when creating notes in cells",
            },
          ],
        },
      ]) as unknown,
    });
  }
}
