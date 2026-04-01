import { z } from "zod";

export const UploadResponseSchema = z.object({
  documentId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int().positive(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETE", "FAILED"]),
});

export const IngestRequestSchema = z.object({
  documentId: z.string().uuid(),
});

export const QueryRequestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
  sessionId: z.string().uuid().optional(),
  selectedDocumentId: z.string().uuid().nullable().optional(),
});

