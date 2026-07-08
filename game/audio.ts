// Procedural sound effects AND a generative music bed via WebAudio — no asset
// files, works on mobile. Must be resumed from a user gesture (the START tap)
// to satisfy browser autoplay policies.
import type { IslandTheme } from "./types";

export type SfxName = "catch" | "bite" | "power" | "frappe" | "island" | "gameover";

const STORAGE_KEY = "lago-muted";
const MASTER_GAIN = 0.35;
const SFX_LEVEL = 0.28; // sound effects sit on their own quieter bus under master

// ---- generative music ----
// A soft looping bed (bass + arpeggio) synthesised on the fly. Each island art
// theme gets its own "mood": key, scale and instrument. Sunny islands get bright
// pentatonics; the moody ones get phrygian / natural-minor for an Aegean feel.
const MUSIC_LEVEL = 0.85; // music sits UNDER the SFX, not over them
const MUSIC_LOOKAHEAD = 0.12; // schedule notes this far ahead (s)
const MUSIC_TICK = 25; // scheduler wake-ups (ms)

interface MoodCfg {
  root: number; // root frequency of the low register (Hz)
  scale: number[]; // semitone offsets within the octave
  tempo: number; // seconds per eighth-note
  lead: OscillatorType;
  bass: OscillatorType;
  leadGain: number;
  bassGain: number;
}

const MOODS: Record<IslandTheme, MoodCfg> = {
  // relaxed taverna groove (D minor-pentatonic-ish)
  port: { root: 146.83, scale: [0, 3, 5, 7, 10], tempo: 0.34, lead: "triangle", bass: "sine", leadGain: 0.075, bassGain: 0.11 },
  // bright + airy (E major pentatonic)
  cycladic: { root: 164.81, scale: [0, 2, 4, 7, 9], tempo: 0.28, lead: "triangle", bass: "sine", leadGain: 0.08, bassGain: 0.1 },
  // tense, dark (A phrygian)
  volcanic: { root: 110.0, scale: [0, 1, 3, 5, 7, 8, 10], tempo: 0.3, lead: "sawtooth", bass: "triangle", leadGain: 0.05, bassGain: 0.12 },
  // mellow, pastoral (C major pentatonic)
  green: { root: 130.81, scale: [0, 2, 4, 7, 9], tempo: 0.36, lead: "sine", bass: "sine", leadGain: 0.07, bassGain: 0.1 },
  // bouncy (G major pentatonic)
  windmill: { root: 196.0, scale: [0, 2, 4, 7, 9], tempo: 0.25, lead: "triangle", bass: "sine", leadGain: 0.075, bassGain: 0.1 },
  // chill beach (F minor pentatonic)
  beach: { root: 174.61, scale: [0, 3, 5, 7, 10], tempo: 0.32, lead: "triangle", bass: "sine", leadGain: 0.07, bassGain: 0.1 },
  // sparse + wistful (A natural minor)
  lighthouse: { root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], tempo: 0.42, lead: "sine", bass: "sine", leadGain: 0.06, bassGain: 0.1 },
};

// 16-step melodic contour — indexes into the two-octave scale table (-1 = rest).
const LEAD_PATTERN = [0, 2, 4, 2, 5, 4, 2, -1, 1, 3, 5, 3, 6, 4, 2, -1];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  muted = false;

  // generative-music state
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private mNextTime = 0;
  private mStep = 0;
  private mMood: MoodCfg = MOODS.port;
  private mExt: number[] = []; // two-octave note table for the current scale

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {}
  }

  // Call on a user gesture. Lazily creates the context (and resumes it if the
  // browser suspended it).
  resume() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = SFX_LEVEL;
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : MASTER_GAIN;
    try {
      localStorage.setItem(STORAGE_KEY, m ? "1" : "0");
    } catch {}
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    at = 0,
    glideTo?: number
  ) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, peak: number, filterHz: number, at = 0, sweepTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(filterHz, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain!);
    src.start(t);
    src.stop(t + dur);
  }

  play(name: SfxName) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case "catch": // bright coin ding
        this.blip(880, 0.09, "square", 0.25);
        this.blip(1320, 0.11, "square", 0.2, 0.05);
        break;
      case "bite": // low gomp + noise thud
        this.blip(170, 0.2, "sawtooth", 0.3, 0, 70);
        this.noise(0.16, 0.25, 320);
        break;
      case "power": // rising blip
        this.blip(620, 0.13, "triangle", 0.28, 0, 990);
        break;
      case "frappe": {
        // big whoosh + a sparkle arpeggio
        this.noise(0.45, 0.3, 300, 0, 2600);
        const arp = [523, 659, 784, 1046];
        arp.forEach((f, i) => this.blip(f, 0.16, "triangle", 0.22, 0.06 + i * 0.07));
        break;
      }
      case "island": {
        // quick bouzouki-ish pluck arpeggio (D A D F#)
        const notes = [293.66, 440, 587.33, 739.99];
        notes.forEach((f, i) => this.blip(f, 0.14, "triangle", 0.22, i * 0.085));
        break;
      }
      case "gameover": // descending sad sting
        this.blip(440, 0.18, "triangle", 0.26, 0);
        this.blip(330, 0.2, "triangle", 0.26, 0.16);
        this.blip(220, 0.34, "triangle", 0.26, 0.34);
        break;
    }
  }

  // ---- generative music ----

  // Build the two-octave note table (plus the top root) for a mood's scale.
  private buildScale(m: MoodCfg) {
    const ext: number[] = [];
    for (let oct = 0; oct < 2; oct++)
      for (const s of m.scale) ext.push(m.root * Math.pow(2, (s + 12 * oct) / 12));
    ext.push(m.root * 4); // top root to give the contour some headroom
    this.mExt = ext;
  }

  // Schedule one note at an absolute AudioContext time, routed to the music bus.
  private mVoice(freq: number, dur: number, type: OscillatorType, peak: number, at: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(this.musicGain!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private mScheduleStep(step: number, at: number) {
    const m = this.mMood;
    const bar = step % 8;
    // bass: root on the downbeat, a fifth up halfway through the bar
    if (bar === 0) this.mVoice(m.root / 2, m.tempo * 3.6, m.bass, m.bassGain, at);
    else if (bar === 4) this.mVoice((m.root / 2) * 1.4983, m.tempo * 3.6, m.bass, m.bassGain, at);
    // lead: follow the rolling contour through the scale table
    const li = LEAD_PATTERN[step % LEAD_PATTERN.length];
    if (li >= 0 && this.mExt[li]) this.mVoice(this.mExt[li], m.tempo * 0.9, m.lead, m.leadGain, at);
  }

  // Lookahead scheduler: queue every note due within the next window, then sleep.
  private mTick = () => {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    while (this.mNextTime < ctx.currentTime + MUSIC_LOOKAHEAD) {
      this.mScheduleStep(this.mStep, this.mNextTime);
      this.mNextTime += this.mMood.tempo;
      this.mStep++;
    }
  };

  // Start (or restart) the music bed. resume() must have run first.
  startMusic(theme: IslandTheme = "port") {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.connect(this.master);
    }
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setValueAtTime(MUSIC_LEVEL, ctx.currentTime);
    this.mMood = MOODS[theme];
    this.buildScale(this.mMood);
    this.mStep = 0;
    this.mNextTime = ctx.currentTime + 0.1;
    if (this.musicTimer === null) this.musicTimer = window.setInterval(this.mTick, MUSIC_TICK);
  }

  // Switch mood when the island changes: swap the scale and take a quick musical
  // "breath" — duck the bed, then swell it back with the new key.
  setMusicTheme(theme: IslandTheme) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.musicTimer === null) {
      this.startMusic(theme);
      return;
    }
    const m = MOODS[theme];
    if (m === this.mMood) return;
    this.mMood = m;
    this.buildScale(m);
    if (this.musicGain) {
      const now = ctx.currentTime;
      const g = this.musicGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(MUSIC_LEVEL * 0.25, now + 0.12);
      g.linearRampToValueAtTime(MUSIC_LEVEL, now + 0.6);
    }
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicGain) {
      const now = this.ctx.currentTime;
      const g = this.musicGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.0001, now + 0.3);
    }
  }
}
