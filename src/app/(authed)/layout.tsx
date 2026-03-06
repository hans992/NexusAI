import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth";
import { getSessionFromRequestHeaders } from "@/lib/auth-server";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isAuthEnabled()) {
    const session = await getSessionFromRequestHeaders(await headers());
    if (!session?.user) {
      redirect("/sign-in?callbackUrl=/");
    }
  }

  return children;
}

