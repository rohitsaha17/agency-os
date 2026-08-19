"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight live-sync bus so the Tasks board and My Calendar stay in
 * step without a websocket layer:
 *
 *  - BroadcastChannel → other tabs/pages in the same browser update instantly
 *  - a window event    → other components in the SAME page update instantly
 *  - focus/visibility  → refetch when the user comes back to the tab
 *  - a slow interval   → catches changes made by teammates
 */

const CHANNEL = "vsf-live";

export type LiveTopic = "tasks" | "calendar" | "all";

/** Call after any mutation that other views should see. */
export function broadcastChange(topic: LiveTopic = "all") {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ topic, at: Date.now() });
    bc.close();
  } catch { /* unsupported browser — the interval still covers it */ }
  try {
    window.dispatchEvent(new CustomEvent("vsf:live", { detail: { topic } }));
  } catch { /* ignore */ }
}

/** Re-run `onChange` whenever related data may have changed. */
export function useLiveRefresh(
  topics: LiveTopic[],
  onChange: () => void,
  intervalMs = 25_000,
) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = topics.join(",");

  useEffect(() => {
    const wanted = key.split(",") as LiveTopic[];
    const matches = (t?: LiveTopic) =>
      !t || t === "all" || wanted.includes("all") || wanted.includes(t);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e: MessageEvent) => { if (matches(e.data?.topic)) cb.current(); };
    } catch { /* ignore */ }

    const onLocal = (e: Event) => {
      if (matches((e as CustomEvent).detail?.topic)) cb.current();
    };
    const onWake = () => { if (document.visibilityState === "visible") cb.current(); };

    window.addEventListener("vsf:live", onLocal);
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const id = setInterval(onWake, intervalMs);

    return () => {
      bc?.close();
      window.removeEventListener("vsf:live", onLocal);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      clearInterval(id);
    };
  }, [key, intervalMs]);
}
