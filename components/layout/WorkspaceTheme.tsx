/**
 * Puts the workspace's theme class on <html>, server-side.
 *
 * WHY A SCRIPT AND NOT A className
 *
 * Only the ROOT layout renders <html>, and the root layout does not know the
 * tenant — it wraps /login and /onboarding too, where nobody is signed in
 * yet. Resolving the organization up there would mean a database round trip
 * on every page including the ones that have no user, to answer a question
 * only the dashboard asks.
 *
 * The dashboard layout already loads the user and their organization, so the
 * value is free there. What it cannot do is reach back up and change an
 * <html> tag the server has already streamed. This writes it instead, from a
 * value the SERVER decided, embedded in the document.
 *
 * WHY IT CANNOT GO ON A WRAPPER DIV INSTEAD
 *
 * Two components render through createPortal into document.body — the Select
 * dropdown panel and the task-row menu. Both would escape any wrapper and
 * render unthemed, which is exactly the sort of half-styled surface that
 * makes a tenant theme look broken. The class has to be above them.
 *
 * NO FLASH
 *
 * The script runs during HTML parse, before the dashboard's own markup below
 * it has been painted. It is the same technique the root layout already uses
 * to apply dark mode before React hydrates.
 *
 * NOT FROM STORAGE
 *
 * The value is interpolated from the server's answer and nothing else. It is
 * never read from localStorage: storage is per-browser, so a theme left there
 * by one workspace's user would outlive their session and greet whoever signs
 * in next on that machine. Stale classes are removed before the right one is
 * added, so a bfcache restore cannot leave a previous tenant's theme behind.
 *
 * `theme` reaches this already narrowed by resolveTheme, so the only strings
 * that can appear are ones lib/theme.ts names.
 */

import { ALL_THEME_CLASSES, themeClass, type WorkspaceTheme } from "@/lib/theme";

export function WorkspaceThemeClass({ theme }: { theme: WorkspaceTheme }) {
  const applied = themeClass(theme);

  const script =
    `(function(){try{var r=document.documentElement;` +
    `r.classList.remove(${ALL_THEME_CLASSES.map((c) => JSON.stringify(c)).join(",")});` +
    (applied ? `r.classList.add(${JSON.stringify(applied)});` : ``) +
    `}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
