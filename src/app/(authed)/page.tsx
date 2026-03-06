"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UploadDropzone } from "@/lib/uploadthing";
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
} from "@/app/actions/chat";
import { createDocumentAndIngest } from "@/app/actions/documents";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { authClient } from "@/lib/auth-client";
import { FileText, MessageSquarePlus, Trash2, LogOut } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteDocument } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { DocumentViewerDialog } from "@/components/documents/DocumentViewerDialog";

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

export default function HomePage() {
  const [documentList, setDocumentList] = useState<DocumentListItem[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<DocumentListItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof getSessions>>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadedMessages, setLoadedMessages] = useState<{ id?: string; role: string; content: string }[]>([]);
  const loadingToastIdRef = useRef<string | number | null>(null);
  const { data: session } = authClient.useSession();

  const fetchDocuments = useCallback(() => {
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: DocumentListItem[]) => setDocumentList(Array.isArray(list) ? list : []))
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

  const handleUploadComplete = useCallback(
    async (res: { url: string; name: string; size: number; type?: string }[] | undefined) => {
      const file = res?.[0];
      if (!file?.url) {
        toast.error("Upload completed but no file URL received.");
        return;
      }
      if (ingesting) return;
      setIngesting(true);
      loadingToastIdRef.current = toast.loading("Processing document...");
      try {
        const result = await createDocumentAndIngest(
          file.url,
          file.name,
          file.size,
          file.type ?? "application/octet-stream"
        );
        toast.dismiss(loadingToastIdRef.current ?? undefined);
        loadingToastIdRef.current = null;
        if (result.success) {
          toast.success(`Document added to vault (${result.chunksCount} chunks)`);
          fetchDocuments();
        } else {
          toast.error(result.error);
        }
      } catch (err) {
        toast.dismiss(loadingToastIdRef.current ?? undefined);
        loadingToastIdRef.current = null;
        toast.error(err instanceof Error ? err.message : "Ingestion failed.");
      } finally {
        setIngesting(false);
      }
    },
    [ingesting, fetchDocuments]
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
          {session?.user && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 truncate max-w-[140px]" title={session.user.email}>
                {session.user.email}
              </span>
              <button
                type="button"
                onClick={() => authClient.signOut()}
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
            <UploadDropzone
              endpoint="documentUploader"
              disabled={ingesting}
              onClientUploadComplete={handleUploadComplete}
              onUploadError={(err) => {
                toast.error(err?.message ?? "Upload failed.");
              }}
              content={{
                allowedContent: "PDF, TXT, MD up to 32MB",
              }}
            />
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
                          const res = await deleteDocument(doc.id);
                          if (res.success) {
                            toast.success("Document deleted.");
                            fetchDocuments();
                          } else {
                            toast.error(res.error);
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
              <Select value={selectedFile} onValueChange={setSelectedFile}>
                <SelectTrigger>
                  <SelectValue placeholder="All documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All documents</SelectItem>
                  {documentList.map((doc) => (
                    <SelectItem key={doc.id} value={doc.fileName}>
                      {doc.fileName}
                      {doc.status === "PROCESSING" && " (processing...)"} 
                      {doc.status === "FAILED" && " (failed)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

