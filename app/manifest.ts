import type { MetadataRoute } from "next";

/**
 * Web app manifest — what a phone reads when someone installs Studio Flow.
 *
 * Served from /manifest.webmanifest; Next builds the route from this file, so
 * the icon paths and the name live in one typed place rather than in a JSON
 * blob nobody remembers to update.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Studio Flow",
    // Home screens truncate at roughly 12 characters, and "Studio Flow" is
    // eleven — so the short name is the full name, not an abbreviation.
    short_name: "Studio Flow",
    description:
      "Run your creative agency on one flow — clients, projects, tasks, quotes, invoices, files and more.",
    id: "/",
    start_url: "/",
    // Where an install lands: the dashboard, not the marketing page. The
    // people who install this are signed in.
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // Matches the sidebar's brand chip, so the splash and the status bar are
    // the same indigo as the app it opens into.
    theme_color: "#4f46e5",
    background_color: "#0f172a",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable is separate on purpose: launchers crop to a circle or a
      // squircle, and cropping the `any` icon would cut the mark.
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today's tasks", url: "/tasks" },
      { name: "Approvals", url: "/approvals" },
      { name: "Team calendar", url: "/calendar" },
    ],
  };
}
