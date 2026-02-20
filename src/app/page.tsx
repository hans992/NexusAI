"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UploadZone } from "@/components/upload/UploadZone";
import {
  createSession,
  getSessions,
  getSession,
  saveMessages,
  deleteSession,
} from "@/app/actions/chat";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Loader2, FileText, MessageSquarePlus, Trash2 } from "lucide-react";

export default function HomePage() {
  const [documentList, setDocumentList] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof getSessions>>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadedMessages, setLoadedMessages] = useState<{ id?: string; role: string; content: string }[]>([]);
  const loadingToastIdRef = useRef<string | number | null>(null);

  const fetchDocuments = useCallback(() => {
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: string[]) => setDocumentList(Array.isArray(list) ? list : []))
      .catch(() => setDocumentList([]));
  }, []);

  const fetchSessions = useCallback(async () => {
    const list = await getSessions();
    setSessions(list);
    return list;
  }, []);

  const chatBody = {
    selectedFile: selectedFile === "all" ? null : selectedFile,
    sessionId: sessionId ?? undefined,
  };

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    (async () => {
      const list = await fetchSessions();
      if (list.length > 0 && !sessionId) {
        setSessionId(list[0].id);
        const session = await getSession(list[0].id);
        setLoadedMessages(session?.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })) ?? []);
      }
    })();
  }, []);

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleNewChat = async () => {
    const session = await createSession();
    setSessionId(session.id);
    setLoadedMessages([]);
    await fetchSessions();
  };

  const handleSelectSession = async (id: string) => {
    if (id === sessionId) return;
    setSessionId(id);
    const session = await getSession(id);
    setLoadedMessages(session?.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })) ?? []);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSession(id);
    if (sessionId === id) {
      const list = await fetchSessions();
      const next = list.find((s) => s.id !== id);
      if (next) handleSelectSession(next.id);
      else await handleNewChat();
    } else await fetchSessions();
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
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--background)]">
        <div className="p-3 border-b border-[var(--border)]">
          <button
            type="button"
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-[var(--muted)] hover:text-white transition-colors"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Chat history
          </p>
          {sessions.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectSession(s.id)}
              onKeyDown={(e) => e.key === "Enter" && handleSelectSession(s.id)}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-sm text-zinc-400 hover:bg-[var(--muted)] hover:text-zinc-200 cursor-pointer",
                sessionId === s.id && "bg-[var(--muted)] text-white"
              )}
            >
              <span className="flex-1 truncate">{s.title}</span>
              <button
                type="button"
                onClick={(e) => handleDeleteSession(e, s.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-red-400 transition-all"
                aria-label="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-[var(--border)] px-6 py-4 shrink-0">
          <h1 className="text-xl font-semibold tracking-tight">Nexus AI</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Private document vault — ask questions, get cited answers.
          </p>
        </header>

        <main className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-4 py-6 min-h-0 w-full">
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

          <ChatPanel
            key={sessionId ?? "new"}
            sessionId={sessionId}
            initialMessages={loadedMessages}
            body={chatBody}
            onCopy={handleCopy}
            copiedId={copiedId}
            onSessionsRefresh={fetchSessions}
          />
        </main>
      </div>
    </div>
  );
}
