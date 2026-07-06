import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη",
  description:
    "Απόφυγε τους μεγάλους λαγοκέφαλους, μάζεψε τους μικρούς — €5,33 το κιλό από το κράτος. Παρωδία.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη",
    description: "Κυνήγα την επικήρυξη των €5,33/κιλό στο Αιγαίο 🐡💰",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη",
    description: "Κυνήγα την επικήρυξη των €5,33/κιλό στο Αιγαίο 🐡💰",
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
