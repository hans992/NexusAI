"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/server/db/supabase-browser";

export default function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handlePasswordSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace(callbackUrl);
  };

  const handleMagicLink = async () => {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
      },
    });
    setLoading(false);
    setMessage(error ? error.message : "Magic link sent. Check your inbox.");
  };

  useEffect(() => {
    supabase.auth.getSession().then((result: { data: { session: unknown | null } }) => {
      const { data } = result;
      if (data.session) {
        router.replace(callbackUrl);
      }
    });
  }, [callbackUrl, router, supabase.auth]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-center text-[var(--foreground)] mb-2">Nexus AI</h1>
        <p className="text-sm text-zinc-500 text-center mb-6">Sign in with password or magic link</p>
        <form onSubmit={handlePasswordSignIn} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
        <button
          type="button"
          disabled={loading || !email}
          onClick={handleMagicLink}
          className="w-full mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Send magic link
        </button>
        {message && <p className="text-xs text-zinc-400 mt-3">{message}</p>}
      </div>
    </div>
  );
}

