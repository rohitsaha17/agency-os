import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "Agency Management Tool",
  description: "Full-scale creative agency management platform",
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
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
