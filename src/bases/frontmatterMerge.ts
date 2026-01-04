import { parseYaml, stringifyYaml } from "obsidian";

export interface ParsedFrontmatter {
  frontmatterText?: string;
  body: string;
}

/**
 * Parse frontmatter from a markdown string.
 * Uses conservative regex to detect YAML frontmatter at the top.
 * Returns the frontmatter text (if present) and the body.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
  const match = text.match(frontmatterRegex);

  if (match) {
    const frontmatterText = match[1];
    const body = text.slice(match[0].length);
    return { frontmatterText, body };
  }

  return { body: text };
}

/**
 * Merge template frontmatter with injected properties.
 * Template properties are overridden by injected ones.
 * Returns the merged frontmatter as YAML string.
 */
export function mergeFrontmatter(templateFmText: string | undefined, injectedObj: Record<string, any>): string {
  let templateObj: Record<string, any> = {};

  // Parse template frontmatter if present
  if (templateFmText) {
    try {
      templateObj = parseYaml(templateFmText) || {};
    } catch (err) {
      console.warn("Failed to parse template frontmatter, using empty object:", err);
      templateObj = {};
    }
  }

  // Merge: template properties first, then injected (injected wins)
  const merged = { ...templateObj, ...injectedObj };

  // Convert back to YAML
  try {
    return stringifyYaml(merged);
  } catch (err) {
    console.warn("Failed to stringify merged frontmatter, falling back to simple format:", err);
    // Fallback: simple key-value format
    const lines = Object.entries(merged).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
    return lines.join('\n');
  }
}
