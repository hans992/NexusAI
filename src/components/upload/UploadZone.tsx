"use client";

import { cn } from "@/lib/utils";
import { FileUp } from "lucide-react";

type UploadZoneProps = {
  onFileSelect?: (file: File) => void;
  className?: string;
  disabled?: boolean;
};

export function UploadZone({ onFileSelect, className, disabled }: UploadZoneProps) {
  return (
    <label
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-8 transition-colors",
        !disabled && "cursor-pointer hover:border-[var(--accent)]/50 hover:bg-[var(--muted)]/50",
        disabled && "opacity-60 pointer-events-none",
        className
      )}
    >
      <input
        type="file"
        className="hidden"
        accept=".pdf,.txt,.md"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect?.(file);
        }}
      />
      <FileUp className="h-10 w-10 text-zinc-500" />
      <span className="text-sm font-medium text-zinc-400">
        Drop a file or click to upload
      </span>
      <span className="text-xs text-zinc-600">PDF, TXT, MD</span>
    </label>
  );
}
