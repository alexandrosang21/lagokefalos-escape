import type { Metadata, Viewport } from "next";
import "./globals.css";

// Resolve the public origin for absolute OG/canonical URLs. Vercel injects
// VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL at build time, so this works with
// zero config; NEXT_PUBLIC_APP_URL is an explicit override (e.g. a custom domain).
function resolveAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

const APP_URL = resolveAppUrl();

const TITLE = "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη";
const DESCRIPTION =
  "Endless runner στο Αιγαίο: μάζεψε τους μικρούς λαγοκέφαλους, απόφυγε τους μεγάλους — €5,33 το κιλό από το κράτος. Δωρεάν, στο κινητό. Παρωδία.";
const OG_IMAGE = {
  url: "/og-cover.png",
  width: 1200,
  height: 630,
  alt: "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη — κυνήγα την επικήρυξη των €5,33/κιλό",
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Λαγοκέφαλος",
  keywords: ["λαγοκέφαλος", "lagokefalos", "παιχνίδι", "game", "Αιγαίο", "meme", "Ελλάδα"],
  category: "games",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Λαγοκέφαλος", statusBarStyle: "black-translucent" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: TITLE,
    locale: "el_GR",
    url: "/",
    title: TITLE,
    description: "Κυνήγα την επικήρυξη των €5,33/κιλό στο Αιγαίο 🐡💰",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Κυνήγα την επικήρυξη των €5,33/κιλό στο Αιγαίο 🐡💰",
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0B3E6F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
