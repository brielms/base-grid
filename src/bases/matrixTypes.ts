export type CellMode = "cards" | "compact" | "count";

export type MatrixBucketKey = string; // stable string key for a bucket

export type DragPayload = {
  filePath: string;
  fromRowKey: string;
  fromColKey: string;
};
