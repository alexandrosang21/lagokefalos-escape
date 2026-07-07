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

  // Best run per player, in SQL: DISTINCT ON keeps one row per player (the
  // highest-euro one, per the inner ORDER BY). Doing this in the query instead
  // of deduping a top-50 slice in JS means one prolific player can't crowd
  // everyone else off the board — correct regardless of table size.
  let bestPerPlayer = db
    .selectDistinctOn([runs.playerId], {
      id: runs.id,
      playerId: runs.playerId,
      name: runs.displayName,
      euros: runs.euros,
      haulKg: runs.haulKg,
      islandIdx: runs.islandIdx,
    })
    .from(runs)
    .$dynamic();

  if (period === "daily") {
    bestPerPlayer = bestPerPlayer.where(gte(runs.createdAt, startOfUtcDay));
  }

  const best = bestPerPlayer.orderBy(runs.playerId, desc(runs.euros)).as("best");

  const rows = await db.select().from(best).orderBy(desc(best.euros)).limit(10);

  const top = rows.map((r) => ({
    id: r.id,
    name: r.name || "Ανώνυμος",
    euros: r.euros,
    haulKg: r.haulKg,
    islandIdx: r.islandIdx,
    me: me !== null && r.playerId === me, // playerId stays server-side; only a flag leaves
  }));

  return NextResponse.json({ period, rows: top });
}
