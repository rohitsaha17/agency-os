"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cake, Award } from "lucide-react";
import { countdown, noticeForOthers, noticeForSelf, type Celebration } from "@/lib/celebrations";

type Payload = { today: Celebration[]; upcoming: Celebration[]; meId: string };

/**
 * Whose day it is, on everyone's dashboard.
 *
 * Small on purpose. It sits above a page about work and is not work, so it
 * earns one line per person and disappears entirely in a week when nobody is
 * celebrating — an empty "No birthdays this week" card every week is the kind
 * of clutter that teaches people to stop reading a region of the screen.
 *
 * The person celebrating is greeted; everyone else is told. Being informed of
 * your own birthday in the third person is a small thing that reads as the
 * software not knowing who you are.
 */
export function CelebrationsCard() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/celebrations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setData(d); })
      .catch(() => { /* a quiet card is better than an error where it was */ });
    return () => { alive = false; };
  }, []);

  if (!data || (!data.today.length && !data.upcoming.length)) return null;

  const mine = data.today.filter((c) => c.personId === data.meId);
  const theirs = data.today.filter((c) => c.personId !== data.meId);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Your own day, given the room a greeting deserves. */}
      {mine.map((c) => (
        <div
          key={`${c.personId}-${c.kind}`}
          className="flex items-center gap-3 px-5 py-4 bg-indigo-50 border-b border-indigo-100"
        >
          <Icon kind={c.kind} className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-indigo-900">{noticeForSelf(c)}</p>
            {/* The dark shim lightens indigo-900 for the heading but leaves
                indigo-700 where it is, so the second line came out dim
                indigo on a dim indigo panel. Stated for dark directly. */}
            <p className="text-xs text-indigo-700/80 dark:text-indigo-300/90 mt-0.5">
              {c.kind === "BIRTHDAY"
                ? "From everyone at the studio."
                : `${c.years} ${c.years === 1 ? "year" : "years"} with the team.`}
            </p>
          </div>
        </div>
      ))}

      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Celebrations</h2>
          <Link
            href="/people?tab=celebrations"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {theirs.length > 0 && (
          <ul className="space-y-2 mb-3">
            {theirs.map((c) => (
              <li key={`${c.personId}-${c.kind}`} className="flex items-center gap-2.5">
                <Face celebration={c} />
                <span className="text-sm text-gray-900 min-w-0 truncate">
                  {noticeForOthers(c)}
                </span>
                <span className="ml-auto text-[11px] font-semibold text-indigo-600 flex-shrink-0">
                  Today
                </span>
              </li>
            ))}
          </ul>
        )}

        {data.upcoming.length > 0 && (
          <ul className="space-y-2">
            {data.upcoming.map((c) => (
              <li key={`${c.personId}-${c.kind}`} className="flex items-center gap-2.5">
                <Face celebration={c} />
                <span className="text-sm text-gray-700 min-w-0 truncate">
                  {c.name}
                  <span className="text-gray-500">
                    {c.kind === "BIRTHDAY" ? " · birthday" : ` · ${c.years} years`}
                  </span>
                </span>
                <span className="ml-auto text-[11px] text-gray-500 flex-shrink-0">
                  {countdown(c.daysAway)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Icon({ kind, className }: { kind: Celebration["kind"]; className?: string }) {
  return kind === "BIRTHDAY" ? <Cake className={className} /> : <Award className={className} />;
}

/** The person, or their initials when there is no photograph. */
function Face({ celebration: c }: { celebration: Celebration }) {
  if (c.avatarUrl) {
    return (
      <img
        src={c.avatarUrl}
        alt=""
        aria-hidden="true"
        className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-2 ring-surface"
      />
    );
  }
  const initials = c.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-semibold flex items-center justify-center flex-shrink-0 ring-2 ring-surface">
      {initials}
    </span>
  );
}
