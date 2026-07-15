"use client";

import { useState, useEffect } from "react";

export interface CurrentUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
  avatarUrl: string | null;
  organization?: {
    id: string;
    name: string;
    logoUrl: string | null;
  } | null;
}

let cachedUser: CurrentUser | null = null;

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);

  useEffect(() => {
    if (cachedUser) return;
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.id) {
          cachedUser = data;
          setUser(data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
