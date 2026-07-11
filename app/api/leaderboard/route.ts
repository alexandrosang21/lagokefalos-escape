import { db, isDbConfigured } from "@/lib/db";
import { getPlayerId } from "@/lib/player";
import { runs } from "@/lib/schema";
import { and, desc, eq, gt, gte, sql, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  name: string;
  euros: number;
  haulKg: number;
  islandIdx: number;
  hard: boolean;
  me: boolean;
  rank: number;
}

export async function GET(req: NextRequest) {
  if (!isDbConfigured) {
    return NextResponse.json({ offline: true }, { status: 503 });
  }

  const period = req.nextUrl.searchParams.get("period") === "daily" ? "daily" : "all";
  const me = await getPlayerId();

  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  // period filter reused by every query below (leaderboard + the "you" row)
  const periodWhere: SQL | undefined =
    period === "daily" ? gte(runs.createdAt, startOfUtcDay) : undefined;

  // Best run per player, in SQL: DISTINCT ON keeps one row per player (the
  // highest-euro one, per the inner ORDER BY). Doing this in the query instead
  // of deduping a top-50 slice in JS means one prolific player can't crowd
  // everyone else off the board — correct regardless of table size.
  const best = db
    .selectDistinctOn([runs.playerId], {
      id: runs.id,
      playerId: runs.playerId,
      name: runs.displayName,
      euros: runs.euros,
      haulKg: runs.haulKg,
      islandIdx: runs.islandIdx,
      hard: runs.hard,
    })
    .from(runs)
    .$dynamic()
    .where(periodWhere)
    .orderBy(runs.playerId, desc(runs.euros))
    .as("best");

  const rows = await db.select().from(best).orderBy(desc(best.euros)).limit(10);

  const top: Row[] = rows.map((r, i) => ({
    id: r.id,
    name: r.name || "Ανώνυμος",
    euros: r.euros,
    haulKg: r.haulKg,
    islandIdx: r.islandIdx,
    hard: r.hard,
    me: me !== null && r.playerId === me,
    rank: i + 1,
  }));

  // If the player isn't already visible in the top 10, compute their own best
  // (for this period) and its rank, so they always see where they stand — e.g.
  // a global top-10 player who has a weak day still finds themselves on today's
  // board instead of seeming to vanish.
  let you: Row | null = null;
  if (me && !top.some((r) => r.me)) {
    const [mine] = await db
      .select({
        id: runs.id,
        name: runs.displayName,
        euros: runs.euros,
        haulKg: runs.haulKg,
        islandIdx: runs.islandIdx,
        hard: runs.hard,
      })
      .from(runs)
      .where(and(eq(runs.playerId, me), ...(periodWhere ? [periodWhere] : [])))
      .orderBy(desc(runs.euros))
      .limit(1);

    if (mine) {
      // rank = 1 + number of distinct players whose best beats mine
      const perPlayerBest = db
        .select({ playerId: runs.playerId, b: sql<number>`max(${runs.euros})`.as("b") })
        .from(runs)
        .$dynamic()
        .where(periodWhere)
        .groupBy(runs.playerId)
        .as("pp");
      const [cnt] = await db
        .select({ better: sql<number>`count(*)` })
        .from(perPlayerBest)
        .where(gt(perPlayerBest.b, mine.euros));
      you = {
        id: mine.id,
        name: mine.name || "Ανώνυμος",
        euros: mine.euros,
        haulKg: mine.haulKg,
        islandIdx: mine.islandIdx,
        hard: mine.hard,
        me: true,
        rank: Number(cnt?.better ?? 0) + 1,
      };
    }
  }

  return NextResponse.json({ period, rows: top, you });
}
