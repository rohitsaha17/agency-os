"use client";

/**
 * Puts the workspace's theme class on <html>.
 *
 * WHY THIS IS NOT JUST A className
 *
 * Only the ROOT layout renders <html>, and it does not know the tenant — it
 * wraps /login and /onboarding too, where nobody is signed in yet. Resolving
 * the organization up there would mean a database round trip on every page
 * including the ones with no user, to answer a question only the dashboard
 * asks.
 *
 * The dashboard layout already loads the user and their organization, so the
 * value is free there. What it cannot do is reach back up and change an
 * <html> tag the server has already streamed. This writes it instead, from a
 * value the SERVER decided.
 *
 * WHY IT CANNOT GO ON A WRAPPER DIV
 *
 * Two components render through createPortal into document.body — the Select
 * dropdown panel and the task-row menu. Both would escape any wrapper and
 * render unthemed, which is exactly the sort of half-styled surface that
 * makes a tenant theme look broken. The class has to be above them.
 *
 * WHY THERE ARE TWO MECHANISMS, NOT ONE
 *
 * This used to be the inline script alone, and it failed on the single most
 * common way into the app: signing in. The login page calls router.push("/"),
 * which is a CLIENT navigation — React creates the script element rather than
 * the browser parsing it, and a script inserted that way never executes. So
 * whoever had just signed in got the default theme until they happened to
 * reload, which is the one thing nobody does when a page has just loaded.
 *
 * The script covers the hard load: it runs during HTML parse, before the
 * markup below it paints, so there is no flash of the wrong theme. The layout
 * effect covers every client navigation, and runs before paint too.
 *
 * Both are idempotent — each removes every known theme class before adding
 * the right one — so the two running in either order on a hard load is fine.
 *
 * NOT FROM STORAGE
 *
 * The value is interpolated from the server's answer and nothing else. It is
 * never read from localStorage: storage is per-browser, so a theme left there
 * by one workspace's user would outlive their session and greet whoever signs
 * in next on that machine.
 *
 * `theme` arrives already narrowed by resolveTheme, so the only strings that
 * can appear are ones lib/theme.ts names.
 */

import { useEffect, useLayoutEffect } from "react";
import { ALL_THEME_CLASSES, themeClass, type WorkspaceTheme } from "@/lib/theme";

/**
 * useLayoutEffect on the client, useEffect on the server.
 *
 * The class has to land before paint or the page flashes the wrong theme,
 * which is what useLayoutEffect is for — but React warns when it runs during
 * server rendering, and this component IS server-rendered for the hard-load
 * case. On the server the effect does nothing either way.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function WorkspaceThemeClass({ theme }: { theme: WorkspaceTheme }) {
  const applied = themeClass(theme);

  useBeforePaint(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL_THEME_CLASSES);
    if (applied) root.classList.add(applied);

    // Leaving the dashboard leaves the theme behind with it. Without this a
    // client navigation out to /set-password would keep a tenant's colours on
    // a page that is not theirs.
    return () => root.classList.remove(...ALL_THEME_CLASSES);
  }, [applied]);

  const script =
    `(function(){try{var r=document.documentElement;` +
    `r.classList.remove(${ALL_THEME_CLASSES.map((c) => JSON.stringify(c)).join(",")});` +
    (applied ? `r.classList.add(${JSON.stringify(applied)});` : ``) +
    `}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
