"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { parseSourcesFromContent, stripSourcesFromContent } from "@/lib/parse-sources";
import { saveMessages } from "@/app/actions/chat";
import { Loader2, Send, User, Copy, Check, FileText } from "lucide-react";

type ChatPanelProps = {
  sessionId: string | null;
  initialMessages: { id?: string; role: string; content: string }[];
  body: { selectedFile?: string | null; sessionId?: string };
  onCopy: (id: string, text: string) => void;
  copiedId: string | null;
  onSessionsRefresh: () => void;
};

export function ChatPanel({
  sessionId,
  initialMessages,
  body,
  onCopy,
  copiedId,
  onSessionsRefresh,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    id: sessionId ?? undefined,
    initialMessages: initialMessages.map((m) => ({
      id: m.id ?? crypto.randomUUID(),
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    body,
    onFinish: async (message) => {
      if (sessionId) {
        const next = [...messages, message];
        await saveMessages(
          sessionId,
          next.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }))
        );
        onSessionsRefresh();
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pb-4">
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
                      onClick={() => onCopy(m.id, content)}
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
                        strong: ({ children }) => (
                          <strong className="font-semibold text-zinc-200">{children}</strong>
                        ),
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
    </>
  );
}
