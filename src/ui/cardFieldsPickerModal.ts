import { App, Modal, Setting, ButtonComponent } from "obsidian";

export class CardFieldsPickerModal extends Modal {
  private readonly titleText: string;
  private readonly items: string[];
  private readonly current: string[];
  private readonly onPick: (selectedFields: string[]) => void;
  private selectedFields: Set<string>;

  constructor(app: App, args: {
    title: string;
    items: string[];
    current: string[];
    onPick: (selectedFields: string[]) => void
  }) {
    super(app);
    this.titleText = args.title;
    this.items = args.items;
    this.current = args.current;
    this.onPick = args.onPick;
    this.selectedFields = new Set(args.current);
  }

  onOpen(): void {
    this.setTitle(this.titleText);
    this.contentEl.empty();

    let query = "";
    const listEl = this.contentEl.createDiv({ cls: "bmv-prop-picker-list" });

    const render = () => {
      listEl.empty();
      const q = query.trim().toLowerCase();

      const filtered = q.length === 0
        ? this.items
        : this.items.filter((x) => x.toLowerCase().includes(q));

      for (const prop of filtered.slice(0, 200)) {
        const row = listEl.createDiv({ cls: "bmv-card-field-row" });

        // Checkbox
        const checkbox = row.createEl("input", { type: "checkbox" });
        checkbox.checked = this.selectedFields.has(prop);
        checkbox.addEventListener("change", (e) => {
          const target = e.target as HTMLInputElement;
          if (target.checked) {
            this.selectedFields.add(prop);
          } else {
            this.selectedFields.delete(prop);
          }
        });

        // Label
        const label = row.createSpan({ text: prop, cls: "bmv-card-field-label" });
        label.addEventListener("click", () => {
          checkbox.checked = !checkbox.checked;
          const event = new Event("change");
          checkbox.dispatchEvent(event);
        });
      }
    };

    new Setting(this.contentEl)
      .setName("Search")
      .addText((t) => {
        t.setPlaceholder("Type to filter properties…");
        t.onChange((v) => { query = v; render(); });
        setTimeout(() => t.inputEl.focus(), 0);
      });

    // Action buttons
    const buttonContainer = this.contentEl.createDiv({ cls: "bmv-modal-buttons" });

    new ButtonComponent(buttonContainer)
      .setButtonText("Cancel")
      .onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText("Select fields")
      .setCta()
      .onClick(() => {
        this.onPick(Array.from(this.selectedFields));
        this.close();
      });

    render();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
