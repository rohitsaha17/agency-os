import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ServiceWorkerProvider } from "@/components/providers/ServiceWorkerProvider";

export const metadata: Metadata = {
  // The installed app is "Studio Flow" — that is what fits under an icon and
  // what people call it. The full name stays as the title template so a
  // browser tab still says whose it is.
  title: {
    default: "Studio Flow",
    template: "%s · Studio Flow",
  },
  applicationName: "Studio Flow",
  description:
    "Run your creative agency on one flow — clients, projects, tasks, quotes, invoices, files and more.",
  // Next generates /manifest.webmanifest from app/manifest.ts and links it
  // automatically; naming it here keeps it explicit.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Studio Flow",
    // Translucent, so the app's own dark chrome runs up behind the clock
    // instead of leaving a white band above the header. Safe here because
    // .appbar reserves --safe-top for exactly this.
    statusBarStyle: "black-translucent",
  },
  // iOS home-screen apps have no browser chrome to go back with, and a
  // detected phone number turning into a link inside an invoice is worse
  // than useless.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Matches the manifest and the sidebar chip, so the phone's status bar and
  // the splash screen are the same indigo the app opens into.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  // Edge to edge. The app bar, the drawer, the full-height panes and the
  // modals all pad themselves off --safe-* now (see globals.css), so the page
  // can paint into the notch and the home-indicator strip without anything
  // ending up underneath them.
  viewportFit: "cover",
};

/*
 * Inline script injected BEFORE React hydrates.
 * Reads localStorage and sets .dark on <html> immediately —
 * eliminates the "flash of wrong theme" on first load.
 */
const themeInitScript = `
try {
  var t = localStorage.getItem('theme');
  var p = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (t === 'dark' || (!t && p)) {
    document.documentElement.classList.add('dark');
  }
} catch(e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * suppressHydrationWarning: React will reconcile the server-rendered
     * HTML with the client even if .dark was added by the script above,
     * avoiding a mismatch warning.
     */
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Next emits the standardised `mobile-web-app-capable`. iOS before
          16.4 only understands the legacy spelling, and without it "Add to
          Home Screen" opens Studio Flow in a Safari tab with the address bar
          rather than as an app. Costs one tag; nothing newer is harmed by it.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerProvider />
      </body>
    </html>
  );
}
