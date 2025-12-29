import type { BasesPropertyId } from "obsidian";

export function parseCommaList(s: string): string[] {
  if (!s || !s.trim()) return [];
  return s.split(",").map(x => x.trim()).filter(x => x.length > 0);
}

export function asNoteProp(field: string): BasesPropertyId {
  if (field.startsWith("note.")) return field as BasesPropertyId;
  return `note.${field}` as BasesPropertyId;
}
