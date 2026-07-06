import { createHmac, timingSafeEqual } from "crypto";

// HMAC-signed "the game started at T" receipt. The client can't forge or
// backdate it, so the server gets its own measurement of run duration and a
// claimed 10-hour / 10-million-euro run submitted 20 seconds after start dies
// at validation. Set APP_SECRET in production (any long random string).
const SECRET = process.env.APP_SECRET ?? "insecure-dev-secret";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function issueRunToken(playerId: string, now = Date.now()): string {
  const payload = `${playerId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

// Returns the server-side start timestamp (ms) or null if invalid.
export function verifyRunToken(token: string, playerId: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [pid, ts, sig] = parts;
  if (pid !== playerId) return null;
  const expected = sign(`${pid}.${ts}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const startedAt = Number(ts);
  if (!Number.isFinite(startedAt)) return null;
  const age = Date.now() - startedAt;
  if (age < 0 || age > 24 * 60 * 60 * 1000) return null; // future or older than a day
  return startedAt;
}
