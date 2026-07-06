import { isDbConfigured } from "@/lib/db";
import { getOrCreatePlayerId } from "@/lib/player";
import { issueRunToken } from "@/lib/run-token";
import { NextResponse } from "next/server";

// Called when a game starts: sets the anonymous player cookie and hands out a
// signed start-time token, which /api/runs later uses to measure the real
// duration server-side.
export async function POST() {
  if (!isDbConfigured) {
    return NextResponse.json({ offline: true }, { status: 503 });
  }
  const pid = await getOrCreatePlayerId();
  return NextResponse.json({ token: issueRunToken(pid) });
}
