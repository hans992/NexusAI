"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UploadZone } from "@/components/upload/UploadZone";
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
} from "@/app/actions/chat";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { FileText, MessageSquarePlus, Trash2, LogOut } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DocumentViewerDialog } from "@/components/documents/DocumentViewerDialog";
import { getSupabaseBrowserClient } from "@/server/db/supabase-browser";

export type DocumentListItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  chunksCount: number;
  status: string;
  createdAt: string;
};

type UsageSummary = {
  documents: number;
  chatSessions: number;
  recentTokens: number;
};

export default function HomePage() {
  const supabase = getSupabaseBrowserClient();
  const [documentList, setDocumentList] = useState<DocumentListItem[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<DocumentListItem | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof getSessions>>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadedMessages, setLoadedMessages] = useState<{ id?: string; role: string; content: string }[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const loadingToastIdRef = useRef<string | number | null>(null);

  const fetchDocuments = useCallback(() => {
    fetch("/api/rag/documents")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: DocumentListItem[]) => setDocumentList(Array.isArray(list) ? list : []))
      .catch(() => setDocumentList([]));
  }, []);

  const fetchUsage = useCallback(() => {
    fetch("/api/rag/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: UsageSummary | null) => setUsage(data))
      .catch(() => setUsage(null));
  }, []);

  const fetchSessions = useCallback(async () => {
    const list = await getSessions();
    setSessions(list);
    return list;
  }, []);

  const chatBody = {
    selectedDocumentId: selectedDocumentId === "all" ? null : selectedDocumentId,
    sessionId: sessionId ?? undefined,
  };

  useEffect(() => {
    fetchDocuments();
    fetchUsage();
  }, [fetchDocuments, fetchUsage]);

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

  useEffect(() => {
    supabase.auth.getSession().then((result: { data: { session: { user: { email?: string | null } } | null } }) => {
      const { data } = result;
      setUserEmail(data.session?.user.email ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (
        _event: string,
        session: { user: { email?: string | null } } | null
      ) => {
      setUserEmail(session?.user.email ?? null);
      }
    );
    return () => listener.subscription.unsubscribe();
  }, [supabase.auth]);

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

  const handleUpload = useCallback(
    async (file: File) => {
      if (ingesting) return;
      setIngesting(true);
      loadingToastIdRef.current = toast.loading("Processing document...");
      try {
        const form = new FormData();
        form.append("file", file);
        const uploadRes = await fetch("/api/rag/upload", {
          method: "POST",
          body: form,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ error: "Upload failed." }));
          throw new Error(err.error ?? "Upload failed.");
        }
        const upload = await uploadRes.json();

        const ingestRes = await fetch("/api/rag/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: upload.documentId }),
        });
        const result = await ingestRes.json();

        toast.dismiss(loadingToastIdRef.current ?? undefined);
        loadingToastIdRef.current = null;
        if (ingestRes.ok && result.success) {
          toast.success(`Document added to vault (${result.chunksCount} chunks)`);
          fetchDocuments();
          fetchUsage();
        } else {
          toast.error(result.error ?? "Ingestion failed.");
        }
      } catch (err) {
        toast.dismiss(loadingToastIdRef.current ?? undefined);
        loadingToastIdRef.current = null;
        toast.error(err instanceof Error ? err.message : "Ingestion failed.");
      } finally {
        setIngesting(false);
      }
    },
    [ingesting, fetchDocuments, fetchUsage]
  );

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
        <header className="border-b border-[var(--border)] px-6 py-4 shrink-0 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Nexus AI</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Private document vault — ask questions, get cited answers.
            </p>
          </div>
          {userEmail && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 truncate max-w-[180px]" title={userEmail}>
                {userEmail}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/sign-in";
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-zinc-400 hover:bg-[var(--muted)] hover:text-zinc-200 transition-colors flex items-center gap-1.5"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-4 py-6 min-h-0 w-full">
          <div className="mb-4 shrink-0">
            <UploadZone onFileSelect={handleUpload} disabled={ingesting} />
          </div>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-xs text-zinc-500">Documents</div>
              <div className="text-xl font-semibold">{usage?.documents ?? 0}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-xs text-zinc-500">Chat sessions</div>
              <div className="text-xl font-semibold">{usage?.chatSessions ?? 0}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-xs text-zinc-500">Recent tokens</div>
              <div className="text-xl font-semibold">{usage?.recentTokens ?? 0}</div>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-200">Documents</span>
              <Button variant="secondary" size="sm" onClick={fetchDocuments} type="button">
                Refresh
              </Button>
            </div>
            {documentList.length === 0 ? (
              <div className="px-4 py-6 text-sm text-zinc-500">No documents uploaded yet.</div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {documentList.map((doc) => (
                  <li key={doc.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{doc.fileName}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {doc.status}
                        {doc.chunksCount ? ` · ${doc.chunksCount} chunks` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setViewerDoc(doc);
                          setViewerOpen(true);
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={doc.status === "PROCESSING"}
                        onClick={async () => {
                          const ok = confirm(`Delete ${doc.fileName}? This will remove its vectors too.`);
                          if (!ok) return;
                          const res = await fetch("/api/rag/documents", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ documentId: doc.id }),
                          });
                          if (res.ok) {
                            toast.success("Document deleted.");
                            fetchDocuments();
                            fetchUsage();
                          } else {
                            const err = await res.json().catch(() => ({ error: "Delete failed." }));
                            toast.error(err.error ?? "Delete failed.");
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
            <span className="text-xs font-medium text-zinc-500">Sources:</span>
            <div className="w-full sm:w-[320px]">
              <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
                <SelectTrigger>
                  <SelectValue placeholder="All documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All documents</SelectItem>
                  {documentList.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.fileName}
                      {doc.status === "PROCESSING" && " (processing...)"} 
                      {doc.status === "FAILED" && " (failed)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDocumentId !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)]/20 px-2 py-0.5 text-xs text-[var(--accent)]">
                <FileText className="h-3 w-3" />
                {documentList.find((d) => d.id === selectedDocumentId)?.fileName ?? "Selected document"}
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

          {viewerDoc && (
            <DocumentViewerDialog
              open={viewerOpen}
              onOpenChange={(open) => {
                setViewerOpen(open);
                if (!open) setViewerDoc(null);
              }}
              title={viewerDoc.fileName}
              url={viewerDoc.fileUrl}
              mimeType={viewerDoc.mimeType}
            />
          )}
        </main>
      </div>
    </div>
  );
}

