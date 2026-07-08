import { hashString, mulberry32 } from "./rng";
import type { IslandTheme } from "./types";

// Single source of truth for the island chain: names (both languages) and the
// coastline art theme drawn during the pass-by. The chain loops (modulo) once
// exhausted — nobody has ever jet-skied past Salamina anyway.
export interface IslandDef {
  el: string;
  en: string;
  theme: IslandTheme;
}

export const ISLANDS: IslandDef[] = [
  // Crete + Cyclades (the bounty pilot area — spec §1)
  { el: "ΚΡΗΤΗ", en: "CRETE", theme: "port" },
  { el: "ΣΑΝΤΟΡΙΝΗ", en: "SANTORINI", theme: "volcanic" },
  { el: "ΙΟΣ", en: "IOS", theme: "cycladic" },
  { el: "ΠΑΡΟΣ", en: "PAROS", theme: "windmill" },
  { el: "ΝΑΞΟΣ", en: "NAXOS", theme: "port" },
  { el: "ΜΥΚΟΝΟΣ", en: "MYKONOS", theme: "windmill" },
  { el: "ΤΗΝΟΣ", en: "TINOS", theme: "cycladic" },
  { el: "ΑΝΔΡΟΣ", en: "ANDROS", theme: "green" },
  { el: "ΣΥΡΟΣ", en: "SYROS", theme: "port" },
  { el: "ΜΗΛΟΣ", en: "MILOS", theme: "volcanic" },
  { el: "ΣΙΦΝΟΣ", en: "SIFNOS", theme: "cycladic" },
  { el: "ΣΕΡΙΦΟΣ", en: "SERIFOS", theme: "cycladic" },
  { el: "ΚΥΘΝΟΣ", en: "KYTHNOS", theme: "beach" },
  { el: "ΚΕΑ", en: "KEA", theme: "green" },
  { el: "ΦΟΛΕΓΑΝΔΡΟΣ", en: "FOLEGANDROS", theme: "cycladic" },
  { el: "ΣΙΚΙΝΟΣ", en: "SIKINOS", theme: "cycladic" },
  { el: "ΑΝΑΦΗ", en: "ANAFI", theme: "lighthouse" },
  { el: "ΑΜΟΡΓΟΣ", en: "AMORGOS", theme: "cycladic" },
  { el: "ΚΟΥΦΟΝΗΣΙΑ", en: "KOUFONISIA", theme: "beach" },
  { el: "ΔΟΝΟΥΣΑ", en: "DONOUSA", theme: "beach" },
  // Dodecanese
  { el: "ΑΣΤΥΠΑΛΑΙΑ", en: "ASTYPALEA", theme: "windmill" },
  { el: "ΚΩΣ", en: "KOS", theme: "beach" },
  { el: "ΡΟΔΟΣ", en: "RHODES", theme: "port" },
  { el: "ΚΑΡΠΑΘΟΣ", en: "KARPATHOS", theme: "green" },
  { el: "ΣΥΜΗ", en: "SYMI", theme: "port" },
  { el: "ΠΑΤΜΟΣ", en: "PATMOS", theme: "cycladic" },
  { el: "ΚΑΛΥΜΝΟΣ", en: "KALYMNOS", theme: "port" },
  // NE Aegean
  { el: "ΙΚΑΡΙΑ", en: "IKARIA", theme: "green" },
  { el: "ΣΑΜΟΣ", en: "SAMOS", theme: "green" },
  { el: "ΧΙΟΣ", en: "CHIOS", theme: "port" },
  { el: "ΛΕΣΒΟΣ", en: "LESVOS", theme: "port" },
  { el: "ΛΗΜΝΟΣ", en: "LIMNOS", theme: "windmill" },
  { el: "ΘΑΣΟΣ", en: "THASOS", theme: "green" },
  { el: "ΣΑΜΟΘΡΑΚΗ", en: "SAMOTHRAKI", theme: "lighthouse" },
  // Sporades
  { el: "ΣΚΙΑΘΟΣ", en: "SKIATHOS", theme: "beach" },
  { el: "ΣΚΟΠΕΛΟΣ", en: "SKOPELOS", theme: "green" },
  { el: "ΑΛΟΝΝΗΣΟΣ", en: "ALONISSOS", theme: "green" },
  { el: "ΣΚΥΡΟΣ", en: "SKYROS", theme: "cycladic" },
  // Ionian
  { el: "ΚΕΡΚΥΡΑ", en: "CORFU", theme: "port" },
  { el: "ΠΑΞΟΙ", en: "PAXOI", theme: "green" },
  { el: "ΛΕΥΚΑΔΑ", en: "LEFKADA", theme: "beach" },
  { el: "ΙΘΑΚΗ", en: "ITHACA", theme: "green" },
  { el: "ΚΕΦΑΛΟΝΙΑ", en: "KEFALONIA", theme: "green" },
  { el: "ΖΑΚΥΝΘΟΣ", en: "ZAKYNTHOS", theme: "beach" },
  { el: "ΚΥΘΗΡΑ", en: "KYTHIRA", theme: "lighthouse" },
  { el: "ΓΑΥΔΟΣ", en: "GAVDOS", theme: "lighthouse" },
  // Saronic finale
  { el: "ΑΙΓΙΝΑ", en: "AEGINA", theme: "port" },
  { el: "ΥΔΡΑ", en: "HYDRA", theme: "port" },
  { el: "ΣΠΕΤΣΕΣ", en: "SPETSES", theme: "port" },
  { el: "ΣΑΛΑΜΙΝΑ", en: "SALAMINA", theme: "beach" },
];

export function islandTheme(idx: number): IslandTheme {
  return ISLANDS[idx % ISLANDS.length].theme;
}

// The chain loops instead of clamping on the last island.
export function islandName(names: string[], idx: number): string {
  return names[idx % names.length];
}

// Default visiting order (Crete-first tour) used by free-play.
export const IDENTITY_ORDER = ISLANDS.map((_, i) => i);

// A deterministic per-day permutation of the island indices: everyone playing
// the daily challenge on a given UTC day gets the same fresh route, and it's a
// different route each day. Own seed namespace so it doesn't correlate with the
// daily spawn pattern. Purely cosmetic (names + coastline art) — difficulty and
// scoring key off distance, not island.
export function dailyIslandOrder(seedStr: string): number[] {
  const rng = mulberry32(hashString("lago-islands:" + seedStr));
  const order = IDENTITY_ORDER.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
