import type { MetadataRoute } from "next";

/** Install metadata only; Dartio makes no offline claim and registers no worker. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dartio — every dart tells a story",
    short_name: "Dartio",
    description: "Play, score, practise, and compete at darts from any screen.",
    start_url: "/play",
    scope: "/",
    display: "standalone",
    background_color: "#090a0a",
    theme_color: "#090a0a",
    categories: ["sports", "games"],
    icons: [
      { src: "/icons/dartio-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/dartio-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/dartio-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
