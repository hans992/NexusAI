import crypto from "crypto";

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const prefix = raw.slice(0, 10);
  const plaintext = `nxa_${raw}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

