// Roguelite meta-progression. Every run banks a share of its euros into a
// persistent per-device wallet (Το Ταμείο σου); that wallet buys permanent
// upgrades. Stored in localStorage only — no login. IMPORTANT: money upgrades
// boost what you BANK, never the leaderboard score, so progression can't buy
// leaderboard rank (the board stays best-single-run €).

export type UpgradeId =
  | "wideNet"
  | "matiStart"
  | "freddoStart"
  | "subsidy"
  | "frappeFreq"
  | "hull";

export interface UpgradeDef {
  id: UpgradeId;
  emoji: string;
  el: string;
  en: string;
  elDesc: string;
  enDesc: string;
  costs: number[]; // one entry per level (single entry = one-time unlock)
}

// Smooth geometric curve: the first buy lands in ~1–2 runs (early dopamine),
// then each next-cheapest step is ~1.2–2.4× the last, up to the endgame chase
// (6 hearts). Listed cheap→expensive. Top runs bank ~€20k. Tune here.
export const UPGRADES: UpgradeDef[] = [
  {
    id: "wideNet",
    emoji: "🕸",
    el: "Πλατύ Δίχτυ",
    en: "Wide Net",
    elDesc: "Πιάνεις τα ψάρια πιο εύκολα (μεγαλύτερη εμβέλεια)",
    enDesc: "Catch fish more easily (wider reach)",
    costs: [12000],
  },
  {
    id: "subsidy",
    emoji: "🐐",
    el: "Επιδότηση ΟΠΕΚΕΠΕ",
    en: "OPEKEPE Subsidy",
    elDesc: "+15% λεφτά στο Ταμείο ανά επίπεδο (όχι στο σκορ)",
    enDesc: "+15% money banked per level (not to score)",
    costs: [25000, 70000, 180000],
  },
  {
    id: "matiStart",
    emoji: "🧿",
    el: "Φυλαχτό Μάτι",
    en: "Evil-Eye Charm",
    elDesc: "Ξεκίνα με το μάτι — μπλοκάρει το πρώτο δάγκωμα",
    enDesc: "Start with the charm — blocks your first bite",
    costs: [45000],
  },
  {
    id: "freddoStart",
    emoji: "☕",
    el: "Πρωινό Freddo",
    en: "Morning Freddo",
    elDesc: "Ξεκίνα κάθε βόλτα με 6″ freddo (άτρωτος)",
    enDesc: "Start every run with 6s of freddo (invincible)",
    costs: [90000],
  },
  {
    id: "frappeFreq",
    emoji: "🥤",
    el: "Φραπές Παντού",
    en: "Frappé Everywhere",
    elDesc: "Ο σπάνιος φραπές εμφανίζεται πιο συχνά",
    enDesc: "The rare frappé shows up more often",
    costs: [160000, 400000],
  },
  {
    id: "hull",
    emoji: "🛶",
    el: "Ενισχυμένη Γάστρα",
    en: "Reinforced Hull",
    elDesc: "+1 ζωή ανά επίπεδο — έως 6 καρδιές",
    enDesc: "+1 life per level — up to 6 hearts",
    costs: [220000, 550000, 1300000],
  },
];

const WALLET_KEY = "lago-wallet";
const LEVELS_KEY = "lago-upgrades";

export function getWallet(): number {
  try {
    return Math.max(0, parseFloat(localStorage.getItem(WALLET_KEY) ?? "0") || 0);
  } catch {
    return 0;
  }
}

function setWallet(n: number) {
  try {
    localStorage.setItem(WALLET_KEY, String(Math.max(0, Math.round(n * 100) / 100)));
  } catch {}
}

export function bank(amount: number): number {
  const next = getWallet() + Math.max(0, amount);
  setWallet(next);
  return next;
}

export function getLevels(): Partial<Record<UpgradeId, number>> {
  try {
    return JSON.parse(localStorage.getItem(LEVELS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setLevels(levels: Partial<Record<UpgradeId, number>>) {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(levels));
  } catch {}
}

export function levelOf(id: UpgradeId): number {
  return getLevels()[id] ?? 0;
}

// Next cost for an upgrade, or null if it's maxed out.
export function nextCost(def: UpgradeDef): number | null {
  const lvl = levelOf(def.id);
  return lvl < def.costs.length ? def.costs[lvl] : null;
}

// Try to buy the next level; deducts from the wallet on success.
export function buy(def: UpgradeDef): boolean {
  const cost = nextCost(def);
  if (cost === null || getWallet() < cost) return false;
  setWallet(getWallet() - cost);
  const levels = getLevels();
  levels[def.id] = (levels[def.id] ?? 0) + 1;
  setLevels(levels);
  return true;
}

export interface UpgradeEffects {
  extraLives: number;
  startFreddo: boolean;
  startMati: boolean;
  catchAssist: number; // extra px on the catch-assist reach
  subsidyMult: number; // banking multiplier (>= 1)
  frappeBonus: number; // extra frappé spawn probability (0..)
}

// Resolve owned levels into concrete gameplay/banking effects.
export function effects(): UpgradeEffects {
  const lv = getLevels();
  return {
    extraLives: lv.hull ?? 0, // tiered: up to +3 hearts
    startFreddo: !!lv.freddoStart,
    startMati: !!lv.matiStart,
    catchAssist: lv.wideNet ? 26 : 0,
    subsidyMult: 1 + 0.15 * (lv.subsidy ?? 0),
    frappeBonus: 0.1 * (lv.frappeFreq ?? 0),
  };
}
