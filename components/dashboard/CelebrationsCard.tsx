"use client";

import { useEffect, useState } from "react";
import { Cake, Award } from "lucide-react";
import { countdown, noticeForSelf, type Celebration } from "@/lib/celebrations";
import { Panel, DayBlock, Initials, Row, Empty, Pill } from "./kit";

type Payload = { today: Celebration[]; upcoming: Celebration[]; meId: string };

/** Today plus three ahead. Beyond that it stops being news. */
const SHOWN = 4;

/**
 * Whose day it is.
 *
 * The person celebrating is greeted; everyone else is told. Being informed of
 * your own birthday in the third person reads as software that does not know
 * who you are — so your own occasion gets the banner and everybody else's
 * gets a row.
 */
export function CelebrationsCard() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/celebrations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setData(d); })
      .catch(() => { /* a quiet card beats an error where it was */ });
    return () => { alive = false; };
  }, []);

  // Only while the first request is in flight. After that the panel stays on
  // the page: a card that vanishes in a quiet week is indistinguishable from
  // one that is broken.
  if (!data) return null;

  const mine = data.today.filter((c) => c.personId === data.meId);
  const rows = [
    ...data.today.filter((c) => c.personId !== data.meId),
    ...data.upcoming,
  ].slice(0, SHOWN);

  return (
    <Panel
      icon={<Cake className="w-4.5 h-4.5" />}
      title="Celebrations"
      subtitle="This week"
      href="/hr?tab=celebrations"
    >
      {/* Your own day, given the room a greeting deserves. */}
      {mine.map((c) => (
        <div
          key={`${c.personId}-${c.kind}`}
          className="mx-4 sm:mx-5 mb-3 rounded-xl px-3 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/25"
        >
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            {noticeForSelf(c)}
          </p>
          <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/90 mt-0.5">
            {c.kind === "BIRTHDAY"
              ? "From everyone at the studio."
              : `${c.years} ${c.years === 1 ? "year" : "years"} with the team.`}
          </p>
        </div>
      ))}

      {rows.length === 0 && mine.length === 0 ? (
        <Empty>
          No birthdays or anniversaries in the next week. They appear here once
          dates of birth and joining are filled in on People.
        </Empty>
      ) : (
        <ul className="pb-1">
          {rows.map((c) => (
            <Row key={`${c.personId}-${c.kind}`}>
              <DayBlock iso={c.on} />
              <Initials name={c.name} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-gray-900 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {c.kind === "BIRTHDAY"
                    ? "Birthday"
                    : `Work anniversary · ${c.years} ${c.years === 1 ? "year" : "years"}`}
                </p>
              </div>
              {c.daysAway === 0 ? (
                <span className="text-[10px] font-semibold text-indigo-600 flex-shrink-0">
                  Today
                </span>
              ) : (
                <Pill>{countdown(c.daysAway)}</Pill>
              )}
              {c.kind === "BIRTHDAY"
                ? <Cake className="w-4 h-4 text-indigo-400/70 flex-shrink-0" aria-hidden="true" />
                : <Award className="w-4 h-4 text-indigo-400/70 flex-shrink-0" aria-hidden="true" />}
            </Row>
          ))}
        </ul>
      )}
    </Panel>
  );
}
