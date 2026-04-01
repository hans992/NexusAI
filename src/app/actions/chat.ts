"use server";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { createServerSupabaseClient } from "@/server/db/supabase-server";

export async function createSession(title = "New chat") {
  const user = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: user.id, title: title.slice(0, 200) })
    .select("id, title, updated_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed creating session.");
  return { id: data.id, title: data.title, updatedAt: data.updated_at };
}

export async function getSessions() {
  const user = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ id: s.id, title: s.title, updatedAt: s.updated_at }));
}

export async function getSession(sessionId: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const [{ data: session }, { data: messages }] = await Promise.all([
    supabase.from("chat_sessions").select("id, title").eq("id", sessionId).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("chat_messages")
      .select("id, role, content")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);
  if (!session) return null;
  return { ...session, messages: messages ?? [] };
}

export async function saveMessages(
  sessionId: string,
  messages: { role: string; content: string }[]
) {
  const user = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session) return;

  await supabase.from("chat_messages").delete().eq("session_id", sessionId).eq("user_id", user.id);
  await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId).eq("user_id", user.id);
  if (messages.length === 0) return;
  await supabase.from("chat_messages").insert(
    messages.map((m) => ({
      session_id: sessionId,
      user_id: user.id,
      role: m.role,
      content: m.content,
    }))
  );
}

export async function updateSessionTitle(sessionId: string, title: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ title: title.slice(0, 200) })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .select("id, title, updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id, title: data.title, updatedAt: data.updated_at } : null;
}

export async function deleteSession(sessionId: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  await supabase.from("chat_sessions").delete().eq("id", sessionId).eq("user_id", user.id);
}
