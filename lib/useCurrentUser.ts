"use client";

import { useState, useEffect } from "react";

export interface CurrentUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
  avatarUrl: string | null;
  designation?: string | null;
  hasPassword?: boolean;
  /** The v3 job title. `blocksOwnDays` is the shoot crew's own-diary flag. */
  jobTitle?: {
    id: string;
    name: string;
    slug: string;
    blocksOwnDays: boolean;
    canBeAssignedWork: boolean;
  } | null;
  organization?: {
    id: string;
    name: string;
    logoUrl: string | null;
    currency?: string;
    timezone?: string;
    dateFormat?: string;
    onboardingCompleted?: boolean;
  } | null;
}

/**
 * Who is signed in — asked for by 24 components, fetched at most once.
 *
 * Two things were wrong with the obvious version of this.
 *
 * The module-level cache only helps the SECOND caller, and on a fresh page
 * load there is no second caller — the sidebar, the notification bell, the
 * capability guard and the page itself all mount on the same paint, all see
 * an empty cache, and all fire the same request. Four identical calls to an
 * endpoint that costs ~673ms, racing each other for the same answer. So the
 * cache now holds the in-flight PROMISE, not just the settled value, and
 * everyone after the first awaits the request already going out.
 *
 * The bigger cost was that this ran at all. Pages are written as
 * `useEffect(() => { if (user) load(); }, [user])`, which makes identity a
 * blocking hop in front of every page's real data: ~673ms of waiting before
 * the first useful request is even sent. But the dashboard layout is a server
 * component that has already resolved this exact user from the cookie in
 * order to decide whether to let you in. `primeCurrentUser` hands that down,
 * so on a fresh load the answer is present during the first render and the
 * page's own fetch starts immediately.
 *
 * Seeded or fetched, it is the same user resolved from the same httpOnly
 * cookie by the same server code. This changes when the answer arrives, not
 * what it is or who is allowed to ask.
 */
let cachedUser: CurrentUser | null = null;
let inFlight: Promise<CurrentUser | null> | null = null;

/** Seed the cache from the server-rendered layout. Safe to call repeatedly. */
export function primeCurrentUser(user: CurrentUser | null) {
  if (user && !cachedUser) cachedUser = user;
}

/** Drop the cached identity — for sign-out, or after changing your own profile. */
export function clearCurrentUser() {
  cachedUser = null;
  inFlight = null;
}

function loadCurrentUser(): Promise<CurrentUser | null> {
  if (cachedUser) return Promise.resolve(cachedUser);
  if (inFlight) return inFlight;

  inFlight = fetch("/api/users/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((data: CurrentUser | null) => {
      if (data && data.id) cachedUser = data;
      return cachedUser;
    })
    .catch(() => null)
    .finally(() => {
      // Let a later caller retry if this one came back empty.
      inFlight = null;
    });

  return inFlight;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);

  useEffect(() => {
    if (cachedUser) {
      // Seeded between this component's first render and its effect.
      if (!user) { setUser(cachedUser); setLoading(false); }
      return;
    }
    let alive = true;
    loadCurrentUser().then((data) => {
      if (!alive) return;
      if (data) setUser(data);
      setLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}
