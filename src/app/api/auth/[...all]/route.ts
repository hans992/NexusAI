import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

function disabled() {
  return new Response(JSON.stringify({ error: "Auth is not configured." }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
}

export const { GET, POST, PATCH, PUT, DELETE } = auth ? toNextJsHandler(auth) : {
  GET: disabled,
  POST: disabled,
  PATCH: disabled,
  PUT: disabled,
  DELETE: disabled,
};
