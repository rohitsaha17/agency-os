"use client";

import { useRouter } from "next/navigation";

/** Signs the user out and returns them to the login screen. */
export function LogoutButton({ className, label = "Sign out" }: { className?: string; label?: string }) {
  const router = useRouter();
  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    router.push("/login");
    router.refresh();
  };
  return (
    <button type="button" onClick={logout} className={className}>
      {label}
    </button>
  );
}
