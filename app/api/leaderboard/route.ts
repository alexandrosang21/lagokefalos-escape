import { db, isDbConfigured } from "@/lib/db";
import { getPlayerId } from "@/lib/player";
import { runs } from "@/lib/schema";
import { desc, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isDbConfigured) {
    return NextResponse.json({ offline: true }, { status: 503 });
  }

  const period = req.nextUrl.searchParams.get("period") === "daily" ? "daily" : "all";
  const me = await getPlayerId();

  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  const base = db
    .select({
      id: runs.id,
      playerId: runs.playerId,
      name: runs.displayName,
      euros: runs.euros,
      haulKg: runs.haulKg,
      islandIdx: runs.islandIdx,
    })
    .from(runs)
    .$dynamic();

  const filtered = period === "daily" ? base.where(gte(runs.createdAt, startOfUtcDay)) : base;
  const rows = await filtered.orderBy(desc(runs.euros)).limit(50);

  // Best run per player only; playerId stays server-side (only a "me" flag
  // leaves the API).
  const seen = new Set<string>();
  const top = [];
  for (const r of rows) {
    if (seen.has(r.playerId)) continue;
    seen.add(r.playerId);
    top.push({
      id: r.id,
      name: r.name || "Ανώνυμος",
      euros: r.euros,
      haulKg: r.haulKg,
      islandIdx: r.islandIdx,
      me: me !== null && r.playerId === me,
    });
    if (top.length >= 10) break;
  }

  return NextResponse.json({ period, rows: top });
}
