"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DocumentViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
  mimeType: string;
};

export function DocumentViewerDialog({ open, onOpenChange, title, url, mimeType }: DocumentViewerDialogProps) {
  const isPdf = mimeType === "application/pdf" || title.toLowerCase().endsWith(".pdf");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 w-[min(960px,calc(100vw-2rem))] h-[min(80vh,720px)] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <Dialog.Title className="text-sm font-medium text-zinc-200 truncate">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="h-[calc(100%-3rem)] bg-black/20">
            {isPdf ? (
              <iframe title={title} src={url} className="w-full h-full" />
            ) : (
              <div className="p-4 text-sm text-zinc-300">
                <p className="mb-2">Preview isn’t available for this file type.</p>
                <a
                  className="text-[var(--accent)] underline"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in a new tab
                </a>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

