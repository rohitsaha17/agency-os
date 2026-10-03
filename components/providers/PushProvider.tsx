"use client";

/**
 * Web Push opt-in.
 *
 * Browsers only let a site ask for notification permission from a user
 * gesture, and only show a prompt once — so this shows a small, dismissible
 * card first ("Turn on notifications"), and the real browser prompt appears
 * when the person taps Enable. Once allowed, the subscription is saved to the
 * server (lib/push.ts delivers to it).
 *
 * It renders nothing when: push isn't configured on the server (no VAPID key),
 * the browser can't do push, permission is already granted (it just refreshes
 * the subscription silently) or denied, the person dismissed the card, or — on
 * iOS — the app isn't installed to the home screen, since iOS only does web
 * push for an installed PWA.
 */

import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";

const DISMISS_KEY = "vsf:push:dismissed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribeAndSave(key: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Cast: the DOM lib types applicationServerKey as a strict ArrayBuffer-backed
    // BufferSource; our Uint8Array is one at runtime.
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  }));
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok;
}

export function PushProvider() {
  const [vapidKey, setVapidKey] = useState<string>("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Matches ServiceWorkerProvider: the worker only registers in production.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    // iOS only delivers web push to an installed (standalone) PWA, and only
    // then will it even show the permission prompt.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isIOS && !standalone) return;

    let cancelled = false;
    (async () => {
      const key: string = await fetch("/api/push/public-key")
        .then((r) => r.json())
        .then((d) => (typeof d?.key === "string" ? d.key : ""))
        .catch(() => "");
      if (cancelled || !key) return; // push not configured on the server
      setVapidKey(key);

      if (Notification.permission === "denied") return;
      if (Notification.permission === "granted") {
        // Already allowed — make sure this device is registered server-side.
        subscribeAndSave(key).catch(() => {});
        return;
      }
      // permission === "default": offer it, unless they said no before.
      try { if (localStorage.getItem(DISMISS_KEY) === "1") return; } catch { /* ignore */ }
      setShow(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted" && vapidKey) await subscribeAndSave(vapidKey);
    } catch { /* ignore */ }
    setBusy(false);
    setShow(false);
  }, [vapidKey]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 z-40 flex justify-center px-3 pointer-events-none
                    bottom-[calc(var(--bottomnav-h)+0.5rem+var(--safe-bottom))] lg:bottom-4">
      <div className="nav-chrome pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-2xl bg-slate-900 text-white border border-white/10 shadow-lg shadow-black/40 px-4 py-3">
        <span className="flex-shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <Bell className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Turn on notifications</p>
          <p className="text-xs text-slate-400 leading-snug">Get tasks, approvals and messages on this device.</p>
        </div>
        <button onClick={dismiss} className="flex-shrink-0 text-xs text-slate-400 hover:text-slate-200 px-2 py-1">
          Not now
        </button>
        <button
          onClick={enable}
          disabled={busy}
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-60 bg-[var(--glo-accent,#6366f1)]"
        >
          {busy ? "…" : "Enable"}
        </button>
      </div>
    </div>
  );
}
