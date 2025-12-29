import { App, Modal, Setting, Notice } from "obsidian";
import type { AxisBucketSpec, NumberRange } from "../bases/bucketSpec";

function serializeRanges(ranges: NumberRange[]): string {
  return ranges.map(r => `${r.label}|${r.min ?? ""}|${r.max ?? ""}`).join("\n");
}

function parseRanges(text: string): NumberRange[] {
  const out: NumberRange[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const [label, minS, maxS] = line.split("|").map(x => x?.trim() ?? "");
    if (!label) continue;

    const min = minS ? Number(minS) : undefined;
    const max = maxS ? Number(maxS) : undefined;

    if (minS && !Number.isFinite(min)) throw new Error(`Bad min in: ${line}`);
    if (maxS && !Number.isFinite(max)) throw new Error(`Bad max in: ${line}`);

    out.push({ label, min, max });
  }
  return out;
}

export class BucketConfigModal extends Modal {
  private spec: AxisBucketSpec;
  private axisLabel: string;
  private onSave: (spec: AxisBucketSpec) => void;

  constructor(app: App, args: { axisLabel: string; initial: AxisBucketSpec; onSave: (spec: AxisBucketSpec) => void }) {
    super(app);
    this.axisLabel = args.axisLabel;
    this.spec = args.initial;
    this.onSave = args.onSave;
  }

  onOpen(): void {
    this.setTitle(`Bucketing: ${this.axisLabel}`);
    const el = this.contentEl;
    el.empty();

    let type: AxisBucketSpec["type"] = this.spec.type;

    const rangesArea = el.createEl("textarea");
    rangesArea.style.width = "100%";  
    rangesArea.style.minHeight = "160px";  
    rangesArea.style.display = "none";  

    const quantilesSetting = new Setting(el).setName("Quantiles (k)").setDesc("Only for numbers: quantiles");
    let quantilesK = this.spec.type === "numberQuantiles" ? this.spec.k : 4;
    quantilesSetting.addText((t) => {
      t.setValue(String(quantilesK));
      t.onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n)) quantilesK = Math.max(2, Math.min(10, Math.floor(n)));
      });
    });
    quantilesSetting.settingEl.style.display = "none";  

    if (this.spec.type === "numberRanges") {
      rangesArea.value = serializeRanges(this.spec.ranges);
      rangesArea.style.display = "block";  
    }

    new Setting(el)
      .setName("Bucket type")
      .addDropdown((d) => {
        d.addOption("categorical", "Categorical (exact values)");
        d.addOption("dateRelative", "Date: relative buckets");
        d.addOption("numberRanges", "Number: ranges");
        d.addOption("numberQuantiles", "Number: quantiles");
        d.setValue(type);
        d.onChange((v) => {
          type = v as unknown;
          rangesArea.style.display = type === "numberRanges" ? "block" : "none";  
          quantilesSetting.settingEl.style.display = type === "numberQuantiles" ? "flex" : "none";  
        });
      });

    el.createDiv({
      cls: "setting-item-description",
      text: "Ranges format: Label|min|max (min inclusive, max exclusive). Example:\nLow||3\nMed|3|7\nHigh|7|",
    });

    new Setting(el).addButton((b) => {
      b.setButtonText("Save");
      b.setCta();
      b.onClick(() => {
        try {
          const next: AxisBucketSpec =
            type === "categorical"
              ? { type: "categorical" }
              : type === "dateRelative"
              ? { type: "dateRelative", mode: "overdue-today-week-nextweek-month-later" }
              : type === "numberRanges"
              ? { type: "numberRanges", ranges: parseRanges(rangesArea.value), invalidLabel: "__INVALID__" }
              : { type: "numberQuantiles", k: quantilesK, invalidLabel: "__INVALID__" };

          this.onSave(next);
          new Notice("Bucketing updated");
          this.close();
        } catch (e) {
          new Notice(`Save failed: ${(e as Error).message}`);
        }
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
