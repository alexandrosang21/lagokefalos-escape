import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

// Satori's built-in font has no Greek glyphs, so fetch a subset TTF from
// Google Fonts containing exactly the glyphs of this card's text.
export async function loadGreekFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans:wght@900&text=${encodeURIComponent(
      text
    )}`;
    const css = await (await fetch(url)).text();
    const resource = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!resource) return null;
    const res = await fetch(resource[1]);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export function ogCard(opts: {
  eyebrow: string;
  big: string;
  line1: string;
  line2: string;
  footer: string;
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #062A4A 0%, #0B3E6F 55%, #1273B5 100%)",
        color: "#fff",
        fontFamily: "NotoSans, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 28,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#FFC93C",
          marginBottom: 18,
        }}
      >
        {opts.eyebrow}
      </div>
      <div style={{ fontSize: 160, fontWeight: 900, color: "#FFC93C", lineHeight: 1 }}>
        {opts.big}
      </div>
      <div style={{ fontSize: 40, color: "#EAF6FC", marginTop: 22 }}>{opts.line1}</div>
      <div style={{ fontSize: 30, color: "#BFE0F5", marginTop: 8 }}>{opts.line2}</div>
      <div
        style={{
          marginTop: 44,
          background: "#FFC93C",
          color: "#062A4A",
          fontSize: 32,
          fontWeight: 900,
          padding: "14px 34px",
          borderRadius: 999,
          transform: "rotate(-2deg)",
        }}
      >
        {opts.footer}
      </div>
    </div>
  );
}
