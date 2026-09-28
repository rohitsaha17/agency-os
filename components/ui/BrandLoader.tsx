"use client";

/* eslint-disable @next/next/no-img-element */

import { useCurrentUser } from "@/lib/useCurrentUser";
import { BrandLogo } from "./BrandLogo";

/**
 * The mark, with a ring travelling around it.
 *
 * A loading state is the one place motion is unambiguously worth it: nothing
 * else on screen can say "this is coming" and the alternative is a blank
 * panel that reads as broken. Everywhere else in this app the bar is higher.
 *
 * The ring is drawn in var(--glo-accent) with the app's indigo as the
 * fallback, so a themed workspace waits in its own colour and every other one
 * is unchanged. The mark in the middle is the workspace's own logo where we
 * have granted that, and ours otherwise — the same rule the sidebar follows,
 * so the thing you wait behind is the thing you arrive at.
 */
export function BrandLoader({
  label = "Loading",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const { user } = useCurrentUser();
  const org = user?.organization;
  const own = org?.whiteLabel && org.logoUrl ? org.logoUrl : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <div className="relative w-16 h-16">
        <svg
          viewBox="0 0 64 64"
          className="brand-loader-ring absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          {/* The track, so the arc reads as travelling rather than flickering */}
          <circle
            cx="32" cy="32" r="28" fill="none" strokeWidth="3"
            stroke="currentColor"
            className="text-gray-200 dark:text-white/[0.10]"
          />
          {/* r=28 → circumference ~175.9; 132 of it hidden leaves a quarter arc */}
          <circle
            cx="32" cy="32" r="28" fill="none" strokeWidth="3"
            strokeLinecap="round"
            stroke="var(--glo-accent, #6366f1)"
            strokeDasharray="176"
            strokeDashoffset="132"
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          {own ? (
            <img
              src={own}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="w-8 h-8 object-contain select-none"
            />
          ) : (
            // tone="onLight" is the black mark; inverted back to white in dark.
            <BrandLogo tone="onLight" className="w-7 h-7 dark:invert" />
          )}
        </div>
      </div>

      <span className="sr-only">{label}</span>
    </div>
  );
}
