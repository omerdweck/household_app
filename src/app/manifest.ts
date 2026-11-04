import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest — this is what makes the site installable
// as an app ("Add to Home Screen") on iPhone and Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "משק הבית",
    short_name: "משק הבית",
    description: "ניהול הוצאות, תקציב, לו״ז וקניות לשני בני הזוג",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
