// Signing out of the editor page.
import { COOKIE } from "@/lib/editor.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return new Response(null, { status: 303, headers: {
    location: `${new URL(req.url).origin}/editor`,
    "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  } });
}
