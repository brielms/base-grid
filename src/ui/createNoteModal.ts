import { App, Modal, Setting, normalizePath } from "obsidian";
import { FilePickerModal } from "./filePickerModal";

export class CreateNoteModal extends Modal {
  private readonly rowKey: string;
  private readonly colKey: string;
  private readonly rowMapping: { ok: boolean; value?: any; reason?: string };
  private readonly colMapping: { ok: boolean; value?: any; reason?: string };
  private readonly onSubmit: (title: string, folder: string, templatePath?: string) => void;
  private readonly onCancel: () => void;
  private readonly defaultFolder: string;
  private readonly defaultTemplatePath?: string;
  private readonly onFolderChange?: (folder: string) => void;
  private readonly onTemplateChange?: (templatePath?: string) => void;

  constructor(
    app: App,
    args: {
      rowKey: string;
      colKey: string;
      rowMapping: { ok: boolean; value?: any; reason?: string };
      colMapping: { ok: boolean; value?: any; reason?: string };
      onSubmit: (title: string, folder: string, templatePath?: string) => void;
      onCancel: () => void;
      defaultFolder?: string;
      defaultTemplatePath?: string;
      onFolderChange?: (folder: string) => void;
      onTemplateChange?: (templatePath?: string) => void;
    }
  ) {
    super(app);
    this.rowKey = args.rowKey;
    this.colKey = args.colKey;
    this.rowMapping = args.rowMapping;
    this.colMapping = args.colMapping;
    this.onSubmit = args.onSubmit;
    this.onCancel = args.onCancel;
    this.defaultFolder = args.defaultFolder || "";
    this.defaultTemplatePath = args.defaultTemplatePath;
    this.onFolderChange = args.onFolderChange;
    this.onTemplateChange = args.onTemplateChange;
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
    let folder = this.defaultFolder;
    let templatePath = this.defaultTemplatePath;

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

    // Template picker
    const templateDisplay = templatePath ?
      this.app.vault.getAbstractFileByPath(templatePath)?.name || "(invalid)" :
      "(none)";

    new Setting(contentEl)
      .setName("Template")
      .setDesc("Template note to base the new note on")
      .addText((t) => {
        t.setValue(templateDisplay);
        t.setDisabled(true);
      })
      .addButton((b) => {
        b.setButtonText("Choose…");
        b.onClick(() => {
          new FilePickerModal(this.app, (file) => {
            templatePath = file.path;
            const newDisplay = file.name;
            // Update the display text
            const textInput = b.buttonEl.parentElement?.querySelector("input");
            if (textInput) {
              (textInput as HTMLInputElement).value = newDisplay;
            }
            if (this.onTemplateChange) {
              this.onTemplateChange(templatePath);
            }
          }).open();
        });
      })
      .addButton((b) => {
        b.setButtonText("Clear");
        b.onClick(() => {
          templatePath = undefined;
          const textInput = b.buttonEl.parentElement?.querySelector("input");
          if (textInput) {
            (textInput as HTMLInputElement).value = "(none)";
          }
          if (this.onTemplateChange) {
            this.onTemplateChange(undefined);
          }
        });
      });

    // Folder picker (MVP - simple text input)
    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Folder to create the note in (leave empty for vault root)")
      .addText((t) => {
        t.setPlaceholder("/");
        t.setValue(folder);
        t.onChange((v) => {
          folder = normalizePath(v).replace(/^\/+/, "");
          if (this.onFolderChange) {
            this.onFolderChange(folder);
          }
        });
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
          this.onSubmit(title, folder, templatePath);
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
