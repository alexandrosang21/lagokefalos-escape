import { db } from "./db";
import { runs } from "./schema";
import { countDistinct, gt } from "drizzle-orm";

// Rank = 1 + number of players whose best run beats this score.
// Always computed server-side from the runs table, never trusted from clients.
export async function getRankForEuros(euros: number): Promise<number> {
  const [row] = await db
    .select({ better: countDistinct(runs.playerId) })
    .from(runs)
    .where(gt(runs.euros, euros));
  return (row?.better ?? 0) + 1;
}
