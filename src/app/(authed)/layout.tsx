import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/server/auth/session";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/sign-in?callbackUrl=/");
  }

  return children;
}

