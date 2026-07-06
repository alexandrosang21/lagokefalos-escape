import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ΛΑΓΟΚΕΦΑΛΟΣ: Η Επικήρυξη",
    short_name: "Λαγοκέφαλος",
    description: "Κυνήγα την επικήρυξη των €5,33/κιλό στο Αιγαίο 🐡💰",
    start_url: "/",
    display: "fullscreen",
    orientation: "portrait",
    background_color: "#0B3E6F",
    theme_color: "#0B3E6F",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
