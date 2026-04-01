import { describePdfWithVision } from "@/lib/gemini-vision";

export type ExtractedDocument = {
  text: string;
  pageNumber?: number;
  visionDescription?: string;
};

export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const pdfParseModule = await import("pdf-parse");
    const parse =
      (pdfParseModule as { default?: (b: Buffer) => Promise<{ text?: string; numpages?: number }> }).default ??
      (pdfParseModule as unknown as (b: Buffer) => Promise<{ text?: string; numpages?: number }>);
    const parsed = await parse(buffer);
    let visionDescription: string | undefined;
    try {
      visionDescription = await describePdfWithVision(buffer);
    } catch {
      visionDescription = undefined;
    }
    return {
      text: parsed.text ?? "",
      pageNumber: parsed.numpages ? 1 : undefined,
      visionDescription,
    };
  }

  if (ext === "docx") {
    const mammothModule = await import("mammoth");
    const mammoth = (mammothModule as any).default ?? mammothModule;
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value ?? "", pageNumber: 1 };
  }

  return { text: buffer.toString("utf-8"), pageNumber: 1 };
}

