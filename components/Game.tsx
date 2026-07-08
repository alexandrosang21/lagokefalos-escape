"use client";

import { GameAudio } from "@/game/audio";
import { Engine, RATE } from "@/game/engine";
import { dailyIslandOrder } from "@/game/islands";
import { drawFishPreview, render } from "@/game/render";
import { dailySeedString, makeRng } from "@/game/rng";
import { el } from "@/game/strings.el";
import { en } from "@/game/strings.en";
import type { GameStrings } from "@/game/types";
import { useCallback, useEffect, useRef, useState } from "react";

type Screen = "start" | "playing" | "over";
type Lang = "el" | "en";

interface OverData {
  kg: number;
  euros: number;
  island: string;
  death: string;
  runId: string | null;
  rank: number | null;
}

interface BoardRow {
  id: string;
  name: string;
  euros: number;
  me: boolean;
}

type BoardState =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "ready"; rows: BoardRow[] };

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
  const dailyRef = useRef(false);
  const boardPeriodRef = useRef<"all" | "daily">("all");
  const runTokenRef = useRef<string | null>(null);
  const audioRef = useRef<GameAudio | null>(null);

  const [screen, setScreen] = useState<Screen>("start");
  const [lang, setLang] = useState<Lang>("el");
  const [daily, setDaily] = useState(false);
  const [best, setBest] = useState(0);
  const [name, setName] = useState("");
  const [over, setOver] = useState<OverData | null>(null);
  const [board, setBoard] = useState<BoardState>({ status: "loading" });
  const [boardPeriod, setBoardPeriod] = useState<"all" | "daily">("all");
  const [muted, setMuted] = useState(false);

  const S = STRINGS[lang];

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
    } catch {}
  }, []);

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

  const loadBoard = useCallback(async (period: "all" | "daily") => {
    setBoard({ status: "loading" });
    try {
      const res = await fetch(`/api/leaderboard?period=${period}`);
      if (!res.ok) throw new Error("offline");
      const data = await res.json();
      setBoard({ status: "ready", rows: data.rows });
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
            daily: dailyRef.current,
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
      setOver({ kg, euros: kg * RATE, island, death, runId: null, rank: null });
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
      loadBoard(boardPeriodRef.current);
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
      rng: makeRng(dailyRef.current),
      // daily challenge shuffles the island route by day-seed; free-play keeps
      // the canonical Crete-first order
      islandOrder: dailyRef.current ? dailyIslandOrder(dailySeedString()) : undefined,
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
          <label className="daily-row">
            <input
              type="checkbox"
              checked={daily}
              onChange={(e) => {
                setDaily(e.target.checked);
                dailyRef.current = e.target.checked;
              }}
            />
            {S.ui.daily}
          </label>
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
          <div className="death">«{over.death}»</div>
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
          />
          <button className="btn" onClick={again}>
            {S.ui.again}
          </button>
          <button className="btn ghost" onClick={share}>
            {S.ui.share}
          </button>
          <div className="board">
            <h3>
              {S.ui.board}{" "}
              <button
                onClick={() => {
                  const p = boardPeriod === "all" ? ("daily" as const) : ("all" as const);
                  setBoardPeriod(p);
                  boardPeriodRef.current = p;
                  loadBoard(p);
                }}
                style={{
                  float: "right",
                  background: "none",
                  border: "none",
                  color: "#7fb4d8",
                  cursor: "pointer",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {boardPeriod === "all" ? (lang === "el" ? "σήμερα ▸" : "today ▸") : lang === "el" ? "όλα ▸" : "all ▸"}
              </button>
            </h3>
            <div>
              {board.status === "loading" && <div className="row">{S.ui.boardLoading}</div>}
              {board.status === "offline" && <div className="row">{S.ui.boardOffline}</div>}
              {board.status === "ready" &&
                (board.rows.length === 0 ? (
                  <div className="row">{S.ui.boardEmpty}</div>
                ) : (
                  board.rows.map((r, i) => (
                    <div key={r.id} className={"row" + (r.me ? " me" : "")}>
                      <span>
                        {i + 1}. {r.name}
                      </span>
                      <b>€{r.euros.toFixed(2)}</b>
                    </div>
                  ))
                ))}
            </div>
          </div>
          <div className="tiny">{S.ui.parody}</div>
        </div>
      )}
    </>
  );
}
