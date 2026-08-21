"use client";

/**
 * Registers the service worker, which is what makes Studio Flow installable.
 *
 * Registration is deliberately late — after `load` — so it never competes with
 * the first render for bandwidth. It is also skipped in development, where a
 * worker caching build output between hot reloads causes exactly the kind of
 * "why am I seeing the old page" confusion that is impossible to debug.
 */

import { useEffect } from "react";

export function ServiceWorkerProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unregistered worker costs the install prompt, not the app.
        // Nothing here is worth interrupting anyone over.
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
