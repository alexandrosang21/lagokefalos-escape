import type { SfxName } from "./audio";
import { IDENTITY_ORDER, islandName, islandTheme } from "./islands";
import type {
  Boss,
  Fish,
  GameStrings,
  IslandTheme,
  Land,
  Obstacle,
  ObstacleKind,
  Popup,
  Power,
  PowerType,
  Quip,
  Splash,
} from "./types";

export const RATE = 5.33;
export const LANES = 3;

const POWER_TYPES: PowerType[] = ["freddo", "souvlaki", "net", "mati", "magnet"];

function vibrate(ms: number) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
}

// All tuned values (speeds, spawn rates, lane easing 13, freddo rules, quip
// timings) come straight from the playtested prototype — do not retune casually.
export class Engine {
  W: number;
  H: number;
  rng: () => number;
  strings: GameStrings;
  onGameOver: () => void;
  hint: string;
  onSfx?: (name: SfxName) => void;
  onMusic?: (theme: IslandTheme) => void;
  onMusicProgress?: (level: number) => void;
  // visiting order of ISLANDS indices (defaults to the Crete-first tour)
  order: number[] = IDENTITY_ORDER;
  // "Ερυθρά Θάλασσα" hard mode: brutal mechanics + red waters; euros ×1.5 so a
  // shorter, deadlier run stays competitive on the same boards.
  hard = false;
  euroMult = 1;

  running = false;
  tPrev = 0;
  speed = 210;
  dist = 0;
  lives = 3;
  haulKg = 0;
  islandIdx = 0;
  nextIslandAt = 400;
  elapsed = 0;

  lane = 1;
  laneX = 0;
  playerY = 0;
  inv = 0;
  wobble = 0;

  fishes: Fish[] = [];
  splashes: Splash[] = [];
  popups: Popup[] = [];
  powers: Power[] = [];
  obstacles: Obstacle[] = []; // hard-mode dodge-or-die hazards
  land: Land | null = null;
  // combo streak: catches build it, a bite resets it
  combo = 0;
  boss: Boss | null = null;
  bannerT = 0;
  bannerTxt = "";

  freddoT = 0;
  multT = 0;
  matiT = 0; // evil-eye charm: blocks the next bite while > 0
  magnetT = 0; // longline: bounty fish get reeled toward the player
  stunT = 0; // jellyfish sting: steering frozen while > 0
  powerT = 6;
  spawnT = 0;
  obstacleT = 0; // hard-mode hazard spawn timer

  quip: Quip | null = null;
  quipT = 0;
  idleQuipT = 5;

  constructor(opts: {
    W: number;
    H: number;
    rng: () => number;
    strings: GameStrings;
    onGameOver: () => void;
    hint?: string;
    onSfx?: (name: SfxName) => void;
    onMusic?: (theme: IslandTheme) => void;
    onMusicProgress?: (level: number) => void;
    islandOrder?: number[];
    hard?: boolean;
  }) {
    this.W = opts.W;
    this.H = opts.H;
    this.rng = opts.rng;
    this.strings = opts.strings;
    this.onGameOver = opts.onGameOver;
    this.hint = opts.hint ?? "";
    this.onSfx = opts.onSfx;
    this.onMusic = opts.onMusic;
    this.onMusicProgress = opts.onMusicProgress;
    this.order = opts.islandOrder ?? IDENTITY_ORDER;
    this.hard = opts.hard ?? false;
    this.euroMult = this.hard ? 1.5 : 1;
    this.reset();
  }

  private sfx(name: SfxName) {
    this.onSfx?.(name);
  }

  // Euro string for a kg amount, including the hard-mode ×1.5 bonus — the single
  // place display euros are formatted, so HUD and popups stay consistent.
  eur(kg: number): string {
    return (kg * RATE * this.euroMult).toFixed(2);
  }

  // Resolve a visit index to the actual ISLANDS index via the (possibly
  // shuffled) order, so name + coastline art stay in lockstep.
  private resolvedIsland(idx = this.islandIdx): number {
    return this.order[idx % this.order.length];
  }

  // Localised name of the island currently reached (HUD + receipt).
  currentIslandName(): string {
    return islandName(this.strings.islands, this.resolvedIsland());
  }

  laneCX(i: number): number {
    const m = this.W * 0.14,
      w = (this.W - 2 * m) / LANES;
    return m + w * i + w / 2;
  }

  laneFromX(x: number): number {
    const m = this.W * 0.14,
      w = (this.W - 2 * m) / LANES;
    return Math.floor((x - m) / w);
  }

  setLane(n: number) {
    if (this.stunT > 0) return; // a jellyfish sting freezes your steering
    this.lane = Math.max(0, Math.min(LANES - 1, n));
  }

  resize(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.playerY = H * 0.78;
  }

  reset() {
    this.speed = 210;
    this.dist = 0;
    this.lives = 3;
    this.haulKg = 0;
    this.islandIdx = 0;
    this.nextIslandAt = 400;
    this.elapsed = 0;
    this.lane = 1;
    this.laneX = this.laneCX(1);
    this.playerY = this.H * 0.78;
    this.inv = 0;
    this.fishes = [];
    this.splashes = [];
    this.popups = [];
    this.powers = [];
    this.obstacles = [];
    this.stunT = 0;
    this.obstacleT = this.hard ? 2.5 : 0;
    this.combo = 0;
    this.boss = null;
    // start with the departure island's shore behind the player, so a run reads
    // as "launching from Crete" (or the daily route's first island); it recedes
    // off the bottom in the first seconds. Deterministic decoration (no rng) so
    // it never perturbs the daily spawn sequence.
    const startIsland = this.resolvedIsland(0);
    this.land = {
      side: startIsland % 2 === 0 ? -1 : 1,
      y: this.H * 0.42,
      len: this.H * 0.95,
      seed: startIsland,
      theme: islandTheme(startIsland),
    };
    this.freddoT = 0;
    this.multT = 0;
    this.matiT = 0;
    this.magnetT = 0;
    this.powerT = 5;
    this.spawnT = 0;
    this.quip = null;
    this.quipT = 0;
    this.idleQuipT = 5;
    this.bannerT = 1.6;
    this.bannerTxt = this.currentIslandName();
  }

  start(nowSeconds: number) {
    this.reset();
    this.running = true;
    this.tPrev = nowSeconds;
    this.onMusic?.(islandTheme(this.resolvedIsland()));
  }

  private spawnObstacle() {
    const l = Math.floor(this.rng() * LANES);
    const roll = this.rng();
    // ~40% jelly (stun), ~60% split between rock and mine (life)
    const kind: ObstacleKind = roll < 0.4 ? "jelly" : roll < 0.7 ? "rock" : "mine";
    const r = kind === "jelly" ? 20 : 22;
    this.obstacles.push({ kind, l, x: this.laneCX(l), y: -50, r, phase: this.rng() * 6 });
  }

  private spawn(dt: number) {
    // hard-mode dodge-or-die hazards, on their own cadence (tightens with distance)
    if (this.hard) {
      this.obstacleT -= dt;
      if (this.obstacleT <= 0) {
        this.obstacleT = Math.max(1.3, 2.8 - this.dist * 0.00008) + this.rng() * 0.8;
        this.spawnObstacle();
      }
    }
    this.powerT -= dt;
    if (this.powerT <= 0) {
      this.powerT = (this.hard ? 11 : 7) + this.rng() * (this.hard ? 6 : 4);
      // frappé is the rare jackpot (~10% of drops); the classic four split the rest
      const ty: PowerType =
        this.rng() < 0.1
          ? "frappe"
          : POWER_TYPES[Math.floor(this.rng() * POWER_TYPES.length)];
      const pl = Math.floor(this.rng() * LANES);
      this.powers.push({ type: ty, x: this.laneCX(pl), y: -40 });
    }
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const diff = Math.min(1, this.dist / 3000);
    // difficulty keeps ramping past the early plateau so long runs eventually
    // end: spawn interval keeps tightening and the danger-fish share rises.
    const extra = Math.min(0.12, Math.max(0, this.dist - 3000) * 0.00002);
    this.spawnT = Math.max(0.26, 0.9 - diff * 0.5 - extra) + this.rng() * 0.3;
    const l = Math.floor(this.rng() * LANES);
    const dangerChance = this.hard
      ? Math.min(0.9, 0.75 + Math.max(0, this.dist - 1000) * 0.00002)
      : Math.min(0.8, 0.62 + Math.max(0, this.dist - 2000) * 0.00002);
    const danger = this.rng() < dangerChance;
    const kg = danger ? 8 + this.rng() * 7 : 1 + this.rng() * 4;
    this.fishes.push({
      l,
      x: this.laneCX(l),
      y: -60,
      danger,
      kg,
      r: danger ? 26 + kg * 1.3 : 14 + kg * 2,
      flap: this.rng() * 6,
      drift: (this.rng() - 0.5) * 30,
    });
  }

  addPopup(x: number, y: number, txt: string, col: string) {
    this.popups.push({ x, y, txt, col, t: 1 });
  }

  addSplash(x: number, y: number) {
    for (let i = 0; i < 8; i++)
      this.splashes.push({
        x,
        y,
        vx: (this.rng() - 0.5) * 160,
        vy: -60 - this.rng() * 120,
        t: 0.6,
      });
  }

  private applyPower(ty: PowerType) {
    const S = this.strings.popups;
    if (ty === "freddo") {
      this.freddoT = 3;
      this.addPopup(this.laneX, this.playerY - 60, S.freddo, "#FFC93C");
    }
    if (ty === "souvlaki") {
      if (this.lives < 3) {
        this.lives++;
        this.addPopup(this.laneX, this.playerY - 60, S.souvlakiLife, "#9BFFB0");
      } else {
        this.haulKg += 2;
        this.addPopup(this.laneX, this.playerY - 60, S.souvlakiFull, "#FFC93C");
      }
    }
    if (ty === "net") {
      this.multT = 5;
      this.addPopup(this.laneX, this.playerY - 60, S.net, "#9BFFB0");
    }
    if (ty === "mati") {
      this.matiT = 8;
      this.addPopup(this.laneX, this.playerY - 60, S.mati, "#7FD4FF");
    }
    if (ty === "magnet") {
      this.magnetT = 5;
      this.addPopup(this.laneX, this.playerY - 60, S.magnet, "#9BFFB0");
    }
    if (ty === "frappe") {
      // old-school frappé outranks the freddo: clears the whole sea at once,
      // banking every fish on screen — danger and bounty alike
      let total = 0;
      for (const f of this.fishes) {
        total += f.kg * (this.multT > 0 ? 2 : 1);
        this.addSplash(f.x, f.y);
      }
      this.fishes = [];
      this.haulKg += total;
      this.inv = Math.max(this.inv, 1.5); // a fresh spawn shouldn't bite mid-celebration
      this.addPopup(
        this.laneX,
        this.playerY - 60,
        total > 0
          ? S.frappe(total.toFixed(1), this.eur(total))
          : S.frappeEmpty,
        "#FFC93C"
      );
      vibrate(80);
      this.sfx("frappe");
      return;
    }
    vibrate(30);
    this.sfx("power");
  }

  // Combo streak multiplier on every bounty gain: ×1.5 from 8, ×2 from 16.
  // Modest caps on purpose — the leaderboard measures kg, keep inflation sane.
  comboMult(): number {
    return this.combo >= 16 ? 2 : this.combo >= 8 ? 1.5 : 1;
  }

  private bumpCombo(n: number) {
    const before = this.comboMult();
    this.combo += n;
    const after = this.comboMult();
    if (after > before)
      this.addPopup(this.laneX, this.playerY - 84, this.strings.popups.combo(String(after)), "#FF9F43");
  }

  // Shared "the player got bitten" path (danger fish + boss lunges).
  // Returns true if the run just ended.
  private bitePlayer(): boolean {
    if (this.matiT > 0) {
      // the evil-eye charm eats the bite: no life lost, combo survives
      this.matiT = 0;
      this.inv = 1.0; // brief grace so the same fish can't instantly re-bite
      this.addPopup(this.laneX, this.playerY - 60, this.strings.popups.matiSaved, "#7FD4FF");
      this.addSplash(this.laneX, this.playerY);
      vibrate(60);
      this.sfx("power");
      return false;
    }
    this.lives--;
    this.inv = 1.4;
    this.combo = 0;
    this.addSplash(this.laneX, this.playerY);
    const q = this.strings.biteQuips;
    this.quip = { txt: q[Math.floor(this.rng() * q.length)] };
    this.quipT = 2.2;
    vibrate(120);
    this.sfx("bite");
    if (this.lives <= 0) {
      this.running = false;
      this.sfx("gameover");
      this.onGameOver();
      return true;
    }
    return false;
  }

  // ---- ΜΕΓΑΣ ΛΑΓΟΚΕΦΑΛΟΣ (every 5th island) ----

  private spawnBoss() {
    if (this.boss) return;
    this.boss = {
      x: this.laneCX(1),
      y: -90,
      r: 54,
      targetLane: 1,
      state: "enter",
      t: 0,
      // more passes the deeper you are: 4 lunges at island 5, up to 6
      lungesLeft: Math.min(6, 3 + Math.floor(this.islandIdx / 5)),
    };
    this.addPopup(this.W / 2, this.H * 0.35, this.strings.popups.bossWarn, "#FF5A4E");
    vibrate(90);
    this.sfx("boss");
  }

  private defeatBoss(smashed: boolean) {
    const b = this.boss!;
    // "hazard pay" scales with progress but stays modest (leaderboard sanity)
    const reward = 8 + this.islandIdx * 0.4;
    this.haulKg += reward;
    this.addSplash(b.x, b.y);
    if (smashed) this.addPopup(this.W / 2, this.H * 0.34, this.strings.popups.bossSmash, "#FFC93C");
    this.addPopup(
      this.W / 2,
      this.H * 0.42,
      this.strings.popups.bossDown(reward.toFixed(1), this.eur(reward)),
      "#FFC93C"
    );
    vibrate(80);
    this.sfx("frappe");
    this.boss = null;
  }

  // Boss state machine. Returns true if a lunge ended the run.
  private updateBoss(dt: number): boolean {
    const b = this.boss!;
    const topY = this.H * 0.16;
    if (b.state === "enter") {
      b.y += (topY - b.y) * Math.min(1, dt * 3);
      if (b.y > topY - 8) {
        b.state = "telegraph";
        b.t = 0.9;
        b.targetLane = this.lane;
      }
    } else if (b.state === "telegraph") {
      // tracks your lane while flashing, locks 0.35s before the lunge so a
      // last-moment dodge is always possible
      if (b.t > 0.35) b.targetLane = this.lane;
      b.x += (this.laneCX(b.targetLane) - b.x) * Math.min(1, dt * 8);
      b.t -= dt;
      if (b.t <= 0) b.state = "lunge";
    } else if (b.state === "lunge") {
      b.y += this.H * 1.35 * dt;
      if (Math.abs(b.y - this.playerY) < b.r + 20 && Math.abs(b.x - this.laneX) < b.r + 12) {
        if (this.freddoT > 0) {
          // caffeinated ramming speed: instant win
          this.defeatBoss(true);
          return false;
        }
        if (this.inv <= 0 && this.bitePlayer()) return true;
      }
      if (b.y > this.H + b.r) b.state = "retreat";
    } else {
      // retreat: dives under and swims back up for the next pass
      b.y -= this.H * 1.1 * dt;
      if (b.y <= topY) {
        b.y = topY;
        b.lungesLeft--;
        if (b.lungesLeft <= 0) {
          this.defeatBoss(false);
          return false;
        }
        b.state = "telegraph";
        b.t = 0.8;
      }
    }
    return false;
  }

  // One simulation step. `t` is the current time in seconds.
  step(t: number) {
    if (!this.running) return;
    const dt = Math.min(0.033, t - this.tPrev);
    this.tPrev = t;
    this.elapsed += dt;

    if (this.freddoT > 0) this.freddoT -= dt;
    if (this.multT > 0) this.multT -= dt;
    if (this.matiT > 0) this.matiT -= dt;
    if (this.magnetT > 0) this.magnetT -= dt;
    if (this.stunT > 0) this.stunT -= dt;

    // difficulty (+ freddo boost)
    // Early fast ramp (210→470 by ~4.3km) then a slow, uncapped creep so the
    // game never fully plateaus — a marathon run keeps getting harder.
    const baseSpeed =
      210 + Math.min(260, this.dist * 0.06) + Math.max(0, this.dist - 4333) * 0.02;
    // hard mode: faster from the first second and a steeper creep
    const hardMul = this.hard ? 1.28 : 1;
    this.speed = baseSpeed * hardMul * (this.freddoT > 0 ? 1.35 : 1);
    // feed the music bed a 0..1.2 intensity from current speed, so the score
    // drives harder the further/faster you go (and surges during a freddo);
    // a boss fight pins it to the ceiling
    this.onMusicProgress?.(
      this.boss ? 1.2 : Math.max(0, Math.min(1.2, (this.speed - 210) / 300))
    );
    this.dist += this.speed * dt * 0.06;
    if (this.dist >= this.nextIslandAt) {
      this.islandIdx++;
      this.nextIslandAt += 400 + this.islandIdx * 80;
      this.bannerTxt = this.currentIslandName();
      this.bannerT = 1.6;
      this.sfx("island");
      const theme = islandTheme(this.resolvedIsland());
      this.onMusic?.(theme);
      this.land = {
        side: this.rng() < 0.5 ? -1 : 1,
        y: -this.H * 1.1,
        len: this.H * 1.05,
        seed: Math.floor(this.rng() * 99),
        theme,
      };
      this.addPopup(this.W / 2, this.H * 0.42, this.strings.popups.speedUp, "#fff");
      // every 5th island the ΜΕΓΑΣ rises from the deep
      if (this.islandIdx % 5 === 0) this.spawnBoss();
    }
    this.bannerT -= dt;

    // quips
    if (this.quip) {
      this.quipT -= dt;
      if (this.quipT <= 0) this.quip = null;
    } else {
      this.idleQuipT -= dt;
      if (this.idleQuipT <= 0) {
        const q = this.strings.idleQuips;
        this.quip = { txt: q[Math.floor(this.rng() * q.length)] };
        this.quipT = 2.4;
        this.idleQuipT = 8 + this.rng() * 7;
      }
    }

    if (this.land) {
      this.land.y += this.speed * dt;
      if (this.land.y - this.land.len > this.H + 60) this.land = null;
    }

    // player lane easing
    const target = this.laneCX(this.lane);
    const d = target - this.laneX;
    this.laneX += d * Math.min(1, dt * 13);
    this.wobble = d / 60;
    if (this.inv > 0) this.inv -= dt;

    // during a boss fight the regular stream thins out so lunges stay dodgeable
    this.spawn(dt * (this.boss ? 0.5 : 1));

    // fish
    for (const f of this.fishes) {
      f.y += this.speed * dt;
      f.x += f.drift * dt;
      if (this.magnetT > 0 && !f.danger) {
        // longline active: bounty fish get reeled toward the player's lane
        // from anywhere on screen (never danger fish)
        f.x += (this.laneX - f.x) * Math.min(1, dt * 5);
      } else {
        // drift must never carry a fish beyond the catchable band of its lane —
        // the boat can't go further out than the edge lane centers, so an
        // over-drifted bounty fish would be physically unreachable
        const cx = this.laneCX(f.l);
        if (f.x < cx - 18) f.x = cx - 18;
        if (f.x > cx + 18) f.x = cx + 18;
      }
      // catch assist: bounty fish close to the boat's path get gently
      // magnetized so honest near-misses connect (never danger fish)
      if (
        !f.danger &&
        Math.abs(f.y - this.playerY) < 90 &&
        Math.abs(f.x - this.laneX) < f.r + 40
      ) {
        f.x += (this.laneX - f.x) * Math.min(1, dt * 6);
      }
    }
    this.fishes = this.fishes.filter((f) => f.y < this.H + 80);

    // power-ups
    for (let i = this.powers.length - 1; i >= 0; i--) {
      const p = this.powers[i];
      p.y += this.speed * dt;
      if (p.y > this.H + 60) {
        this.powers.splice(i, 1);
        continue;
      }
      // same catch assist as bounty fish
      if (Math.abs(p.y - this.playerY) < 90 && Math.abs(p.x - this.laneX) < 64) {
        p.x += (this.laneX - p.x) * Math.min(1, dt * 6);
      }
      if (Math.abs(p.y - this.playerY) < 44 && Math.abs(p.x - this.laneX) < 42) {
        this.applyPower(p.type);
        this.powers.splice(i, 1);
      }
    }

    // hard-mode obstacles: dodge-or-die. Freddo passes through everything.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.y += this.speed * dt;
      if (o.y > this.H + 60) {
        this.obstacles.splice(i, 1);
        continue;
      }
      if (Math.abs(o.y - this.playerY) < o.r + 20 && Math.abs(o.x - this.laneX) < o.r + 15) {
        if (this.freddoT > 0) continue; // caffeinated: barrel through unharmed
        this.obstacles.splice(i, 1);
        if (o.kind === "jelly") {
          // sting: freeze steering briefly (no life lost)
          this.stunT = Math.max(this.stunT, 1.1);
          this.addSplash(o.x, o.y);
          this.addPopup(this.laneX, this.playerY - 60, "😵", "#C9A0FF");
          vibrate(60);
        } else if (this.inv <= 0) {
          // rock / mine: costs a life
          this.combo = 0;
          this.lives--;
          this.inv = 1.4;
          this.addSplash(this.laneX, this.playerY);
          this.sfx("bite");
          vibrate(120);
          if (this.lives <= 0) {
            this.running = false;
            this.sfx("gameover");
            this.onGameOver();
            return;
          }
        }
      }
    }

    // collide
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      if (Math.abs(f.y - this.playerY) < f.r + 22 && Math.abs(f.x - this.laneX) < f.r + 16) {
        if (f.danger) {
          if (this.freddoT > 0) {
            // caffeinated: invincible, smash them and collect the kilos
            const gain = f.kg * (this.multT > 0 ? 2 : 1) * this.comboMult();
            this.haulKg += gain;
            this.fishes.splice(i, 1);
            this.addPopup(
              f.x,
              f.y - 30,
              this.strings.popups.smashed(gain.toFixed(1), this.eur(gain)),
              "#FFC93C"
            );
            this.addSplash(f.x, f.y);
            vibrate(40);
            this.sfx("catch");
            this.bumpCombo(1);
          } else if (this.inv <= 0) {
            if (this.bitePlayer()) return;
          }
        } else {
          const gain = f.kg * (this.multT > 0 ? 2 : 1) * this.comboMult();
          this.haulKg += gain;
          this.fishes.splice(i, 1);
          this.addPopup(
            f.x,
            f.y - 30,
            this.strings.popups.caught(gain.toFixed(1), this.eur(gain)),
            this.multT > 0 ? "#9BFFB0" : "#FFC93C"
          );
          this.addSplash(f.x, f.y);
          this.sfx("catch");
          this.bumpCombo(1);
        }
      }
    }

    // boss fight
    if (this.boss && this.updateBoss(dt)) return;

    // fx
    for (const p of this.popups) {
      p.t -= dt;
      p.y -= 40 * dt;
    }
    this.popups = this.popups.filter((p) => p.t > 0);
    for (const s of this.splashes) {
      s.t -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 500 * dt;
    }
    this.splashes = this.splashes.filter((s) => s.t > 0);
  }
}
