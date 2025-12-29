import { App, Modal, Setting } from "obsidian";

export class TextPromptModal extends Modal {
  private readonly titleText: string;
  private readonly initialValue: string;
  private readonly placeholder: string;
  private readonly onSubmit: (value: string) => void;

  constructor(
    app: App,
    args: {
      title: string;
      initialValue?: string;
      placeholder?: string;
      onSubmit: (value: string) => void;
    }
  ) {
    super(app);
    this.titleText = args.title;
    this.initialValue = args.initialValue ?? "";
    this.placeholder = args.placeholder ?? "";
    this.onSubmit = args.onSubmit;
  }

  onOpen(): void {
    this.setTitle(this.titleText);

    let current = this.initialValue;

    new Setting(this.contentEl)
      .setName("Label")
      .addText((t) => {
        t.setPlaceholder(this.placeholder);
        t.setValue(this.initialValue);
        t.onChange((v) => (current = v));
      });

    new Setting(this.contentEl).addButton((b) => {
      b.setButtonText("Save");
      b.setCta();
      b.onClick(() => {
        this.onSubmit(current);
        this.close();
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
