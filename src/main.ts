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
          filter: (propId: any) => propId.startsWith("note."),
        },
        {
          key: "colsProp",
          type: "property",
          displayName: "Columns",
          placeholder: "Pick a property",
          filter: (propId: any) => propId.startsWith("note."),
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
      ]) as any,
    });
  }
}
