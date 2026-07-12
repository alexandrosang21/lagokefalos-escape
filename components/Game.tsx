"use client";

import { GameAudio } from "@/game/audio";
import { Engine, RATE } from "@/game/engine";
import { drawFishPreview, render } from "@/game/render";
import { makeRng } from "@/game/rng";
import {
  bank,
  buy,
  effects as upgradeEffects,
  getLevels,
  getWallet,
  UPGRADES,
  type UpgradeDef,
} from "@/game/upgrades";
import { el } from "@/game/strings.el";
import { en } from "@/game/strings.en";
import type { GameStrings } from "@/game/types";
import { useCallback, useEffect, useRef, useState } from "react";

type Screen = "start" | "playing" | "over" | "shop";
type Lang = "el" | "en";

interface OverData {
  kg: number;
  euros: number;
  island: string;
  death: string;
  runId: string | null;
  rank: number | null;
  banked: number; // amount added to the persistent wallet this run
}

interface BoardRow {
  id: string;
  name: string;
  euros: number;
  me: boolean;
  hard: boolean;
  rank: number;
}

type BoardState =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "ready"; rows: BoardRow[]; you: BoardRow | null };

const STRINGS: Record<Lang, GameStrings> = { el, en };

// Mini canvas showing the real in-game fish art on the start screen.
function FishPreview({ danger }: { danger: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const SIZE = 72;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFishPreview(ctx, danger, SIZE);
  }, [danger]);
  return <canvas ref={ref} className="howto-canvas" style={{ width: 72, height: 72 }} />;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const usedTouchRef = useRef(false);
  const touchMovedRef = useRef(false);
  const nameRef = useRef("");
  const hardRef = useRef(false);
  const boardPeriodRef = useRef<"all" | "daily">("all");
  const runTokenRef = useRef<string | null>(null);
  const audioRef = useRef<GameAudio | null>(null);
  const shopFromRef = useRef<Screen>("start"); // where the shop was opened from

  const [screen, setScreen] = useState<Screen>("start");
  const [lang, setLang] = useState<Lang>("el");
  const [hard, setHard] = useState(false);
  const [best, setBest] = useState(0);
  const [name, setName] = useState("");
  const [over, setOver] = useState<OverData | null>(null);
  const [board, setBoard] = useState<BoardState>({ status: "loading" });
  const [boardPeriod, setBoardPeriod] = useState<"all" | "daily">("all");
  const [muted, setMuted] = useState(false);
  const [wallet, setWallet] = useState(0);
  const [levels, setLevels] = useState<Record<string, number>>({});

  const S = STRINGS[lang];
  const fmt = (n: number) => Math.round(n).toLocaleString(lang === "el" ? "el-GR" : "en-US");

  // persisted prefs — read after mount so server and client render the same HTML
  useEffect(() => {
    audioRef.current = new GameAudio();
    try {
      const l = localStorage.getItem("lago-lang");
      const storedName = localStorage.getItem("lago-name") ?? "";
      nameRef.current = storedName;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read needs post-mount setState
      if (l === "en" || l === "el") setLang(l);
      setBest(parseFloat(localStorage.getItem("lago-best") ?? "0") || 0);
      setName(storedName);
      setMuted(audioRef.current.muted);
      setWallet(getWallet());
      setLevels(getLevels());
    } catch {}
  }, []);

  const buyUpgrade = (def: UpgradeDef) => {
    if (buy(def)) {
      setWallet(getWallet());
      setLevels(getLevels());
    }
  };

  const toggleMute = () => {
    const a = audioRef.current;
    if (!a) return;
    a.resume(); // a tap on the button also unlocks audio
    setMuted(a.toggleMuted());
  };

  const toggleLang = () => {
    const next: Lang = lang === "el" ? "en" : "el";
    setLang(next);
    try {
      localStorage.setItem("lago-lang", next);
    } catch {}
  };

  // canvas sizing (DPR-aware, max width 520 like the prototype)
  const sizeCanvas = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return { W: 0, H: 0 };
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.min(window.innerWidth, 520);
    const H = window.innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    cv.getContext("2d")!.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { W, H };
  }, []);

  useEffect(() => {
    sizeCanvas();
    const onResize = () => {
      const { W, H } = sizeCanvas();
      engineRef.current?.resize(W, H);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sizeCanvas]);

  // ---- persistence ----

  const saveName = (n: string) => {
    setName(n);
    nameRef.current = n;
    try {
      localStorage.setItem("lago-name", n);
    } catch {}
  };

  // cache each period's board so flipping tabs is instant and doesn't re-hit the
  // DB every time; force=true refetches (used after a run changes the standings)
  const boardCacheRef = useRef<
    Partial<Record<"all" | "daily", { rows: BoardRow[]; you: BoardRow | null }>>
  >({});

  const loadBoard = useCallback(async (period: "all" | "daily", force = false) => {
    const cached = boardCacheRef.current[period];
    if (cached && !force) {
      setBoard({ status: "ready", rows: cached.rows, you: cached.you });
      return;
    }
    setBoard({ status: "loading" });
    try {
      const res = await fetch(`/api/leaderboard?period=${period}`);
      if (!res.ok) throw new Error("offline");
      const data = await res.json();
      const entry = { rows: data.rows as BoardRow[], you: (data.you ?? null) as BoardRow | null };
      boardCacheRef.current[period] = entry;
      setBoard({ status: "ready", rows: entry.rows, you: entry.you });
    } catch {
      setBoard({ status: "offline" });
    }
  }, []);

  const submitRun = useCallback(
    async (e: Engine): Promise<{ id: string; rank: number | null } | null> => {
      const token = runTokenRef.current;
      if (!token) return null; // offline or the start-token fetch failed
      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            haulKg: e.haulKg,
            islandIdx: e.islandIdx,
            durationS: e.elapsed,
            hard: hardRef.current,
            name: nameRef.current,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.id ? { id: data.id, rank: data.rank ?? null } : null;
      } catch {
        return null;
      }
    },
    []
  );

  const patchRunName = useCallback(async (runId: string, n: string) => {
    try {
      await fetch("/api/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runId, name: n }),
      });
    } catch {}
  }, []);

  // ---- game flow ----

  const handleGameOver = useCallback(
    async (e: Engine) => {
      audioRef.current?.stopMusic(); // fade the bed out on the receipt screen
      const strings = e.strings;
      const island = e.currentIslandName();
      const death = strings.deaths[Math.floor(Math.random() * strings.deaths.length)];
      const kg = e.haulKg;
      const euros = kg * RATE * e.euroMult;
      // bank a share of the haul into the persistent wallet (ΟΠΕΚΕΠΕ subsidy
      // boosts banking only, never the leaderboard score)
      const bankedAmt = Math.round(euros * upgradeEffects().subsidyMult * 100) / 100;
      bank(bankedAmt);
      setWallet(getWallet());
      setOver({ kg, euros, island, death, runId: null, rank: null, banked: bankedAmt });
      setScreen("over");
      setBest((prev) => {
        const b = Math.max(prev, kg);
        try {
          localStorage.setItem("lago-best", String(b));
        } catch {}
        return b;
      });
      const result = await submitRun(e);
      if (result) setOver((o) => (o ? { ...o, runId: result.id, rank: result.rank } : o));
      boardCacheRef.current = {}; // this run changed the standings — refetch fresh
      loadBoard(boardPeriodRef.current, true);
    },
    [submitRun, loadBoard]
  );

  const start = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || engineRef.current?.running) return;
    const { W, H } = sizeCanvas();
    const strings = STRINGS[(localStorage.getItem("lago-lang") as Lang) || "el"] ?? S;
    const audio = audioRef.current;
    audio?.resume(); // this START tap unlocks WebAudio on mobile
    audio?.startMusic(); // kick off the generative music bed
    const engine = new Engine({
      W,
      H,
      rng: makeRng(false),
      hard: hardRef.current,
      upgrades: upgradeEffects(),
      strings,
      onGameOver: () => handleGameOver(engine),
      hint: "ontouchstart" in window ? strings.hud.hintTouch : strings.hud.hintKeys,
      onSfx: audio ? (name) => audio.play(name) : undefined,
      onMusic: audio ? (theme) => audio.setMusicTheme(theme) : undefined,
      onMusicProgress: audio ? (level) => audio.setMusicProgress(level) : undefined,
    });
    engineRef.current = engine;
    setScreen("playing");
    // grab a signed start-time token so the server can measure the run's
    // real duration; without it (offline) the run just isn't submitted
    runTokenRef.current = null;
    fetch("/api/runs/start", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        runTokenRef.current = d?.token ?? null;
      })
      .catch(() => {});
    engine.start(performance.now() / 1000);
    const ctx = cv.getContext("2d")!;
    const frame = (ts: number) => {
      const t = ts / 1000;
      engine.step(t);
      render(ctx, engine, t);
      if (engine.running) rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [sizeCanvas, S, handleGameOver]);

  // ---- input ----

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const eng = () => engineRef.current;

    const onTouchStart = () => {
      usedTouchRef.current = true;
      touchMovedRef.current = false;
    };
    const onTouchMove = (ev: TouchEvent) => {
      touchMovedRef.current = true;
      const e = eng();
      if (!e?.running) return;
      const rect = cv.getBoundingClientRect();
      // finger-follow: the jet ski moves to the lane under the finger
      e.setLane(e.laneFromX(ev.touches[0].clientX - rect.left));
    };
    const onTouchEnd = (ev: TouchEvent) => {
      const e = eng();
      if (!e?.running) return;
      if (!touchMovedRef.current) {
        // simple tap = one lane toward the tap side
        const rect = cv.getBoundingClientRect();
        const x = ev.changedTouches[0].clientX - rect.left;
        e.setLane(e.lane + (x > e.W / 2 ? 1 : -1));
      }
    };
    // click only for desktop — on mobile the synthetic click after touchend
    // caused a double lane move (usedTouch flag suppresses it)
    const onClick = (ev: MouseEvent) => {
      const e = eng();
      if (usedTouchRef.current || !e?.running) return;
      const rect = cv.getBoundingClientRect();
      e.setLane(e.lane + (ev.clientX - rect.left > e.W / 2 ? 1 : -1));
    };
    const onKey = (ev: KeyboardEvent) => {
      const e = eng();
      if (!e?.running) return;
      const k = ev.key.toLowerCase();
      if (ev.key === "ArrowLeft" || k === "a") e.setLane(e.lane - 1);
      if (ev.key === "ArrowRight" || k === "d") e.setLane(e.lane + 1);
    };

    cv.addEventListener("touchstart", onTouchStart, { passive: true });
    cv.addEventListener("touchmove", onTouchMove, { passive: true });
    cv.addEventListener("touchend", onTouchEnd, { passive: true });
    cv.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      cv.removeEventListener("touchstart", onTouchStart);
      cv.removeEventListener("touchmove", onTouchMove);
      cv.removeEventListener("touchend", onTouchEnd);
      cv.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ---- share ----

  const share = async () => {
    if (!over) return;
    const text = S.ui.shareText(over.kg.toFixed(1), over.euros.toFixed(2));
    const url = over.runId
      ? `${window.location.origin}/r/${over.runId}`
      : window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch {
      /* user cancelled or blocked — fall through */
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      alert(S.ui.shareCopied);
    } catch {
      prompt(S.ui.shareManual, `${text} ${url}`);
    }
  };

  const again = async () => {
    const n = nameRef.current.trim().slice(0, 14);
    if (n && over?.runId) await patchRunName(over.runId, n);
    start();
  };

  // attach the typed name to the just-submitted run and refresh the board so the
  // player sees themselves ranked by name (empty name = stay anonymous)
  const registerName = async () => {
    const n = name.trim().slice(0, 14);
    if (n && over?.runId) {
      await patchRunName(over.runId, n);
      boardCacheRef.current = {}; // name changed on the board — refetch fresh
      loadBoard(boardPeriodRef.current, true);
    }
  };

  // mode toggles reused on the start screen and the receipt, so a player can
  // switch between Normal / Daily / Red Sea for their next run
  const modeToggles = (
    <label className="daily-row hard-row">
      <input
        type="checkbox"
        checked={hard}
        onChange={(e) => {
          setHard(e.target.checked);
          hardRef.current = e.target.checked;
        }}
      />
      {S.ui.hard}
    </label>
  );

  return (
    <>
      <div id="game-wrap">
        <canvas ref={canvasRef} />
      </div>

      {screen !== "playing" && (
        <button className="lang-btn" onClick={toggleLang}>
          {S.ui.langToggle}
        </button>
      )}

      {/* mute toggle stays visible during play so you can silence it mid-run;
          minimal vector icon, sits below the HUD counts on the right */}
      <button className="mute-btn" onClick={toggleMute} aria-label={muted ? "unmute" : "mute"}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          {muted ? (
            <path
              d="M16 9.5l4 5M20 9.5l-4 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <path
              d="M16 8.5a4.5 4.5 0 0 1 0 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </svg>
      </button>

      {screen === "start" && (
        <div className="overlay">
          <div className="eyebrow">{S.ui.presents}</div>
          <h1 className="game-title">
            {S.ui.title}
            <span className="sub">{S.ui.subtitle}</span>
          </h1>
          <div className="bounty">{S.ui.bounty}</div>
          <div className="howto">
            <div className="howto-card collect">
              <div className="howto-badge">✓</div>
              <FishPreview danger={false} />
              <div className="howto-title">{S.ui.howToCollect}</div>
              <div className="howto-sub">{S.ui.howToCollectSub}</div>
            </div>
            <div className="howto-card avoid">
              <div className="howto-badge">✗</div>
              <FishPreview danger={true} />
              <div className="howto-title">{S.ui.howToAvoid}</div>
              <div className="howto-sub">{S.ui.howToAvoidSub}</div>
            </div>
          </div>
          <div className="note">
            <b>{S.ui.howTo3}</b>
          </div>
          <button className="btn" onClick={start}>
            {S.ui.play}
          </button>
          {modeToggles}
          <button
            className="btn ghost"
            onClick={() => {
              shopFromRef.current = "start";
              setScreen("shop");
            }}
          >
            {S.ui.shop}
          </button>
          {wallet > 0 && <div className="stat wallet-line">{S.ui.wallet(fmt(wallet))}</div>}
          {best > 0 && (
            <div className="stat">
              {S.ui.bestPrefix((best * RATE).toFixed(2), best.toFixed(1))}
            </div>
          )}
          <div className="tiny">{S.ui.parody}</div>
        </div>
      )}

      {screen === "over" && over && (
        <div className="overlay">
          <div className="eyebrow">{S.ui.receipt}</div>
          <div className="euro-big">€{over.euros.toFixed(2)}</div>
          <div className="stat">{S.ui.haulLine(over.kg.toFixed(1))}</div>
          <div className="stat">{S.ui.islandLine(over.island)}</div>
          {over.rank !== null && <div className="stat">{S.ui.rankLine(over.rank)}</div>}
          <div className="stat wallet-line">
            {S.ui.wallet(fmt(wallet))}{" "}
            {over.banked > 0 && <span className="wallet-gain">+€{over.banked.toFixed(2)}</span>}
          </div>
          <div className="death">«{over.death}»</div>
          <div className="name-cta">
            <div className="name-cta-title">{S.ui.nameCTA}</div>
            <div className="name-row">
              <input
                className="name-in"
                maxLength={14}
                placeholder={S.ui.namePlaceholder}
                autoComplete="off"
                value={name}
                onChange={(e) => saveName(e.target.value)}
                onBlur={() => {
                  const n = name.trim().slice(0, 14);
                  if (n && over.runId) patchRunName(over.runId, n);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") registerName();
                }}
              />
              <button
                className="name-go"
                onClick={registerName}
                aria-label="ok"
                disabled={!name.trim()}
              >
                ✓
              </button>
            </div>
            <div className="name-skip">{S.ui.nameSkip}</div>
          </div>
          <div className="try-mode">
            <div className="try-mode-title">{S.ui.tryMode}</div>
            {modeToggles}
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              shopFromRef.current = "over";
              setScreen("shop");
            }}
          >
            {S.ui.shop}
          </button>
          <button className="btn" onClick={again}>
            {S.ui.again}
          </button>
          <button className="btn ghost" onClick={share}>
            {S.ui.share}
          </button>
          <div className="board">
            <h3>{S.ui.board}</h3>
            <div className="board-tabs" role="tablist">
              {(["daily", "all"] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={boardPeriod === p}
                  className={"board-tab" + (boardPeriod === p ? " active" : "")}
                  onClick={() => {
                    setBoardPeriod(p);
                    boardPeriodRef.current = p;
                    loadBoard(p);
                  }}
                >
                  {p === "daily" ? S.ui.boardToday : S.ui.boardAllTime}
                </button>
              ))}
            </div>
            <div>
              {board.status === "loading" && <div className="row">{S.ui.boardLoading}</div>}
              {board.status === "offline" && <div className="row">{S.ui.boardOffline}</div>}
              {board.status === "ready" &&
                (board.rows.length === 0 ? (
                  <div className="row">{S.ui.boardEmpty}</div>
                ) : (
                  <>
                    {board.rows.map((r) => (
                      <div key={r.id} className={"row" + (r.me ? " me" : "")}>
                        <span>
                          {r.rank}. {r.name} {r.hard && <span title="Ερυθρά Θάλασσα">🔴</span>}
                        </span>
                        <b>€{r.euros.toFixed(2)}</b>
                      </div>
                    ))}
                    {board.you && (
                      <div className="row me you-row">
                        <span>
                          {board.you.rank}. {board.you.name}{" "}
                          {board.you.hard && <span title="Ερυθρά Θάλασσα">🔴</span>}
                        </span>
                        <b>€{board.you.euros.toFixed(2)}</b>
                      </div>
                    )}
                  </>
                ))}
            </div>
          </div>
          <div className="tiny">{S.ui.parody}</div>
        </div>
      )}

      {screen === "shop" && (
        <div className="overlay">
          <div className="eyebrow">{S.ui.shopTitle}</div>
          <div className="wallet-big">{S.ui.wallet(fmt(wallet))}</div>
          <div className="shop-list">
            {UPGRADES.map((def) => {
              const lvl = levels[def.id] ?? 0;
              const cost = lvl < def.costs.length ? def.costs[lvl] : null;
              const maxed = cost === null;
              const tiered = def.costs.length > 1;
              const affordable = cost !== null && wallet >= cost;
              return (
                <div key={def.id} className={"shop-item" + (maxed ? " maxed" : "")}>
                  <div className="shop-emoji">{def.emoji}</div>
                  <div className="shop-info">
                    <div className="shop-name">
                      {lang === "el" ? def.el : def.en}
                      {tiered && (
                        <span className="shop-lvl">
                          {" "}
                          {lvl}/{def.costs.length}
                        </span>
                      )}
                    </div>
                    <div className="shop-desc">{lang === "el" ? def.elDesc : def.enDesc}</div>
                  </div>
                  <button
                    className={"shop-buy" + (affordable ? "" : " dim")}
                    disabled={maxed || !affordable}
                    onClick={() => buyUpgrade(def)}
                  >
                    {maxed ? (tiered ? S.ui.maxed : S.ui.owned) : `€${fmt(cost)}`}
                  </button>
                </div>
              );
            })}
          </div>
          <button className="btn" onClick={() => setScreen(shopFromRef.current)}>
            {S.ui.back}
          </button>
          <div className="tiny">{S.ui.parody}</div>
        </div>
      )}
    </>
  );
}
