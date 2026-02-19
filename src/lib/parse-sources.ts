/**
 * Parses source badges from AI response text.
 * Expects format: [Source: filename.pdf, Page N] or [Source: filename.pdf]
 */
const SOURCE_REGEX = /\[Source:\s*([^\],]+)(?:,\s*Page\s*(\d+))?\]/gi;

export interface ParsedSource {
  fileName: string;
  page?: number;
}

export function parseSourcesFromContent(content: string): ParsedSource[] {
  const sources: ParsedSource[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  SOURCE_REGEX.lastIndex = 0;
  while ((m = SOURCE_REGEX.exec(content)) !== null) {
    const fileName = m[1]?.trim() ?? "";
    const page = m[2] ? parseInt(m[2], 10) : undefined;
    const key = `${fileName}-${page ?? ""}`;
    if (fileName && !seen.has(key)) {
      seen.add(key);
      sources.push({ fileName, page });
    }
  }
  return sources;
}

/** Removes source badges from content so they can be rendered separately as badges. */
export function stripSourcesFromContent(content: string): string {
  return content.replace(SOURCE_REGEX, "").replace(/\n{3,}/g, "\n\n").trim();
}
