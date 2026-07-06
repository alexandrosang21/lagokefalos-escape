import { cookies } from "next/headers";

const COOKIE = "lago_pid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Anonymous device identity: an httpOnly cookie, never shown to the user.
// It's what makes "best run per player", self-highlighting and rate limits
// work without any login.
export async function getPlayerId(): Promise<string | null> {
  const jar = await cookies();
  const pid = jar.get(COOKIE)?.value;
  return pid && UUID_RE.test(pid) ? pid : null;
}

export async function getOrCreatePlayerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;
  const pid = crypto.randomUUID();
  jar.set(COOKIE, pid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return pid;
}
