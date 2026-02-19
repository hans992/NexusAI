import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus AI",
  description: "Private document vault — upload files, get instant cited answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased bg-[var(--background)] text-[var(--foreground)]">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
