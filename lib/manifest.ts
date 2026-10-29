import type { MetadataRoute } from "next";

/** The web app manifest. `start` is where the installed app opens: an event's link keeps a Home Screen app on that event. */
export function manifestFor(start = "/"): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Qsina",
    short_name: "Qsina",
    description: "Qsina (koo-SEE-nah) queues up your pickleball tournament: check-in, live courts, playoffs and photos.",
    start_url: start,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f6f2",
    theme_color: "#f7f6f2",
    categories: ["sports", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
