"use client";

import { useEffect, RefObject } from "react";

/**
 * Google-Calendar-style wheel navigation: scrolling down inside the grid
 * moves to the next period, scrolling up to the previous one.
 *
 * Cells that can scroll their own overflow (marked `data-scrollable`) keep
 * their native scrolling until they hit their end, so a busy day still
 * scrolls internally before the month flips.
 */
export function useWheelPeriod(
  ref: RefObject<HTMLElement | null>,
  { onPrev, onNext, enabled = true }: { onPrev: () => void; onNext: () => void; enabled?: boolean },
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let locked = false;
    let accumulated = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (e: WheelEvent) => {
      // Trackpad horizontal gestures shouldn't change the period.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      // Let an overflowing day cell consume the scroll first.
      const inner = (e.target as HTMLElement)?.closest?.("[data-scrollable]") as HTMLElement | null;
      if (inner && inner.scrollHeight > inner.clientHeight + 1) {
        const atTop = inner.scrollTop <= 0;
        const atBottom = inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 1;
        if (!((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom))) return;
      }

      e.preventDefault();
      if (locked) return;

      accumulated += e.deltaY;
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { accumulated = 0; }, 250);

      // Threshold keeps a single trackpad flick from skipping two months.
      if (Math.abs(accumulated) < 45) return;

      (accumulated > 0 ? onNext : onPrev)();
      accumulated = 0;
      locked = true;
      setTimeout(() => { locked = false; }, 380);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [ref, onPrev, onNext, enabled]);
}
