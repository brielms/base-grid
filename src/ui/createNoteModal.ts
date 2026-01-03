import { App, Modal, Setting, normalizePath } from "obsidian";

export class CreateNoteModal extends Modal {
  private readonly rowKey: string;
  private readonly colKey: string;
  private readonly rowMapping: { ok: boolean; value?: any; reason?: string };
  private readonly colMapping: { ok: boolean; value?: any; reason?: string };
  private readonly onSubmit: (title: string, folder: string) => void;
  private readonly onCancel: () => void;

  constructor(
    app: App,
    args: {
      rowKey: string;
      colKey: string;
      rowMapping: { ok: boolean; value?: any; reason?: string };
      colMapping: { ok: boolean; value?: any; reason?: string };
      onSubmit: (title: string, folder: string) => void;
      onCancel: () => void;
    }
  ) {
    super(app);
    this.rowKey = args.rowKey;
    this.colKey = args.colKey;
    this.rowMapping = args.rowMapping;
    this.colMapping = args.colMapping;
    this.onSubmit = args.onSubmit;
    this.onCancel = args.onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.setTitle("Create new note in this cell");

    // Show warnings for unmappable properties
    if (!this.rowMapping.ok) {
      contentEl.createDiv({
        cls: "setting-item-description",
        text: `⚠️ Row property cannot be set: ${this.rowMapping.reason || "unsupported bucket type"}`,
      });
    }

    if (!this.colMapping.ok) {
      contentEl.createDiv({
        cls: "setting-item-description",
        text: `⚠️ Column property cannot be set: ${this.colMapping.reason || "unsupported bucket type"}`,
      });
    }

    let title = "Untitled";
    let folder = "";

    // Title input
    new Setting(contentEl)
      .setName("Note title")
      .setDesc("Enter a title for the new note")
      .addText((t) => {
        t.setPlaceholder("Untitled");
        t.setValue(title);
        t.onChange((v) => (title = v.trim()));
        t.inputEl.focus();
      });

    // Folder picker (MVP - simple text input)
    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Folder to create the note in (leave empty for vault root)")
      .addText((t) => {
        t.setPlaceholder("/");
        t.setValue(folder);
        t.onChange((v) => (folder = normalizePath(v).replace(/^\/+/, "")));
      });

    // Buttons
    new Setting(contentEl)
      .addButton((b) => {
        b.setButtonText("Create");
        b.setCta();
        b.onClick(() => {
          if (!title.trim()) {
            title = "Untitled";
          }
          this.onSubmit(title, folder);
          this.close();
        });
      })
      .addButton((b) => {
        b.setButtonText("Cancel");
        b.onClick(() => {
          this.onCancel();
          this.close();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
