export type PowerType = "freddo" | "souvlaki" | "net" | "mati" | "magnet" | "frappe";

export interface Fish {
  l: number;
  x: number;
  y: number;
  danger: boolean;
  kg: number;
  r: number;
  flap: number;
  drift: number;
}

// The ΜΕΓΑΣ ΛΑΓΟΚΕΦΑΛΟΣ — appears every 5th island. It hovers at the top,
// telegraphs a lane, lunges down it, then swims back up for the next pass.
export interface Boss {
  x: number;
  y: number;
  r: number;
  targetLane: number;
  state: "enter" | "telegraph" | "lunge" | "retreat";
  t: number; // countdown within the current state (telegraph flash)
  lungesLeft: number;
}

export interface Power {
  type: PowerType;
  x: number;
  y: number;
}

export interface Popup {
  x: number;
  y: number;
  txt: string;
  col: string;
  t: number;
}

export interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

export type IslandTheme =
  | "cycladic"
  | "volcanic"
  | "green"
  | "port"
  | "windmill"
  | "beach"
  | "lighthouse";

export interface Land {
  side: 1 | -1;
  y: number;
  len: number;
  seed: number;
  theme: IslandTheme;
}

export interface Quip {
  txt: string;
}

export interface GameStrings {
  islands: string[];
  deaths: string[];
  biteQuips: string[];
  idleQuips: string[];
  hud: {
    rate: string; // "€5,33/kg"
    invincible: string;
    hintTouch: string;
    hintKeys: string;
  };
  popups: {
    caught: (kg: string, eur: string) => string;
    smashed: (kg: string, eur: string) => string;
    speedUp: string;
    freddo: string;
    souvlakiLife: string;
    souvlakiFull: string;
    net: string;
    mati: string;
    matiSaved: string;
    magnet: string;
    frappe: (kg: string, eur: string) => string;
    frappeEmpty: string;
    combo: (mult: string) => string;
    bossWarn: string;
    bossDown: (kg: string, eur: string) => string;
    bossSmash: string;
  };
  ui: {
    presents: string;
    title: string;
    subtitle: string;
    bounty: string;
    howTo1: string;
    howTo2: string;
    howTo3: string;
    howToCollect: string;
    howToCollectSub: string;
    howToAvoid: string;
    howToAvoidSub: string;
    play: string;
    daily: string;
    bestPrefix: (eur: string, kg: string) => string;
    parody: string;
    receipt: string;
    haulLine: (kg: string) => string;
    islandLine: (island: string) => string;
    rankLine: (rank: number) => string;
    namePlaceholder: string;
    again: string;
    share: string;
    board: string;
    boardEmpty: string;
    boardOffline: string;
    boardLoading: string;
    shareText: (kg: string, eur: string) => string;
    shareCopied: string;
    shareManual: string;
    langToggle: string;
  };
}
