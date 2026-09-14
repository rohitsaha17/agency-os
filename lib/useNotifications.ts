"use client";

import { useEffect, useState } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * One notification feed, however many bells are on screen.
 *
 * The sidebar mounts NotificationBell three times — the mobile header, the
 * collapsed rail and the expanded rail — because only one is visible at a
 * time. All three mount regardless. Each had its own `useEffect` fetching
 * `/api/notifications?limit=15` and its own 60-second `setInterval`, so a
 * page load made three identical requests and the app then polled the same
 * endpoint three times a minute, forever, to render one badge.
 *
 * The state lives here instead: one request, one interval, shared by every
 * subscriber. The interval is refcounted, so it starts with the first bell
 * and stops with the last rather than lingering after the sidebar unmounts.
 *
 * Optimistic updates (marking one read, marking all read) call `patch`, which
 * updates every mounted bell at once — previously each instance kept its own
 * copy and only the one you clicked would change.
 */

type State = { items: NotificationItem[]; unreadCount: number };

let state: State = { items: [], unreadCount: 0 };
let inFlight: Promise<void> | null = null;
let subscribers = new Set<(s: State) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function emit() {
  const snapshot = state;
  subscribers.forEach((fn) => fn(snapshot));
}

function load(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/notifications?limit=15")
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { notifications?: NotificationItem[]; unreadCount?: number } | null) => {
      if (!data) return;
      state = {
        items: Array.isArray(data.notifications) ? data.notifications : state.items,
        unreadCount: typeof data.unreadCount === "number" ? data.unreadCount : state.unreadCount,
      };
      emit();
    })
    .catch(() => { /* a failed poll is not worth surfacing in a badge */ })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Apply a local change to the shared feed — every bell updates together. */
export function patchNotifications(fn: (s: State) => State) {
  state = fn(state);
  emit();
}

export function refreshNotifications() {
  return load();
}

export function useNotifications() {
  const [local, setLocal] = useState<State>(state);

  useEffect(() => {
    subscribers.add(setLocal);
    setLocal(state);
    load();

    // First bell starts the poll; last one out stops it.
    if (!timer) {
      timer = setInterval(() => {
        // A hidden tab has nobody to notify.
        if (document.visibilityState === "visible") load();
      }, 60_000);
    }

    return () => {
      subscribers.delete(setLocal);
      if (subscribers.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return { items: local.items, unreadCount: local.unreadCount, refresh: load };
}
