import { App, Modal, Setting, ButtonComponent } from "obsidian";
import { isMultiValue } from "../bases/multiValue";

interface SampleEntry {
  file: { basename: string };
  getValue: (propId: string) => unknown;
}

export class CardFieldsTemplateEditor extends Modal {
  private readonly mode: "cards" | "compact";
  private readonly items: string[];
  private selectedFields: string[];
  private readonly sampleEntry: SampleEntry | null;
  private readonly onSave: (selectedFields: string[]) => void;

  private draggedElement: HTMLElement | null = null;
  private draggedIndex: number = -1;

  constructor(app: App, args: {
    mode: "cards" | "compact";
    items: string[];
    current: string[];
    sampleEntry: SampleEntry | null;
    onSave: (selectedFields: string[]) => void
  }) {
    super(app);
    this.mode = args.mode;
    this.items = args.items;
    this.selectedFields = [...args.current];
    this.sampleEntry = args.sampleEntry;
    this.onSave = args.onSave;
  }

  onOpen(): void {
    const title = this.mode === "cards" ? "Card Fields Template Editor" : "Compact Fields Template Editor";
    this.setTitle(title);
    this.contentEl.empty();

    let query = "";

    // Main container with two columns
    const mainContainer = this.contentEl.createDiv({ cls: "bmv-template-editor" });

    // Left column: Available fields
    const leftColumn = mainContainer.createDiv({ cls: "bmv-template-left" });
    leftColumn.createDiv({ cls: "bmv-template-section-title", text: "Available Fields" });

    new Setting(leftColumn)
      .setName("Search")
      .addText((t) => {
        t.setPlaceholder("Filter fields…");
        t.onChange((v) => { query = v; this.renderAvailableFields(availableContainer, query); });
        setTimeout(() => t.inputEl.focus(), 0);
      });

    const availableContainer = leftColumn.createDiv({ cls: "bmv-available-fields" });

    // Right column: Selected fields + preview
    const rightColumn = mainContainer.createDiv({ cls: "bmv-template-right" });

    // Selected fields section
    const selectedSection = rightColumn.createDiv({ cls: "bmv-selected-section" });
    selectedSection.createDiv({ cls: "bmv-template-section-title", text: "Selected Fields (drag to reorder)" });

    const selectedContainer = selectedSection.createDiv({ cls: "bmv-selected-fields" });

    // Preview section
    const previewSection = rightColumn.createDiv({ cls: "bmv-preview-section" });
    previewSection.createDiv({ cls: "bmv-template-section-title", text: "Preview" });
    const previewContainer = previewSection.createDiv({ cls: "bmv-card-preview" });

    // Action buttons
    const buttonContainer = this.contentEl.createDiv({ cls: "bmv-modal-buttons" });
    new ButtonComponent(buttonContainer)
      .setButtonText("Cancel")
      .onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText("Save template")
      .setCta()
      .onClick(() => {
        this.onSave([...this.selectedFields]);
        this.close();
      });

    this.renderAvailableFields(availableContainer, query);
    this.renderSelectedFields(selectedContainer);
    this.renderPreview(previewContainer);
  }

  private renderAvailableFields(container: Element, query: string): void {
    container.empty();

    const filtered = query.length === 0
      ? this.items
      : this.items.filter(item => item.toLowerCase().includes(query.toLowerCase()));

    for (const field of filtered.slice(0, 100)) {
      if (this.selectedFields.includes(field)) continue;

      const row = container.createDiv({ cls: "bmv-available-field" });
      row.createSpan({ text: field });

      const addBtn = row.createEl("button", { cls: "bmv-add-btn", text: "+" });
      addBtn.onclick = () => {
        this.selectedFields.push(field);
        this.refreshUI();
      };
    }
  }

  private renderSelectedFields(container: Element): void {
    container.empty();

    for (let i = 0; i < this.selectedFields.length; i++) {
      const field = this.selectedFields[i];
      const row = container.createDiv({
        cls: "bmv-selected-field",
        attr: { "data-index": i.toString(), draggable: "true" }
      });

      // Drag handle
      row.createDiv({ cls: "bmv-drag-handle", text: "⋮⋮" });

      // Field name
      row.createSpan({ text: field, cls: "bmv-selected-field-name" });

      // Remove button
      const removeBtn = row.createEl("button", { cls: "bmv-remove-btn", text: "×" });
      removeBtn.onclick = () => {
        this.selectedFields.splice(i, 1);
        this.refreshUI();
      };

      // Drag event listeners
      row.addEventListener("dragstart", (e) => {
        this.draggedElement = row;
        this.draggedIndex = i;
        row.addClass("bmv-dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      row.addEventListener("dragend", () => {
        this.draggedElement = null;
        this.draggedIndex = -1;
        row.removeClass("bmv-dragging");
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (this.draggedElement && this.draggedElement !== row) {
          const rect = row.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          if (e.clientY < midpoint) {
            row.classList.add("bmv-drop-above");
            row.classList.remove("bmv-drop-below");
          } else {
            row.classList.add("bmv-drop-below");
            row.classList.remove("bmv-drop-above");
          }
        }
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("bmv-drop-above", "bmv-drop-below");
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("bmv-drop-above", "bmv-drop-below");

        if (this.draggedElement && this.draggedIndex !== -1 && this.draggedIndex < this.selectedFields.length) {
          const targetIndex = i;
          const draggedField = this.selectedFields[this.draggedIndex];

          if (!draggedField) return; // Safety check

          // Remove from old position
          this.selectedFields.splice(this.draggedIndex, 1);

          // Insert at new position
          const insertIndex = e.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2
            ? targetIndex
            : targetIndex + 1;
          this.selectedFields.splice(insertIndex, 0, draggedField);

          this.refreshUI();
        }
      });
    }
  }

  private renderPreview(container: Element): void {
    container.empty();

    if (!this.sampleEntry) {
      container.createDiv({ cls: "bmv-preview-unavailable", text: "Preview unavailable - no data loaded" });
      return;
    }

    // Card title
    container.createDiv({ cls: "bmv-preview-title", text: this.sampleEntry.file.basename });

    if (this.mode === "cards") {
      // Cards mode: show pills
      if (this.selectedFields.length > 0) {
        const metaEl = container.createDiv({ cls: "bmv-preview-meta" });

        for (const field of this.selectedFields) {
          const propId = `note.${field}`;
          const val = this.sampleEntry.getValue(propId);
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

          const pillEl = metaEl.createSpan({ cls: "bmv-preview-pill", text: displayText });
          pillEl.setAttr("title", tooltipText);
        }
      } else {
        container.createDiv({ cls: "bmv-preview-empty", text: "No fields selected" });
      }
    } else {
      // Compact mode: show subtitle
      if (this.selectedFields.length > 0) {
        const subtitleValues: string[] = [];
        const maxFields = 5; // Use a reasonable default for preview

        for (const field of this.selectedFields) {
          if (subtitleValues.length >= maxFields) break;
          const propId = `note.${field}`;
          const val = this.sampleEntry.getValue(propId);
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
          container.createDiv({ cls: "bmv-preview-subtitle", text: subtitleValues.join(" • ") });
        } else {
          container.createDiv({ cls: "bmv-preview-empty", text: "No subtitle fields available" });
        }
      } else {
        container.createDiv({ cls: "bmv-preview-empty", text: "No fields selected" });
      }
    }
  }

  private refreshUI(): void {
    // Re-render all sections
    const availableContainer = this.contentEl.querySelector(".bmv-available-fields");
    const selectedContainer = this.contentEl.querySelector(".bmv-selected-fields");
    const previewContainer = this.contentEl.querySelector(".bmv-card-preview");

    if (availableContainer && selectedContainer && previewContainer) {
      this.renderAvailableFields(availableContainer, this.contentEl.querySelector("input")?.value ?? "");
      this.renderSelectedFields(selectedContainer);
      this.renderPreview(previewContainer);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
