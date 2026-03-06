import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { prisma } from "@/lib/db";
import { isAuthEnabled } from "@/lib/auth";
import { getSessionFromRequestHeaders } from "@/lib/auth-server";

const f = createUploadthing();

const MAX_FILE_SIZE = "32MB" as const;

export const ourFileRouter = {
  documentUploader: f({
    pdf: { maxFileSize: MAX_FILE_SIZE, maxFileCount: 1 },
    text: { maxFileSize: MAX_FILE_SIZE, maxFileCount: 1 },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileSize: MAX_FILE_SIZE,
      maxFileCount: 1,
    },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      maxFileSize: MAX_FILE_SIZE,
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      if (!isAuthEnabled()) return {};

      const session = await getSessionFromRequestHeaders(req.headers);
      const userId = session?.user?.id ?? null;
      if (!userId) throw new UploadThingError("Unauthorized");

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (user?.role === "VIEWER") {
        throw new UploadThingError("Forbidden");
      }

      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        url: file.ufsUrl,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedBy: (metadata as { userId?: string } | undefined)?.userId,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
