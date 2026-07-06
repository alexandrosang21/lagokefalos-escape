import { RATE } from "@/game/engine";
import { db, isDbConfigured } from "@/lib/db";
import { getPlayerId } from "@/lib/player";
import { getRankForEuros } from "@/lib/rank";
import { verifyRunToken } from "@/lib/run-token";
import { runs } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const MAX_DURATION_S = 1800; // longer than any human run of this game
const MAX_HAUL_KG = 2000; // absolute ceiling regardless of duration
const MAX_KG_PER_S = 8; // sustained freddo-smashing with ×2 net peaks below this
const MAX_METERS_PER_S = 40; // top speed is ~38 m/s with freddo
const MIN_POST_INTERVAL_MS = 5000;

function sanitizeName(name: unknown): string {
  return String(name ?? "")
    .replace(/[<>"'\\/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14);
}

// Distance needed to have reached island i (checkpoints at 400m + 80m·index).
function distanceForIsland(i: number): number {
  return 400 * i + 40 * i * (i - 1);
}

export async function POST(req: NextRequest) {
  if (!isDbConfigured) {
    return NextResponse.json({ offline: true }, { status: 503 });
  }
  const playerId = await getPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "no_player" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // The token proves when this run actually started, so duration is measured
  // by the server, not claimed by the client.
  const startedAt = verifyRunToken(String(body.token ?? ""), playerId);
  if (startedAt === null) {
    return NextResponse.json({ error: "bad_token" }, { status: 401 });
  }
  const serverElapsedS = (Date.now() - startedAt) / 1000 + 3; // small grace for latency

  const haulKg = Number(body.haulKg);
  const islandIdx = Number(body.islandIdx);
  const clientDurationS = Number(body.durationS);
  const daily = Boolean(body.daily);
  const displayName = sanitizeName(body.name);

  if (
    !Number.isFinite(haulKg) ||
    !Number.isFinite(islandIdx) ||
    !Number.isFinite(clientDurationS) ||
    !Number.isInteger(islandIdx)
  ) {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const durationS = Math.round(Math.min(clientDurationS, serverElapsedS));
  if (durationS < 3 || durationS > MAX_DURATION_S) {
    return NextResponse.json({ error: "implausible_duration" }, { status: 400 });
  }
  if (haulKg < 0 || haulKg > Math.min(40 + durationS * MAX_KG_PER_S, MAX_HAUL_KG)) {
    return NextResponse.json({ error: "implausible_haul" }, { status: 400 });
  }
  if (
    islandIdx < 0 ||
    islandIdx > 999 ||
    distanceForIsland(islandIdx) > durationS * MAX_METERS_PER_S
  ) {
    return NextResponse.json({ error: "implausible_island" }, { status: 400 });
  }

  // Rate limit via the DB so it holds across serverless instances.
  const [lastRun] = await db
    .select({ createdAt: runs.createdAt })
    .from(runs)
    .where(eq(runs.playerId, playerId))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  if (lastRun && Date.now() - lastRun.createdAt.getTime() < MIN_POST_INTERVAL_MS) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const euros = Math.round(haulKg * RATE * 100) / 100; // never trusted from the client

  const [row] = await db
    .insert(runs)
    .values({ playerId, displayName, haulKg, euros, islandIdx, durationS, daily })
    .returning({ id: runs.id });

  const rank = await getRankForEuros(euros);
  return NextResponse.json({ id: row.id, rank });
}

// Lets the player attach the name typed on the receipt to their own runs.
export async function PATCH(req: NextRequest) {
  if (!isDbConfigured) {
    return NextResponse.json({ offline: true }, { status: 503 });
  }
  const playerId = await getPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "no_player" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  const displayName = sanitizeName(body.name);
  if (!id || !displayName) {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  await db
    .update(runs)
    .set({ displayName })
    .where(and(eq(runs.id, id), eq(runs.playerId, playerId)));

  return NextResponse.json({ ok: true });
}
