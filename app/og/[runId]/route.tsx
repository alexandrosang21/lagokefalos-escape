import { el } from "@/game/strings.el";
import { db, isDbConfigured } from "@/lib/db";
import { loadGreekFont, OG_SIZE, ogCard } from "@/lib/og";
import { getRankForEuros } from "@/lib/rank";
import { runs } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  if (!isDbConfigured) return new Response("not found", { status: 404 });
  const { runId } = await params;
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) return new Response("not found", { status: 404 });

  const island = el.islands[Math.min(run.islandIdx, el.islands.length - 1)];
  const rank = await getRankForEuros(run.euros);
  const eyebrow = "ΕΠΙΣΗΜΗ ΑΠΟΔΕΙΞΗ ΕΠΙΚΗΡΥΞΗΣ";
  const big = `€${run.euros.toFixed(2)}`;
  const line1 = `${run.haulKg.toFixed(1)} kg λαγοκέφαλος ${
    run.displayName ? "από: " + run.displayName : ""
  }`.trim();
  const line2 = `Θέση #${rank} · Έφτασε μέχρι: ${island}`;
  const footer = "ΛΑΓΟΚΕΦΑΛΟΣ: Η ΕΠΙΚΗΡΥΞΗ · €5,33/kg";

  const font = await loadGreekFont(eyebrow + big + line1 + line2 + footer);

  return new ImageResponse(ogCard({ eyebrow, big, line1, line2, footer }), {
    ...OG_SIZE,
    fonts: font
      ? [{ name: "NotoSans", data: font, weight: 900 as const, style: "normal" as const }]
      : undefined,
  });
}
