import { App, Modal, Setting } from "obsidian";

export class PropertyPickerModal extends Modal {
  private readonly titleText: string;
  private readonly items: string[];
  private readonly current?: string;
  private readonly onPick: (propName: string) => void;

  constructor(app: App, args: { title: string; items: string[]; current?: string; onPick: (propName: string) => void }) {
    super(app);
    this.titleText = args.title;
    this.items = args.items;
    this.current = args.current;
    this.onPick = args.onPick;
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
        const row = listEl.createEl("button", { cls: "bmv-prop-picker-row" });
        row.createSpan({ text: prop });

        if (this.current && prop === this.current) {
          row.addClass("is-active");
        }

        row.onclick = () => {
          this.onPick(prop);
          this.close();
        };
      }
    };

    new Setting(this.contentEl)
      .setName("Search")
      .addText((t) => {
        t.setPlaceholder("Type to filter properties…");
        t.onChange((v) => { query = v; render(); });
        setTimeout(() => t.inputEl.focus(), 0);
      });

    render();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
