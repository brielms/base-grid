export type CellMode = "cards" | "compact" | "count";

export type GridBucketKey = string; // stable string key for a bucket

export type DragPayload = {
  filePath: string;
  fromRowKey: string;
  fromColKey: string;
};
