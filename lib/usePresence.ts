"use client";

/**
 * Keeping something on screen long enough to leave.
 *
 * Every overlay in this app was written as `if (!open) return null`, which
 * makes opening and closing instant. On a desktop that reads as brisk. On a
 * phone, where a dialog is a sheet covering most of the screen, it reads as
 * the screen having been replaced — nothing says where the panel came from or
 * that it went back there.
 *
 * The problem with animating it is that React unmounts the component the
 * instant `open` flips, so there is nothing left to animate out. This is the
 * smallest fix: hold the element mounted for exactly as long as its exit
 * takes, and hand back a second flag saying which end of the transition it
 * should currently be drawn at.
 *
 *   const { mounted, shown } = usePresence(open);
 *   if (!mounted) return null;
 *   <div className={shown ? "translate-y-0" : "translate-y-full"} />
 *
 * WHY THE OPEN FLIP IS BELT AND BRACES
 *
 * A transition only runs when a property changes between two painted frames,
 * so the obvious implementation flips `shown` inside requestAnimationFrame.
 * That is correct right up until the frame never comes.
 *
 * And it doesn't, more often than you would guess: a browser that has
 * throttled the tab, a window occluded by another, an embedded webview that
 * has stopped painting. `document.visibilityState` still says "visible" in
 * several of those — this was caught with a page reporting exactly that while
 * rAF had not fired in half a second.
 *
 * The failure mode matters. `shown` gates OPACITY as well as position, so a
 * frame that never arrives leaves a mounted, invisible, focus-trapping dialog
 * over the page: somebody pressed a button and the app appears to have done
 * nothing. A missed animation is cosmetic; this is not.
 *
 * So a timer races the frame and whichever lands first opens the panel.
 * Timers are throttled in background tabs but they do fire, so there is no
 * state in which the panel is stuck closed. When frames are flowing normally
 * the rAF wins and the transition runs; when they are not, the panel appears
 * without motion, which is the right way for this to degrade.
 *
 * Reduced motion needs nothing here. The global block in globals.css collapses
 * every transition to effectively zero, so this still mounts, still unmounts,
 * and simply does not travel.
 */

import { useEffect, useState } from "react";

export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);

      let done = false;
      const reveal = () => {
        if (done) return;
        done = true;
        setShown(true);
      };

      // Two frames, because one is not reliably enough: the first lets the
      // element paint at its closed position, the second changes it, and a
      // transition needs the change to fall between two painted frames.
      const raf = requestAnimationFrame(() => requestAnimationFrame(reveal));
      // …and a timer that cannot be starved of frames. ~2 frames at 60fps.
      const fallback = setTimeout(reveal, 32);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(fallback);
      };
    }

    setShown(false);
    // Unmount after the exit has had time to run. If it is re-opened in the
    // meantime the cleanup cancels this, so a fast toggle never blanks out
    // mid-flight — it retargets from wherever it had got to.
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);

  return { mounted, shown };
}
