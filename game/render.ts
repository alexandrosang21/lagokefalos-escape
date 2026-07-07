import { Engine, LANES, RATE } from "./engine";
import type { Fish, Power, PowerType } from "./types";

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

function drawSea(ctx: Ctx, e: Engine) {
  const { W, H, dist } = e;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#2E9BD6");
  g.addColorStop(1, "#0E5C99");
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

function drawLand(ctx: Ctx, e: Engine) {
  const land = e.land!;
  coastPath(ctx, e, 1.3);
  ctx.fillStyle = "rgba(140,224,229,0.55)"; // shallows
  ctx.fill();
  coastPath(ctx, e, 1);
  ctx.fillStyle = "#EAD9A8"; // sand
  ctx.fill();
  coastPath(ctx, e, 0.55);
  ctx.fillStyle = "#B9C98A"; // greenery
  ctx.fill();
  // Cycladic houses at the middle of the island
  const s = land.side,
    edge = s < 0 ? 0 : e.W,
    wMax = e.W * 0.16;
  const midY = land.y + land.len / 2;
  if (midY > -60 && midY < e.H + 60) {
    for (let h = 0; h < 3; h++) {
      const hy = midY + (h - 1) * 36,
        hx = edge - s * (wMax * 0.32 + h * 7);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(hx - 8, hy - 6, 16, 12);
      ctx.fillStyle = "#2C63A8";
      ctx.beginPath();
      ctx.arc(hx, hy - 6, 7, Math.PI, 0);
      ctx.fill();
    }
  }
}

// ------- power-ups -------
const P_EMOJI: Record<PowerType, string> = {
  freddo: "☕",
  souvlaki: "🥙",
  net: "🕸️",
  cam: "📱",
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
  ctx.fillText("€" + (e.haulKg * RATE).toFixed(2), 24, 44);
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
  const island = e.strings.islands[Math.min(e.islandIdx, e.strings.islands.length - 1)];
  ctx.fillText(island + " · " + Math.floor(e.dist) + "m", W - 22, 57);
  // active effects
  const eff: string[] = [];
  if (e.freddoT > 0) eff.push("☕ " + e.strings.hud.invincible + " " + Math.ceil(e.freddoT));
  if (e.multT > 0) eff.push("🕸 ×2 " + Math.ceil(e.multT));
  if (e.slowT > 0) eff.push("📱 " + e.strings.hud.pose);
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
export function render(ctx: Ctx, e: Engine, t: number) {
  drawSea(ctx, e);
  if (e.land) drawLand(ctx, e);
  for (const p of e.powers) drawPower(ctx, p, t);
  for (const f of e.fishes) drawFish(ctx, f, t);
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
