// The editor page's sign-in: off to Google with a one-time value this browser keeps (lib/editor.ts).
import { randomBytes } from "node:crypto";
import { googleUrl, signInReady, stateFor } from "@/lib/editor.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!signInReady()) return Response.redirect(`${origin}/editor`, 303);
  const nonce = randomBytes(18).toString("base64url");
  return new Response(null, { status: 303, headers: {
    location: googleUrl(origin, stateFor(nonce)),
    "set-cookie": `ck_editor_state=${nonce}; Path=/api/editor; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  } });
}
