import type { SfxName } from "./audio";
import { islandName, islandTheme } from "./islands";
import type {
  Fish,
  GameStrings,
  IslandTheme,
  Land,
  Popup,
  Power,
  PowerType,
  Quip,
  Splash,
} from "./types";

export const RATE = 5.33;
export const LANES = 3;

const POWER_TYPES: PowerType[] = ["freddo", "souvlaki", "net", "cam"];

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
  land: Land | null = null;
  bannerT = 0;
  bannerTxt = "";

  freddoT = 0;
  multT = 0;
  slowT = 0;
  powerT = 6;
  spawnT = 0;

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
    this.reset();
  }

  private sfx(name: SfxName) {
    this.onSfx?.(name);
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
    this.land = null;
    this.freddoT = 0;
    this.multT = 0;
    this.slowT = 0;
    this.powerT = 5;
    this.spawnT = 0;
    this.quip = null;
    this.quipT = 0;
    this.idleQuipT = 5;
    this.bannerT = 1.6;
    this.bannerTxt = this.strings.islands[0];
  }

  start(nowSeconds: number) {
    this.reset();
    this.running = true;
    this.tPrev = nowSeconds;
    this.onMusic?.(islandTheme(this.islandIdx));
  }

  private spawn(dt: number) {
    this.powerT -= dt;
    if (this.powerT <= 0) {
      this.powerT = 7 + this.rng() * 4;
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
    const dangerChance = Math.min(0.8, 0.62 + Math.max(0, this.dist - 2000) * 0.00002);
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
    if (ty === "cam") {
      this.slowT = 2;
      this.addPopup(this.laneX, this.playerY - 60, S.cam, "#fff");
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
          ? S.frappe(total.toFixed(1), (total * RATE).toFixed(2))
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

  // One simulation step. `t` is the current time in seconds.
  step(t: number) {
    if (!this.running) return;
    const dt = Math.min(0.033, t - this.tPrev);
    this.tPrev = t;
    this.elapsed += dt;

    if (this.freddoT > 0) this.freddoT -= dt;
    if (this.multT > 0) this.multT -= dt;
    if (this.slowT > 0) this.slowT -= dt;

    // difficulty (+ freddo boost)
    // Early fast ramp (210→470 by ~4.3km) then a slow, uncapped creep so the
    // game never fully plateaus — a marathon run keeps getting harder.
    const baseSpeed =
      210 + Math.min(260, this.dist * 0.06) + Math.max(0, this.dist - 4333) * 0.02;
    this.speed = baseSpeed * (this.freddoT > 0 ? 1.35 : 1);
    // feed the music bed a 0..1.2 intensity from current speed, so the score
    // drives harder the further/faster you go (and surges during a freddo)
    this.onMusicProgress?.(Math.max(0, Math.min(1.2, (this.speed - 210) / 300)));
    this.dist += this.speed * dt * 0.06;
    if (this.dist >= this.nextIslandAt) {
      this.islandIdx++;
      this.nextIslandAt += 400 + this.islandIdx * 80;
      this.bannerTxt = islandName(this.strings.islands, this.islandIdx);
      this.bannerT = 1.6;
      this.sfx("island");
      const theme = islandTheme(this.islandIdx);
      this.onMusic?.(theme);
      this.land = {
        side: this.rng() < 0.5 ? -1 : 1,
        y: -this.H * 1.1,
        len: this.H * 1.05,
        seed: Math.floor(this.rng() * 99),
        theme,
      };
      this.addPopup(this.W / 2, this.H * 0.42, this.strings.popups.speedUp, "#fff");
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

    // The selfie/camera power-up slows fish AND their spawn cadence by the same
    // factor, so time genuinely slows — otherwise fish keep spawning at full
    // rate while crawling and pile up into an undodgeable wall across all lanes.
    const fs = this.slowT > 0 ? 0.22 : 1;
    this.spawn(dt * fs);

    // fish (camera makes them slow down and pose)
    for (const f of this.fishes) {
      f.y += this.speed * fs * dt;
      f.x += f.drift * fs * dt;
      // drift must never carry a fish beyond the catchable band of its lane —
      // the boat can't go further out than the edge lane centers, so an
      // over-drifted bounty fish would be physically unreachable
      const cx = this.laneCX(f.l);
      if (f.x < cx - 18) f.x = cx - 18;
      if (f.x > cx + 18) f.x = cx + 18;
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
      p.y += this.speed * fs * dt;
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

    // collide
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      if (Math.abs(f.y - this.playerY) < f.r + 22 && Math.abs(f.x - this.laneX) < f.r + 16) {
        if (f.danger) {
          if (this.freddoT > 0) {
            // caffeinated: invincible, smash them and collect the kilos
            const gain = f.kg * (this.multT > 0 ? 2 : 1);
            this.haulKg += gain;
            this.fishes.splice(i, 1);
            this.addPopup(
              f.x,
              f.y - 30,
              this.strings.popups.smashed(gain.toFixed(1), (gain * RATE).toFixed(2)),
              "#FFC93C"
            );
            this.addSplash(f.x, f.y);
            vibrate(40);
            this.sfx("catch");
          } else if (this.inv <= 0) {
            this.lives--;
            this.inv = 1.4;
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
              return;
            }
          }
        } else {
          const gain = f.kg * (this.multT > 0 ? 2 : 1);
          this.haulKg += gain;
          this.fishes.splice(i, 1);
          this.addPopup(
            f.x,
            f.y - 30,
            this.strings.popups.caught(gain.toFixed(1), (gain * RATE).toFixed(2)),
            this.multT > 0 ? "#9BFFB0" : "#FFC93C"
          );
          this.addSplash(f.x, f.y);
          this.sfx("catch");
        }
      }
    }

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
