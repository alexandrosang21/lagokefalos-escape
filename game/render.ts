import { Engine, LANES } from "./engine";
import type { Fish, IslandTheme, Obstacle, Power, PowerType } from "./types";

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Hearts are drawn as bezier paths on purpose: emoji in canvas fillText render
// inconsistently on mobile (see spec §8).
function drawHeart(ctx: Ctx, x: number, y: number, s: number, col: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(s, -s * 0.45, s * 1.9, s * 0.5, 0, s * 1.5);
  ctx.bezierCurveTo(-s * 1.9, s * 0.5, -s, -s * 0.45, 0, s * 0.35);
  ctx.fill();
  ctx.restore();
}

function hexLerp(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16),
    bh = parseInt(b.slice(1), 16);
  const r = Math.round(((ah >> 16) & 255) + (((bh >> 16) & 255) - ((ah >> 16) & 255)) * t);
  const g = Math.round(((ah >> 8) & 255) + (((bh >> 8) & 255) - ((ah >> 8) & 255)) * t);
  const bl = Math.round((ah & 255) + ((bh & 255) - (ah & 255)) * t);
  return `rgb(${r},${g},${bl})`;
}

// Normal-mode water shifts with distance (turquoise → blue → violet → reddening)
// as a live danger signal that reinforces the difficulty ramp.
const WATER_STOPS: { p: number; top: string; bottom: string }[] = [
  { p: 0, top: "#2E9BD6", bottom: "#0E5C99" },
  { p: 0.35, top: "#2E63C6", bottom: "#0E3C8C" },
  { p: 0.7, top: "#6A4FC0", bottom: "#3A2A80" },
  { p: 1, top: "#C0455A", bottom: "#6E1E30" },
];

function waterColors(e: Engine): { top: string; bottom: string } {
  if (e.hard) {
    // "Ερυθρά Θάλασσα": crimson from t=0, deepening to blood the further you go
    const hp = Math.min(1, e.dist / 15000);
    return { top: hexLerp("#C43A2E", "#9E1A22", hp), bottom: hexLerp("#6E1220", "#4A0A16", hp) };
  }
  const p = Math.min(1, e.dist / 22000);
  for (let i = 0; i < WATER_STOPS.length - 1; i++) {
    if (p <= WATER_STOPS[i + 1].p) {
      const s = WATER_STOPS[i],
        n = WATER_STOPS[i + 1];
      const t = (p - s.p) / (n.p - s.p || 1);
      return { top: hexLerp(s.top, n.top, t), bottom: hexLerp(s.bottom, n.bottom, t) };
    }
  }
  const last = WATER_STOPS[WATER_STOPS.length - 1];
  return { top: last.top, bottom: last.bottom };
}

function drawSea(ctx: Ctx, e: Engine) {
  const { W, H, dist } = e;
  const { top, bottom } = waterColors(e);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // lane foam lines
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 22]);
  const m = W * 0.14,
    w = (W - 2 * m) / LANES;
  const off = (dist * 2.2) % 36;
  for (let i = 0; i <= LANES; i++) {
    ctx.beginPath();
    ctx.moveTo(m + w * i, -36 + off);
    ctx.lineTo(m + w * i, H + 36);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // drifting wave arcs
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const y = ((i * H) / 6 + dist * 1.4) % (H + 80) - 40;
    const x = (i * 97) % W;
    ctx.beginPath();
    ctx.arc(x, y, 16, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
}

// The lagokefalos must read as "rabbit-faced": blunt snout toward the player,
// two big buck teeth, pale side eyes, spotted back stripe, forked tail.
function drawFish(ctx: Ctx, f: Fish, t: number) {
  const { x, y, danger, r } = f;
  ctx.save();
  ctx.translate(x, y);
  const sway = Math.sin(t * 5 + f.flap) * 0.06;
  ctx.rotate(sway);
  const L = r * 1.7; // body length (head at bottom, swimming toward player)
  // tail fin (top)
  ctx.fillStyle = danger ? "#5F707B" : "#7C8B95";
  ctx.beginPath();
  ctx.moveTo(0, -L * 0.72);
  ctx.lineTo(-r * 0.45, -L * 1.05);
  ctx.lineTo(0, -L * 0.9);
  ctx.lineTo(r * 0.45, -L * 1.05);
  ctx.closePath();
  ctx.fill();
  // elongated silver body, blunt rounded head at bottom
  const bg = ctx.createLinearGradient(-r, 0, r, 0);
  bg.addColorStop(0, danger ? "#8E9EA8" : "#A9B7C0");
  bg.addColorStop(0.5, danger ? "#B9C6CE" : "#D4DEE4");
  bg.addColorStop(1, danger ? "#8E9EA8" : "#A9B7C0");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(0, -L * 0.78);
  ctx.quadraticCurveTo(-r * 0.55, -L * 0.55, -r * 0.85, -L * 0.05);
  ctx.quadraticCurveTo(-r, -L * 0.35 + L * 0.7, -r * 0.72, L * 0.5);
  ctx.quadraticCurveTo(-r * 0.5, L * 0.78, 0, L * 0.8);
  ctx.quadraticCurveTo(r * 0.5, L * 0.78, r * 0.72, L * 0.5);
  ctx.quadraticCurveTo(r, L * 0.35, r * 0.85, -L * 0.05);
  ctx.quadraticCurveTo(r * 0.55, -L * 0.55, 0, -L * 0.78);
  ctx.closePath();
  ctx.fill();
  // white belly stripe (sides)
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.ellipse(0, L * 0.15, r * 0.62, L * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // dark grey back with spots (center stripe, seen from above)
  ctx.fillStyle = danger ? "#4E5B64" : "#6B7A84";
  ctx.beginPath();
  ctx.ellipse(0, -L * 0.1, r * 0.42, L * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(25,32,38,0.75)";
  for (let i = 0; i < 7; i++) {
    const sy = -L * 0.55 + i * L * 0.16,
      sx = Math.sin(i * 2.4 + f.flap) * r * 0.24;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  // pectoral side fins
  ctx.fillStyle = danger ? "#5F707B" : "#7C8B95";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.8, L * 0.1);
    ctx.quadraticCurveTo(s * r * 1.25, L * 0.25, s * r * 0.9, L * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  // big eyes on the sides of the blunt head
  const ew = r * 0.24;
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#F4E9C8";
    ctx.beginPath();
    ctx.arc(s * r * 0.5, L * 0.42, ew, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#141414";
    ctx.beginPath();
    ctx.arc(s * r * 0.5, L * 0.47, ew * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s * r * 0.46, L * 0.43, ew * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  // THE RABBIT MOUTH — blunt snout + two big buck teeth
  if (danger) {
    // open mouth
    ctx.fillStyle = "#7E2B24";
    ctx.beginPath();
    ctx.ellipse(0, L * 0.68, r * 0.38, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // fused beak plates: two big upper buck teeth + lower plate
    ctx.fillStyle = "#FFF9EE";
    const tw = r * 0.2,
      th = r * 0.26;
    roundRect(ctx, -tw - 1.5, L * 0.68 - th, tw, th, 3);
    ctx.fill();
    roundRect(ctx, 1.5, L * 0.68 - th, tw, th, 3);
    ctx.fill();
    roundRect(ctx, -r * 0.24, L * 0.68 + r * 0.06, r * 0.48, r * 0.14, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,90,60,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, L * 0.68 - th);
    ctx.lineTo(0, L * 0.68);
    ctx.stroke();
  } else {
    // closed rabbit smile: two buck teeth poking out
    ctx.strokeStyle = "#54636D";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, L * 0.6, r * 0.22, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#FFF9EE";
    const tw = r * 0.13,
      th = r * 0.18;
    roundRect(ctx, -tw - 1, L * 0.64, tw, th, 2);
    ctx.fill();
    roundRect(ctx, 1, L * 0.64, tw, th, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,90,60,0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-tw - 1, L * 0.64, tw, th);
    ctx.strokeRect(1, L * 0.64, tw, th);
    // bounty tag
    ctx.fillStyle = "#FFC93C";
    ctx.font = "bold " + Math.max(11, r * 0.5) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("€", 0, -L * 0.95);
  }
  ctx.restore();
}

// Draws a single centered fish at CSS size `size` — used by the on-boarding
// "eat small / avoid big" cards so they show the exact in-game art.
// drawFish already translates to the fish's (x,y), so we pass the canvas center.
export function drawFishPreview(ctx: Ctx, danger: boolean, size: number) {
  const r = danger ? size * 0.3 : size * 0.24;
  drawFish(ctx, { x: size / 2, y: size / 2, danger, kg: 1, r, flap: 1.2, drift: 0, l: 0 }, 0.35);
}

// The ΜΕΓΑΣ ΛΑΓΟΚΕΦΑΛΟΣ — same rabbit-faced art, boss-sized. While it
// telegraphs, the target lane pulses red so the lunge is readable.
function drawBoss(ctx: Ctx, e: Engine, t: number) {
  const b = e.boss!;
  if (b.state === "telegraph") {
    const m = e.W * 0.14,
      w = (e.W - 2 * m) / LANES;
    ctx.fillStyle = `rgba(255,90,78,${0.14 + 0.1 * Math.sin(t * 14)})`;
    ctx.fillRect(m + w * b.targetLane, 0, w, e.H);
  }
  ctx.save();
  if (b.state === "retreat") ctx.globalAlpha = 0.4; // diving back under
  drawFish(ctx, { x: b.x, y: b.y, danger: true, kg: 99, r: b.r, flap: 2, drift: 0, l: b.targetLane }, t);
  ctx.restore();
}

function drawPlayer(ctx: Ctx, e: Engine, t: number) {
  const x = e.laneX,
    y = e.playerY;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 9) * 2);
  if (e.freddoT > 0) {
    // golden caffeine aura
    ctx.fillStyle = "rgba(255,201,60," + (0.28 + Math.sin(t * 12) * 0.1) + ")";
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.inv > 0 && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.rotate(e.wobble * 0.06);
  if (e.stunT > 0) ctx.rotate(Math.sin(t * 26) * 0.35); // jellyfish-sting dizzy wobble
  // wake
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(0, 26);
  ctx.lineTo(-14, 58);
  ctx.lineTo(14, 58);
  ctx.closePath();
  ctx.fill();
  // hull
  ctx.fillStyle = "#F5F7F8";
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.quadraticCurveTo(20, -6, 16, 24);
  ctx.lineTo(-16, 24);
  ctx.quadraticCurveTo(-20, -6, 0, -32);
  ctx.fill();
  ctx.fillStyle = "#FF5A4E";
  ctx.fillRect(-16, 10, 32, 8);
  // rider
  ctx.fillStyle = "#123A5C";
  ctx.beginPath();
  ctx.arc(0, -4, 9, 0, Math.PI * 2);
  ctx.fill(); // torso
  ctx.fillStyle = "#E8B27D";
  ctx.beginPath();
  ctx.arc(0, -16, 6.5, 0, Math.PI * 2);
  ctx.fill(); // head
  ctx.fillStyle = "#0B3E6F";
  ctx.fillRect(-8, -20, 16, 4); // cap
  ctx.restore();
}

// ------- island coastline pass-by -------
function coastPath(ctx: Ctx, e: Engine, k: number) {
  const land = e.land!;
  const s = land.side,
    edge = s < 0 ? 0 : e.W,
    wMax = e.W * 0.16,
    steps = 12;
  ctx.beginPath();
  ctx.moveTo(edge, land.y);
  for (let i = 0; i <= steps; i++) {
    const yy = land.y + (land.len * i) / steps;
    const ww =
      k * wMax * Math.max(0, Math.sin((Math.PI * i) / steps)) * (0.6 + 0.4 * Math.sin(i * 1.9 + land.seed));
    ctx.lineTo(edge - s * ww, yy);
  }
  ctx.lineTo(edge, land.y + land.len);
  ctx.closePath();
}

// Per-theme coastline palettes; vegK is how far the greenery reaches.
const LAND_PAL: Record<IslandTheme, { sand: string; veg: string; vegK: number }> = {
  cycladic: { sand: "#EAD9A8", veg: "#B9C98A", vegK: 0.55 },
  windmill: { sand: "#EAD9A8", veg: "#B9C98A", vegK: 0.55 },
  volcanic: { sand: "#8B7A6E", veg: "#6E5D52", vegK: 0.6 },
  green: { sand: "#E6DCAE", veg: "#6FA36B", vegK: 0.75 },
  port: { sand: "#E5D3A8", veg: "#A8BD86", vegK: 0.5 },
  beach: { sand: "#F2E3B4", veg: "#C9D49A", vegK: 0.32 },
  lighthouse: { sand: "#C9BFA8", veg: "#9AA382", vegK: 0.45 },
};

function drawLand(ctx: Ctx, e: Engine) {
  const land = e.land!;
  const pal = LAND_PAL[land.theme];
  coastPath(ctx, e, 1.3);
  ctx.fillStyle = "rgba(140,224,229,0.55)"; // shallows
  ctx.fill();
  coastPath(ctx, e, 1);
  ctx.fillStyle = pal.sand;
  ctx.fill();
  coastPath(ctx, e, pal.vegK);
  ctx.fillStyle = pal.veg;
  ctx.fill();
  if (land.theme === "volcanic") {
    // dark caldera cliff core
    coastPath(ctx, e, 0.38);
    ctx.fillStyle = "#4A3E38";
    ctx.fill();
  }
  if (land.theme === "green") {
    coastPath(ctx, e, 0.35);
    ctx.fillStyle = "#4F7D4F";
    ctx.fill();
  }

  const s = land.side,
    edge = s < 0 ? 0 : e.W,
    wMax = e.W * 0.16;
  const midY = land.y + land.len / 2;
  if (midY < -60 || midY > e.H + 60) return;
  const dx = (k: number) => edge - s * (wMax * k); // distance inland from the screen edge

  switch (land.theme) {
    case "cycladic": {
      // white sugar-cube houses with blue domes
      for (let h = 0; h < 3; h++) {
        const hy = midY + (h - 1) * 36,
          hx = dx(0.32) - s * h * 7;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(hx - 8, hy - 6, 16, 12);
        ctx.fillStyle = "#2C63A8";
        ctx.beginPath();
        ctx.arc(hx, hy - 6, 7, Math.PI, 0);
        ctx.fill();
      }
      break;
    }
    case "volcanic": {
      // tiny white village strung along the dark caldera rim
      ctx.fillStyle = "#FFFFFF";
      for (let h = 0; h < 5; h++) {
        const hy = midY + (h - 2) * 22,
          hx = dx(0.42) - s * Math.sin(h * 1.7 + land.seed) * 6;
        ctx.fillRect(hx - 4, hy - 3, 8, 6);
      }
      break;
    }
    case "green": {
      // cypress trees
      for (let h = 0; h < 4; h++) {
        const hy = midY + (h - 1.5) * 30,
          hx = dx(0.3) - s * (h % 2) * 12;
        ctx.fillStyle = "#5C4327";
        ctx.fillRect(hx - 1.5, hy + 8, 3, 6);
        ctx.fillStyle = "#2F5D3A";
        ctx.beginPath();
        ctx.moveTo(hx, hy - 16);
        ctx.lineTo(hx - 6, hy + 9);
        ctx.lineTo(hx + 6, hy + 9);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "port": {
      // pastel neoclassical waterfront row
      const walls = ["#F2A48D", "#F5D394", "#A8CBE8"];
      for (let h = 0; h < 3; h++) {
        const hy = midY + (h - 1) * 34,
          hx = dx(0.28);
        ctx.fillStyle = walls[h % walls.length];
        ctx.fillRect(hx - 9, hy - 5, 18, 13);
        ctx.fillStyle = "#A9502F";
        ctx.beginPath();
        ctx.moveTo(hx - 11, hy - 5);
        ctx.lineTo(hx, hy - 13);
        ctx.lineTo(hx + 11, hy - 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#3A2E24";
        ctx.fillRect(hx - 2, hy + 2, 4, 6);
      }
      break;
    }
    case "windmill": {
      // two windmills with crossed sails
      for (let h = 0; h < 2; h++) {
        const hy = midY + (h - 0.5) * 46,
          hx = dx(0.34) - s * h * 9;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(hx - 6, hy - 8, 12, 18);
        ctx.fillStyle = "#8A5A3B";
        ctx.beginPath();
        ctx.moveTo(hx - 8, hy - 8);
        ctx.lineTo(hx, hy - 16);
        ctx.lineTo(hx + 8, hy - 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#F5EFE0";
        ctx.lineWidth = 2;
        for (let b = 0; b < 4; b++) {
          const a = (Math.PI / 4) * (1 + 2 * b) + land.seed;
          ctx.beginPath();
          ctx.moveTo(hx, hy - 10);
          ctx.lineTo(hx + Math.cos(a) * 12, hy - 10 + Math.sin(a) * 12);
          ctx.stroke();
        }
      }
      break;
    }
    case "beach": {
      // beach umbrellas on wide sand
      const tops = ["#FF5A4E", "#FFC93C", "#2E9BD6"];
      for (let h = 0; h < 3; h++) {
        const hy = midY + (h - 1) * 32,
          hx = dx(0.5) - s * (h % 2) * 10;
        ctx.strokeStyle = "#8A6A45";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy - 6);
        ctx.lineTo(hx, hy + 8);
        ctx.stroke();
        ctx.fillStyle = tops[h % tops.length];
        ctx.beginPath();
        ctx.arc(hx, hy - 4, 9, Math.PI, 0);
        ctx.fill();
      }
      break;
    }
    case "lighthouse": {
      // lone striped lighthouse with its light on
      const hx = dx(0.4),
        hy = midY;
      ctx.fillStyle = "rgba(255,222,120,0.35)";
      ctx.beginPath();
      ctx.arc(hx, hy - 16, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(hx - 5, hy - 12, 10, 26);
      ctx.fillStyle = "#D64541";
      ctx.fillRect(hx - 5, hy - 6, 10, 5);
      ctx.fillRect(hx - 5, hy + 4, 10, 5);
      ctx.fillStyle = "#FFDE78";
      ctx.fillRect(hx - 3, hy - 16, 6, 4);
      break;
    }
  }
}

// ------- power-ups -------
const P_EMOJI: Record<PowerType, string> = {
  freddo: "☕",
  souvlaki: "🥙",
  net: "🕸️",
  mati: "🧿",
  magnet: "🧲",
  frappe: "🥤",
};

function drawPower(ctx: Ctx, p: Power, t: number) {
  ctx.save();
  ctx.translate(p.x, p.y + Math.sin(t * 4 + p.x) * 3);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#FFC93C";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "19px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(P_EMOJI[p.type], 0, 2);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// Minimal control hint under the boat for the first seconds of a run.
function drawHint(ctx: Ctx, e: Engine) {
  const alpha = Math.min(1, 4 - e.elapsed); // solid until 3s, fades out by 4s
  if (alpha <= 0) return;
  ctx.font = "800 14px sans-serif";
  const pad = 14,
    tw = ctx.measureText(e.hint).width;
  const bw = tw + pad * 2,
    bh = 34;
  const bx = Math.max(8, Math.min(e.W - bw - 8, e.laneX - bw / 2));
  const by = e.playerY + 66;
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = "#062A4A";
  roundRect(ctx, bx, by, bw, bh, 17);
  ctx.fill();
  ctx.fillStyle = "#FFC93C";
  ctx.textAlign = "center";
  ctx.fillText(e.hint, bx + bw / 2, by + 22);
  // pulsing chevrons at the boat's sides
  const pulse = 4 + Math.sin(e.elapsed * 6) * 3;
  ctx.strokeStyle = "rgba(255,255,255," + 0.85 * alpha + ")";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    const cx = e.laneX + s * (58 + pulse);
    ctx.beginPath();
    ctx.moveTo(cx, e.playerY - 12);
    ctx.lineTo(cx + s * 10, e.playerY);
    ctx.lineTo(cx, e.playerY + 12);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawQuip(ctx: Ctx, e: Engine) {
  const quip = e.quip!;
  ctx.font = "800 14px sans-serif";
  const pad = 12,
    tw = ctx.measureText(quip.txt).width;
  const bw = tw + pad * 2,
    bh = 32;
  let bx = e.laneX - bw / 2;
  bx = Math.max(8, Math.min(e.W - bw - 8, bx)); // keep bubble clamped on-screen
  const by = e.playerY - 92;
  const a = Math.min(1, e.quipT * 3);
  ctx.globalAlpha = a;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  // bubble tail toward the rider
  ctx.beginPath();
  ctx.moveTo(e.laneX - 7, by + bh);
  ctx.lineTo(e.laneX + 7, by + bh);
  ctx.lineTo(e.laneX, by + bh + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#062A4A";
  ctx.textAlign = "center";
  ctx.fillText(quip.txt, bx + bw / 2, by + 21);
  ctx.globalAlpha = 1;
}

function drawHUD(ctx: Ctx, e: Engine) {
  const { W, H } = e;
  ctx.fillStyle = "rgba(6,42,74,0.55)";
  roundRect(ctx, 10, 10, W - 20, 54, 14);
  ctx.fill();
  ctx.fillStyle = "#FFC93C";
  ctx.font = "900 24px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("€" + e.eur(e.haulKg), 24, 44);
  ctx.fillStyle = "#EAF6FC";
  ctx.font = "700 12px sans-serif";
  ctx.fillText(e.haulKg.toFixed(1) + " kg · " + e.strings.hud.rate, 24, 58);
  // lives as drawn hearts (emoji in canvas are unreliable on mobile)
  for (let i = 0; i < 3; i++) {
    drawHeart(ctx, W - 32 - i * 26, 28, 9, 2 - i < e.lives ? "#FF5A4E" : "rgba(255,255,255,0.22)");
  }
  ctx.fillStyle = "#BFE0F5";
  ctx.font = "700 11px sans-serif";
  ctx.textAlign = "right";
  const island = e.currentIslandName();
  ctx.fillText(island + " · " + Math.floor(e.dist) + "m", W - 22, 57);
  // active effects
  const eff: string[] = [];
  if (e.freddoT > 0) eff.push("☕ " + e.strings.hud.invincible + " " + Math.ceil(e.freddoT));
  if (e.multT > 0) eff.push("🕸 ×2 " + Math.ceil(e.multT));
  if (e.matiT > 0) eff.push("🧿 " + Math.ceil(e.matiT));
  if (e.magnetT > 0) eff.push("🧲 " + Math.ceil(e.magnetT));
  if (e.comboMult() > 1) eff.push("🔥 ×" + e.comboMult());
  if (eff.length) {
    ctx.textAlign = "left";
    ctx.font = "700 13px sans-serif";
    let ex = 14;
    for (const s of eff) {
      const wid = ctx.measureText(s).width + 16;
      ctx.fillStyle = "rgba(255,201,60,0.92)";
      roundRect(ctx, ex, 72, wid, 24, 12);
      ctx.fill();
      ctx.fillStyle = "#062A4A";
      ctx.fillText(s, ex + 8, 89);
      ex += wid + 8;
    }
  }
  // island banner
  if (e.bannerT > 0) {
    ctx.globalAlpha = Math.min(1, e.bannerT);
    ctx.fillStyle = "rgba(255,201,60,0.95)";
    roundRect(ctx, W / 2 - 110, H * 0.3, 220, 52, 12);
    ctx.fill();
    ctx.fillStyle = "#062A4A";
    ctx.textAlign = "center";
    ctx.font = "900 22px sans-serif";
    ctx.fillText("🏝 " + e.bannerTxt, W / 2, H * 0.3 + 34);
    ctx.globalAlpha = 1;
  }
}

// Draw one full frame, same order as the prototype loop.
function drawObstacle(ctx: Ctx, o: Obstacle, t: number) {
  const r = o.r;
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.kind === "jelly") {
    // τσούχτρα: translucent violet bell + swaying tentacles
    ctx.fillStyle = "rgba(196,150,255,0.6)";
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 0);
    ctx.quadraticCurveTo(r, r * 0.35, 0, r * 0.45);
    ctx.quadraticCurveTo(-r, r * 0.35, -r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(196,150,255,0.75)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      const tx = i * r * 0.3;
      const sway = Math.sin(t * 4 + i + o.phase) * 4;
      ctx.beginPath();
      ctx.moveTo(tx, r * 0.25);
      ctx.quadraticCurveTo(tx + sway, r * 0.8, tx - sway, r * 1.35);
      ctx.stroke();
    }
  } else if (o.kind === "mine") {
    // sea mine: spiked dark sphere with a flashing red light
    ctx.strokeStyle = "#333A42";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      ctx.stroke();
    }
    ctx.fillStyle = "#3A4048";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    const blink = (Math.sin(t * 8 + o.phase) + 1) / 2;
    ctx.fillStyle = `rgba(255,70,55,${0.4 + blink * 0.6})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // reef rock: grey angular lump
    ctx.fillStyle = "#6B6357";
    ctx.beginPath();
    const pts = 7;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2 + o.phase;
      const rr = r * (0.8 + 0.35 * Math.abs(Math.sin(i * 2.3 + o.phase)));
      const px = Math.cos(a) * rr,
        py = Math.sin(a) * rr * 0.9;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 0.7, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function render(ctx: Ctx, e: Engine, t: number) {
  drawSea(ctx, e);
  if (e.land) drawLand(ctx, e);
  for (const p of e.powers) drawPower(ctx, p, t);
  for (const o of e.obstacles) drawObstacle(ctx, o, t);
  for (const f of e.fishes) drawFish(ctx, f, t);
  if (e.boss) drawBoss(ctx, e, t);
  drawPlayer(ctx, e, t);
  if (e.hint && e.elapsed < 4) drawHint(ctx, e);
  if (e.quip) drawQuip(ctx, e);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (const s of e.splashes) {
    ctx.globalAlpha = s.t / 0.6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const p of e.popups) {
    ctx.globalAlpha = Math.min(1, p.t * 2);
    ctx.fillStyle = p.col;
    ctx.font = "900 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  drawHUD(ctx, e);
}
