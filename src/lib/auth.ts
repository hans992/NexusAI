import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

export function isAuthEnabled(): boolean {
  return typeof process.env.BETTER_AUTH_SECRET === "string" && process.env.BETTER_AUTH_SECRET.length > 0;
}

const resolvedBaseUrl =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const auth = isAuthEnabled()
  ? betterAuth({
      database: prismaAdapter(prisma, { provider: "postgresql" }),
      plugins: [nextCookies()],
      basePath: "/api/auth",
      baseURL: resolvedBaseUrl,
      secret: process.env.BETTER_AUTH_SECRET,
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        },
      },
    })
  : null;
