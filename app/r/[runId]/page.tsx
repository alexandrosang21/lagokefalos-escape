import { RATE } from "@/game/engine";
import { islandName } from "@/game/islands";
import { el } from "@/game/strings.el";
import { db, isDbConfigured } from "@/lib/db";
import { getRankForEuros } from "@/lib/rank";
import { runs } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getRun(runId: string) {
  if (!isDbConfigured) return null;
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  return run ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<Metadata> {
  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) return { title: "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη" };
  const title = `€${run.euros.toFixed(2)} από το κράτος 🐡 — ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη`;
  const description = `${run.haulKg.toFixed(1)}kg λαγοκέφαλος στα €${RATE}/κιλό. Μπορείς να το περάσεις;`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/og/${runId}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/og/${runId}`],
    },
  };
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) notFound();

  const island = islandName(el.islands, run.islandIdx);
  const rank = await getRankForEuros(run.euros);

  return (
    <div className="overlay" style={{ position: "fixed" }}>
      <div className="eyebrow">Επίσημη Απόδειξη Επικήρυξης</div>
      <div className="euro-big">€{run.euros.toFixed(2)}</div>
      <div className="stat">
        {run.haulKg.toFixed(1)} kg λαγοκέφαλος
        {run.displayName ? ` — ${run.displayName}` : ""}
      </div>
      <div className="stat">Έφτασε μέχρι: {island}</div>
      <div className="stat">🏅 Θέση #{rank} στο Παγκόσμιο Ταμείο</div>
      <Link href="/" className="btn" style={{ textDecoration: "none" }}>
        Μπορείς να το περάσεις; ΠΑΙΞΕ
      </Link>
      <div className="tiny">*Παρωδία. Ο λαγοκέφαλος δεν τρώγεται.</div>
    </div>
  );
}
