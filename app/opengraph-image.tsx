import { loadGreekFont, OG_SIZE, ogCard } from "@/lib/og";
import { ImageResponse } from "next/og";

export const alt = "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const eyebrow = "Υπουργείο Αγροτικής Ανάπτυξης παρουσιάζει*";
  const big = "€5,33/kg";
  const line1 = "ΛΑΓΟΚΕΦΑΛΟΣ: Η ΕΠΙΚΗΡΥΞΗ";
  const line2 = "Απόφυγε τους μεγάλους. Μάζεψε τους μικρούς. Πλούτισε.";
  const footer = "*Παρωδία 🐡";

  const font = await loadGreekFont(eyebrow + big + line1 + line2 + footer);

  return new ImageResponse(ogCard({ eyebrow, big, line1, line2, footer }), {
    ...OG_SIZE,
    fonts: font
      ? [{ name: "NotoSans", data: font, weight: 900 as const, style: "normal" as const }]
      : undefined,
  });
}
