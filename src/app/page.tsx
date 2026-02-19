"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseSourcesFromContent, stripSourcesFromContent } from "@/lib/parse-sources";
import { UploadZone } from "@/components/upload/UploadZone";
import { Loader2, Send, User, Copy, Check, FileText } from "lucide-react";
import { Toaster } from "sonner";

export default function HomePage() {
  const [documentList, setDocumentList] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingToastIdRef = useRef<string | number | null>(null);

  const fetchDocuments = useCallback(() => {
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: string[]) => setDocumentList(Array.isArray(list) ? list : []))
      .catch(() => setDocumentList([]));
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    body: { selectedFile: selectedFile === "all" ? null : selectedFile },
  });

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFileSelect = async (file: File) => {
    if (ingesting) return;
    setIngesting(true);
    const dismissLoading = () => {
      if (loadingToastIdRef.current != null) {
        toast.dismiss(loadingToastIdRef.current);
        loadingToastIdRef.current = null;
      }
    };
    loadingToastIdRef.current = toast.loading("Extracting text...");
    const t2 = window.setTimeout(() => {
      dismissLoading();
      loadingToastIdRef.current = toast.loading("Generating embeddings...");
    }, 2000);
    const t3 = window.setTimeout(() => {
      dismissLoading();
      loadingToastIdRef.current = toast.loading("Syncing with Pinecone...");
    }, 4500);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      dismissLoading();
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (res.ok && data.success) {
        toast.success(`Document added to vault (${data.chunksCount} chunks)`);
        fetchDocuments();
      } else {
        toast.error(data.error || "Ingestion failed.");
      }
    } catch (err) {
      dismissLoading();
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      toast.error(err instanceof Error ? err.message : "Ingestion failed.");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] px-6 py-4 shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Nexus AI</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Private document vault — ask questions, get cited answers.
        </p>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-4 py-6 min-h-0">
        <div className="mb-4 shrink-0">
          <UploadZone onFileSelect={handleFileSelect} className="pointer-events-auto" disabled={ingesting} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
          <span className="text-xs font-medium text-zinc-500">Sources:</span>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
          >
            <option value="all">All documents</option>
            {documentList.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {selectedFile !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)]/20 px-2 py-0.5 text-xs text-[var(--accent)]">
              <FileText className="h-3 w-3" />
              {selectedFile}
            </span>
          )}
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-6 pb-4">
          {messages.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-8">
              Ask a question about your documents.
            </p>
          )}
          {messages.map((m) => {
            if (m.role === "assistant") {
              const content = typeof m.content === "string" ? m.content : "";
              const sources = parseSourcesFromContent(content);
              const bodyText = stripSourcesFromContent(content);
              return (
                <div key={m.id} className="flex gap-3 justify-start">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center">
                    <span className="text-[var(--accent)] text-xs font-semibold">AI</span>
                  </div>
                  <div className="rounded-2xl px-4 py-3 max-w-[85%] bg-[var(--muted)] border border-[var(--border)]">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium opacity-80">Nexus AI</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, content)}
                        className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedId === m.id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="text-sm prose prose-invert prose-sm max-w-none break-words">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                          li: ({ children }) => <li className="my-0.5">{children}</li>,
                          code: ({ className, children }) =>
                            className ? (
                              <code className={cn("rounded bg-white/10 px-1 py-0.5 text-xs", className)}>
                                {children}
                              </code>
                            ) : (
                              <code className="rounded bg-white/10 px-1 py-0.5 text-xs">{children}</code>
                            ),
                          pre: ({ children }) => (
                            <pre className="rounded-lg bg-black/30 p-3 overflow-x-auto text-xs my-2">
                              {children}
                            </pre>
                          ),
                          strong: ({ children }) => <strong className="font-semibold text-zinc-200">{children}</strong>,
                        }}
                      >
                        {bodyText}
                      </ReactMarkdown>
                    </div>
                    {sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)]/50 flex flex-wrap gap-1.5">
                        {sources.map((s, i) => (
                          <span
                            key={`${s.fileName}-${s.page ?? i}`}
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-xs text-[var(--accent)]"
                          >
                            <FileText className="h-3 w-3 shrink-0" />
                            {s.fileName}
                            {s.page != null && <span className="opacity-80">· Page {s.page}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className="flex gap-3 justify-end">
                <div className="rounded-2xl px-4 py-3 max-w-[85%] bg-[var(--accent)] text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium opacity-90">You</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {typeof m.content === "string" ? m.content : null}
                  </div>
                </div>
                <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                  <User className="h-4 w-4 text-zinc-400" />
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center">
                <Loader2 className="h-4 w-4 text-[var(--accent)] animate-spin" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-[var(--muted)] border border-[var(--border)]">
                <span className="text-sm text-zinc-500">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 shrink-0 pt-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask something about your documents..."
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
