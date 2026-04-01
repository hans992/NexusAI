import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { createServerSupabaseClient } from "@/server/db/supabase-server";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const supabase = await createServerSupabaseClient();

    const [{ count: docsCount }, { count: chatsCount }, { data: usageRows }] = await Promise.all([
      supabase.from("documents").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("chat_sessions").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("usage_events")
        .select("total_tokens")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const totalTokens = (usageRows ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0);

    return NextResponse.json({
      documents: docsCount ?? 0,
      chatSessions: chatsCount ?? 0,
      recentTokens: totalTokens,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load usage.";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

