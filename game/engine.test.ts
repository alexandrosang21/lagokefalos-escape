// Engine mechanics tests: combo streak and the MEGA boss.
// The project has no test runner; these use Node's built-in one. Run with:
//   npx tsc game/engine.test.ts --outDir /tmp/lago-tests --module commonjs \
//     --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck
//   node /tmp/lago-tests/engine.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { Engine } from "./engine";
import { en } from "./strings.en";

// Deterministic engine on an empty sea; tests control every spawn by hand.
function mkEngine() {
  const e = new Engine({
    W: 390,
    H: 700,
    rng: () => 0.5,
    strings: en,
    onGameOver: () => {},
  });
  e.start(0);
  e.fishes = [];
  e.powers = [];
  return e;
}

// Push the engine's own timers far out so spawn()/quips never interfere.
function quiet(e: Engine) {
  e.spawnT = 999;
  e.powerT = 999;
  e.idleQuipT = 999;
}

// A bounty fish sitting right on the boat — caught on the next step.
function bounty(e: Engine, kg = 2) {
  e.fishes.push({ l: 1, x: e.laneCX(1), y: e.playerY, danger: false, kg, r: 20, flap: 0, drift: 0 });
}

let now = 0;
function tick(e: Engine) {
  now += 0.016;
  quiet(e);
  e.step(now);
}

test("catching bounty fish builds combo; ×1.5 kicks in at 8", () => {
  const e = mkEngine();
  for (let i = 0; i < 8; i++) {
    bounty(e);
    tick(e);
    assert.equal(e.fishes.length, 0, `fish ${i} should be caught`);
  }
  assert.equal(e.combo, 8);
  assert.equal(e.comboMult(), 1.5);
  const before = e.haulKg;
  bounty(e, 2);
  tick(e);
  assert.ok(Math.abs(e.haulKg - before - 3) < 1e-9, "2kg × 1.5 combo = 3kg");
});

test("a bite resets the combo", () => {
  const e = mkEngine();
  for (let i = 0; i < 3; i++) {
    bounty(e);
    tick(e);
  }
  assert.equal(e.combo, 3);
  e.fishes.push({ l: 1, x: e.laneCX(1), y: e.playerY, danger: true, kg: 10, r: 26, flap: 0, drift: 0 });
  tick(e);
  assert.equal(e.lives, 2);
  assert.equal(e.combo, 0);
});

test("the evil-eye charm blocks one bite and keeps the combo", () => {
  const e = mkEngine();
  for (let i = 0; i < 3; i++) {
    bounty(e);
    tick(e);
  }
  assert.equal(e.combo, 3);
  e.matiT = 8;
  e.fishes.push({ l: 1, x: e.laneCX(1), y: e.playerY, danger: true, kg: 10, r: 26, flap: 0, drift: 0 });
  tick(e);
  assert.equal(e.lives, 3, "shield absorbed the bite");
  assert.equal(e.matiT, 0, "shield is consumed");
  assert.equal(e.combo, 3, "combo survives");
});

test("the magnet pulls bounty fish across lanes toward the player", () => {
  const e = mkEngine();
  e.magnetT = 5;
  const startX = e.laneCX(0);
  e.fishes.push({ l: 0, x: startX, y: e.playerY - 220, danger: false, kg: 2, r: 20, flap: 0, drift: 0 });
  for (let i = 0; i < 5; i++) tick(e);
  const f = e.fishes[0];
  assert.ok(f, "fish still in play");
  assert.ok(f.x > startX + 20, "pulled toward the player's lane");
});

test("the magnet never moves danger fish", () => {
  const e = mkEngine();
  e.magnetT = 5;
  const startX = e.laneCX(0);
  e.fishes.push({ l: 0, x: startX, y: e.playerY - 220, danger: true, kg: 10, r: 26, flap: 0, drift: 0 });
  for (let i = 0; i < 5; i++) tick(e);
  assert.ok(Math.abs(e.fishes[0].x - startX) < 19, "danger fish stays in its lane band");
});

test("the MEGA boss appears on every 5th island, not on others", () => {
  const e = mkEngine();
  e.islandIdx = 4;
  e.nextIslandAt = 0;
  tick(e);
  assert.equal(e.islandIdx, 5);
  assert.ok(e.boss, "boss spawns at island 5");

  const e2 = mkEngine();
  e2.islandIdx = 1;
  e2.nextIslandAt = 0;
  tick(e2);
  assert.equal(e2.boss, null, "no boss at island 2");
});

test("a boss lunge through the player costs a life", () => {
  const e = mkEngine();
  e.boss = { x: e.laneX, y: e.playerY - 10, r: 54, targetLane: 1, state: "lunge", t: 0, lungesLeft: 2 };
  tick(e);
  assert.equal(e.lives, 2);
});

test("surviving all lunges pays hazard pay and clears the boss", () => {
  const e = mkEngine();
  e.islandIdx = 5;
  const before = e.haulKg;
  e.boss = { x: e.laneCX(1), y: e.H * 0.16 + 4, r: 54, targetLane: 1, state: "retreat", t: 0, lungesLeft: 1 };
  tick(e);
  assert.equal(e.boss, null, "boss defeated");
  assert.ok(e.haulKg > before, "hazard pay banked");
});
