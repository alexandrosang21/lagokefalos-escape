# Λαγοκέφαλος Escape — Game Design & Implementation Spec (v2)

> Viral browser game riffing on the Greek summer 2026 lagokefalos meme.
> **For Claude Code:** read this whole file, then start at §7 Build Order.
> A working single-file prototype exists: `lagokefalos-escape.html` — port its game engine, don't rewrite from scratch.

---

## 1. The Meme Context (why this is funny / timely)

- The lagokefalos (Lagocephalus sceleratus, "rabbit-head") is an invasive, toxic pufferfish from the Red Sea, now established across Greek seas (Crete/Dodecanese up to Attica).
- Summer 2026: unverified "attack on swimmers" TikTok videos went viral. ELKETHE (Hellenic Centre for Marine Research) said incidents are unconfirmed; WWF Greece: "the media exaggerated... it went viral for some reason."
- Peak absurdity: the Ministry put an official **bounty of €5.33/kilo** (European record), piloted in Crete & South Aegean.
- Hellenic Red Cross posted bite first-aid instructions. A lagokefalos-shaped cake went viral.
- Fishermen report 10–15 kg fish destroying nets.

**Design takeaway:** treat a fish like a national emergency. Bureaucratic absurdity (€5.33/kg receipts, "the Ministry thanks you") is the joke engine.

## 2. Core Concept

Endless lane-runner on water. Jet ski hops between Aegean islands; big lagokefaloi bite you (dodge), small ones are worth money (steer into them). Score displayed live in EUROS at €5.33/kg. Session: 30–90s, instant retry.

## 3. Mechanics — AS VALIDATED IN PROTOTYPE

### Controls (important — we iterated on this)
- **Finger-follow:** while touching, the jet ski moves to the lane under the finger. NOT swipe-based — swipe felt laggy.
- Simple tap = one lane toward tap side. Arrow keys on desktop.
- **Bug we hit:** mobile fires a synthetic `click` after `touchend` → double lane moves. Suppress click handling once touch is detected (`usedTouch` flag).
- Lane easing factor ~13/s feels snappy.

### Entities
- **Danger lagokefalos:** big (8–15 kg), grey-silver, mouth open. 62% of spawns.
- **Bounty lagokefalos:** small (1–4 kg), closed rabbit-smile, marked with €. Collect for kg.
- Spawn interval scales from 0.9s → 0.32s with distance.

### Fish art (critical for the joke)
The lagokefalos must read as "rabbit-faced": elongated silver body, dark spotted back stripe, white belly, blunt round snout facing the player, **two big buck teeth** (fused beak plates), big pale side eyes, forked tail. Prototype draws it in canvas; production should use **sprite PNGs** (design once: danger open-mouth + bounty closed-mouth variants, 2–3 animation frames each).

### Power-ups (spawn every 7–11s, bubble with emoji)
| Power-up | Effect (final tuned version) |
|---|---|
| ☕ Freddo | 3s: +35% speed AND invincible — smashing danger fish awards their full kg (💥). Golden aura on player. This is the best power-up on purpose (it's Greece). |
| 🥙 Souvlaki | +1 life (max 3); if full, +2 kg ("χορτάτος") |
| 🕸 Δίχτυ | ×2 kg on catches for 5s |
| 📱 TikTok camera | Fish slow to 22% speed for 2s ("they pose") |

Active effects shown as yellow pills under the HUD score.

### Quips (comedy layer — big win, keep it)
- Speech bubble above rider, ~2.2s, clamped inside screen.
- `BITE_QUIPS` on damage: «ΩΧ! Με δάγκωσε ρε!», «Αυτό θα το πω στο ΕΛΚΕΘΕ!», «Κάλεσε τον Ερυθρό Σταυρό!», «Το περιστατικό ΕΠΙΒΕΒΑΙΩΝΕΤΑΙ!»...
- `IDLE_QUIPS` every 8–15s: «€5,33 το κιλό, θα πλουτίσω!», «Πού είναι το freddo μου;», «Η θάλασσα ήταν ήσυχη... πολύ ήσυχη», «Καλύτερα από 8ωρο πάντως»...
- Keep quip arrays in a strings file — easy to expand, and enables EN localization later.

### Islands
- Chain: Κρήτη → Σαντορίνη → Ίος → Πάρος → Νάξος → Μύκονος → Τήνος → Άνδρος → Σύρος → Μήλος (loop).
- Checkpoint every 400m + 80m·index; banner + speed bump.
- **Coastline pass-by:** on each new island, a procedural landmass scrolls past on a random side — turquoise shallows, sand, greenery, white Cycladic houses with blue domes. Sells the "traveling" feeling. Production: could become parallax art per island.

### HUD gotcha
Emoji in canvas `fillText` renders inconsistently on mobile (hearts broke). **Draw UI glyphs as vector paths** (hearts are bezier shapes in prototype) or use DOM overlay for HUD in production.

### Fail state
3 bites → receipt screen: total € earned ("Επίσημη Απόδειξη Επικήρυξης"), kg, island reached, rotating joke message (Red Cross / ELKETHE / WWF / TikTok), name input, leaderboard, share button.

### Share
`navigator.share` → clipboard → `prompt()` fallback chain (in-app browsers block clipboard sometimes). Text: «Έπιασα Xkg λαγοκέφαλο = €Y από το κράτος 💰🐡 Μπορείς να με περάσεις;» Production: generate a share IMAGE (canvas → PNG) + OG meta tags per score URL.

## 4. STACK DECISION: Next.js (not Vite)

**Choice: Next.js (App Router) — one project, one deploy.** Reasons:
1. Better Auth plugs into Next.js API routes natively; Vite would need a separate backend server (two deploys, CORS, more moving parts).
2. Leaderboard + run submission need server routes with sanity checks anyway.
3. **OG image generation** (`next/og`) for share cards — huge for virality, trivial in Next, painful in plain Vite.
4. Game itself is a `"use client"` component; the canvas engine from the prototype ports 1:1. Next adds zero overhead to the game loop.

Vite would only win if this were a pure static toy with no auth/leaderboard — it isn't.

### Architecture
- **Next.js 15+ (App Router)** on Vercel free tier
- **Better Auth** with: `anonymous` plugin (instant play, no wall) + Google social login (link account to keep progress across devices)
- **Postgres** on Neon free tier, **Drizzle ORM**
- Tables: `user` (Better Auth managed), `runs(id, user_id, haul_kg, euros, island_idx, duration_s, created_at)`, view for daily + all-time leaderboards
- **API routes:** `POST /api/runs` (auth required, sanity check: kg/second plausible cap, rate limit), `GET /api/leaderboard?period=daily|all`
- **Never show login before first run.** Play → die → see € → "Σύνδεση για να σώσεις το ταμείο σου."

### Project layout
```
app/
  page.tsx              // landing + game (client component)
  api/auth/[...all]/route.ts   // Better Auth handler
  api/runs/route.ts
  api/leaderboard/route.ts
  og/[runId]/route.tsx  // share card image
lib/
  auth.ts, db.ts, schema.ts
game/
  engine.ts             // ported from prototype (loop, spawn, collide)
  render.ts             // canvas drawing (fish, land, player, quips)
  strings.el.ts, strings.en.ts
public/sprites/         // lagokefalos PNGs when ready
```

## 5. Virality Features
1. Share card image with € amount + rank (OG route)
2. Daily challenge: same spawn seed for all (seed = date string)
3. Global + daily leaderboard in €
4. EL default, EN toggle

## 6. Legal / taste
Parody only; no real logos/names/faces. Footer: "Παρωδία. Ο λαγοκέφαλος δεν τρώγεται." €5.33/kg is public policy — fine to reference.

## 7. Build Order for Claude Code
1. **Scaffold:** `create-next-app` (TS, App Router, Tailwind) + Drizzle + Neon + Better Auth (anonymous + Google). Verify auth roundtrip.
2. **Port the engine:** copy game logic from `lagokefalos-escape.html` into `game/engine.ts` + `game/render.ts`, mount in a client component. Keep ALL tuned values (speeds, spawn rates, easing 13, freddo rules, quip timings) — they're playtested.
3. **Persistence:** POST run on game over (anonymous session), leaderboard route + UI, link-account flow.
4. **Virality:** OG share image route, Web Share, daily seed, meta tags.
5. **Polish:** sprite PNGs replace canvas fish, sounds (bouzouki sting on island, gomp on bite, <100KB total), PWA manifest so it installs to home screen.

## 8. Known prototype learnings (do not regress)
- Suppress synthetic click after touch (double-move bug)
- No emoji in canvas HUD on mobile — vector or DOM
- Freddo must be reward, not trap (invincibility, not just speed)
- Quips are the personality — keep bubbles clamped on-screen
- Clipboard fails in some in-app browsers — keep 3-step share fallback
