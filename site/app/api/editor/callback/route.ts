// Back from Google: the one-time code swapped for the person's address; only the
// editors' addresses (CK_EDITORS) get the 30-day cookie (lib/editor.ts).
import { cookies } from "next/headers";
import { COOKIE, emailFrom, sessionAge, sessionFor, signInReady, stateOk } from "@/lib/editor.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (why?: string) => new Response(null, { status: 303, headers: [
    ["location", `${url.origin}/editor${why ? `?signin=${why}` : ""}`],
    ["set-cookie", "ck_editor_state=; Path=/api/editor; HttpOnly; Secure; SameSite=Lax; Max-Age=0"],
  ] });
  if (!signInReady()) return back("off");
  const nonce = (await cookies()).get("ck_editor_state")?.value ?? "";
  const code = url.searchParams.get("code");
  if (!code || !stateOk(url.searchParams.get("state") ?? "", nonce)) return back("again");
  const email = await emailFrom(url.origin, code).catch(() => null);
  if (!email) return back("refused");
  const res = back();
  res.headers.append("set-cookie", `${COOKIE}=${sessionFor(email)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionAge}`);
  return res;
}
