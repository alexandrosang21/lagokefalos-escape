import { gt, sql } from "drizzle-orm";
import { db } from "./db";
import { runs } from "./schema";

// Rank = 1 + number of *players* whose best run beats this score.
// Computed over each player's best (GROUP BY), not raw rows, so a single
// grinder with many runs counts once — and it stays correct at any table size.
export async function getRankForEuros(euros: number): Promise<number> {
  const perPlayerBest = db
    .select({
      playerId: runs.playerId,
      best: sql<number>`max(${runs.euros})`.as("best"),
    })
    .from(runs)
    .groupBy(runs.playerId)
    .as("pp");

  const [row] = await db
    .select({ better: sql<number>`count(*)` })
    .from(perPlayerBest)
    .where(gt(perPlayerBest.best, euros));

  return Number(row?.better ?? 0) + 1;
}
