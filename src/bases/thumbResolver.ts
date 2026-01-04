import { App, TFile } from "obsidian";

export interface ThumbResult {
  url?: string;
  reason?: string;
}

/**
 * Resolves a thumbnail URL for a given entry file.
 *
 * Supports three modes:
 * - "off": Returns undefined
 * - "frontmatter": Reads the specified field from frontmatter and resolves to a vault file
 * - "firstEmbedded": Finds the first image embed in the file content
 */
export async function resolveThumbForEntry(
  app: App,
  entryFile: TFile,
  mode: "off" | "frontmatter" | "firstEmbedded",
  fieldName: string,
  allowRemote: boolean
): Promise<ThumbResult> {
  if (mode === "off") {
    return {};
  }

  if (mode === "frontmatter") {
    const cache = app.metadataCache.getFileCache(entryFile);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) {
      return { reason: "No frontmatter" };
    }

    const fieldValue = frontmatter[fieldName];
    if (!fieldValue) {
      return { reason: `No '${fieldName}' field` };
    }

    const resolvedUrl = await resolveImageValue(app, entryFile, fieldValue, allowRemote);
    return resolvedUrl;
  }

  if (mode === "firstEmbedded") {
    try {
      const content = await app.vault.cachedRead(entryFile);
      const url = findFirstEmbeddedImage(content);
      if (!url) {
        return { reason: "No embedded images found" };
      }

      const resolvedUrl = await resolveImageValue(app, entryFile, url, allowRemote);
      return resolvedUrl;
    } catch (err) {
      return { reason: `Failed to read file: ${err}` };
    }
  }

  return { reason: "Invalid mode" };
}

/**
 * Resolves an image value (string, wikilink, or markdown image) to a thumbnail URL.
 */
async function resolveImageValue(
  app: App,
  entryFile: TFile,
  value: string,
  allowRemote: boolean
): Promise<ThumbResult> {
  // Handle different formats: plain path, wikilink, markdown image
  const imagePath = extractImagePath(value);
  if (!imagePath) {
    return { reason: "Invalid image format" };
  }

  // Check if it's an HTTP(S) URL
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    if (!allowRemote) {
      return { reason: "Remote URLs not allowed" };
    }
    return { url: imagePath };
  }

  // Resolve vault path
  const tfile = resolveVaultPath(app, entryFile, imagePath);
  if (!tfile) {
    return { reason: "File not found in vault" };
  }

  // Get resource path for Obsidian
  const resourcePath = app.vault.getResourcePath(tfile);
  return { url: resourcePath };
}

/**
 * Extracts the image path from various formats:
 * - Plain path: "assets/image.png"
 * - Wikilink: "[[assets/image.png]]"
 * - Markdown image: "![[assets/image.png]]" or "![](assets/image.png)"
 */
function extractImagePath(value: string): string | null {
  const trimmed = value.trim();

  // Plain path
  if (!trimmed.includes("[[") && !trimmed.includes("](") && !trimmed.includes("![")) {
    return trimmed;
  }

  // Wikilink: [[path]]
  const wikilinkMatch = trimmed.match(/\[\[([^\]]+)\]\]/);
  if (wikilinkMatch) {
    return wikilinkMatch[1];
  }

  // Markdown image: ![alt](path) or ![[path]]
  const markdownMatch = trimmed.match(/!\[.*?\]\(([^)]+)\)/) || trimmed.match(/!\[\[([^\]]+)\]\]/);
  if (markdownMatch) {
    return markdownMatch[1];
  }

  return null;
}

/**
 * Resolves a vault path relative to the entry file or as an absolute path.
 */
function resolveVaultPath(app: App, entryFile: TFile, imagePath: string): TFile | null {
  // First try as absolute vault path
  let tfile = app.vault.getAbstractFileByPath(imagePath);
  if (tfile instanceof TFile) {
    return tfile;
  }

  // Try relative to the entry file's parent directory
  const parentPath = entryFile.parent?.path;
  if (parentPath) {
    const relativePath = `${parentPath}/${imagePath}`;
    tfile = app.vault.getAbstractFileByPath(relativePath);
    if (tfile instanceof TFile) {
      return tfile;
    }
  }

  return null;
}

/**
 * Finds the first embedded image in markdown content.
 * Looks for ![...](...) or ![[...]] patterns.
 */
function findFirstEmbeddedImage(content: string): string | null {
  // First try markdown image syntax: ![alt](path)
  const markdownMatch = content.match(/!\[.*?\]\(([^)]+)\)/);
  if (markdownMatch) {
    return markdownMatch[1];
  }

  // Then try wikilink image syntax: ![[path]]
  const wikilinkMatch = content.match(/!\[\[([^\]]+)\]\]/);
  if (wikilinkMatch) {
    return wikilinkMatch[1];
  }

  return null;
}
