"use client";

/**
 * Birthdays and work anniversaries.
 *
 * Two views of one list, because they answer different questions. The month
 * tells you what is coming up in March when you are planning March. The
 * upcoming list tells you what to do something about this week, which is the
 * question somebody actually opens this tab with — so it is the one that gets
 * the space on a phone, and the month is the thing you scroll to.
 *
 * NO AGES ANYWHERE. The endpoint sends a month and a day and no birth year,
 * so there is nothing here to accidentally render. Work anniversaries do carry
 * their year, because "five years today" is the occasion rather than a
 * disclosure.
 *
 * Somebody with no date recorded is absent rather than shown as a dash. The
 * empty state says which, so "no birthdays this month" is never confused with
 * "nobody has filled the field in".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cake, Award, CalendarDays } from "lucide-react";
import { LoadError } from "@/components/ui/LoadError";
import { MonthGrid, MONTH_NAMES } from "@/components/calendar/MonthGrid";
import {
  PersonAvatar, SummaryCard, SummaryStrip, EmptyState, TableSkeleton,
  CardsSkeleton, MonthStepper,
} from "@/components/people/kit";
import {
  countdownLabel, daysUntil, longDate, matchesQuery, monthDay, monthDayLabel,
  nextOccurrence, serviceYears,
} from "@/lib/people";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  craft: string | null;
  /** "MM-DD", or null when nobody has recorded one. */
  birthday: string | null;
  /** Full ISO date — years of service is the occasion. */
  joined: string | null;
}

/** One thing to celebrate, on one date. */
interface Occasion {
  key: string;
  person: Person;
  kind: "BIRTHDAY" | "ANNIVERSARY";
  /** "MM-DD" — the recurring date itself. */
  md: string;
  /** The next calendar date it falls on. */
  on: Date;
  days: number;
  /** Anniversaries only. */
  years: number | null;
}

/** How far ahead the list looks. A quarter is as far as anyone plans a card. */
const HORIZON_DAYS = 92;

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CelebrationsTab({ query }: { query: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [kind, setKind] = useState<"ALL" | "BIRTHDAY" | "ANNIVERSARY">("ALL");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/hr/celebrations");
      if (!res.ok) throw new Error("Something went wrong loading the calendar.");
      const d = await res.json();
      setPeople(d.people ?? []);
    } catch (e) {
      setPeople(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Every occasion, resolved onto its next real date. Computed once. */
  const occasions = useMemo<Occasion[]>(() => {
    const now = new Date();
    const out: Occasion[] = [];
    for (const p of people ?? []) {
      if (!matchesQuery(p, query)) continue;

      if (p.birthday) {
        const on = nextOccurrence(p.birthday, now);
        if (on) {
          out.push({
            key: `b-${p.id}`, person: p, kind: "BIRTHDAY",
            md: p.birthday, on, days: daysUntil(on, now), years: null,
          });
        }
      }

      const joinMd = monthDay(p.joined);
      if (p.joined && joinMd) {
        const on = nextOccurrence(joinMd, now);
        const years = on ? serviceYears(p.joined, on) : null;
        // serviceYears returns null in the joining year itself: somebody who
        // started last week has not had an anniversary, and listing "0 years"
        // reads as a bug rather than a celebration.
        if (on && years !== null) {
          out.push({
            key: `a-${p.id}`, person: p, kind: "ANNIVERSARY",
            md: joinMd, on, days: daysUntil(on, now), years,
          });
        }
      }
    }
    return out.sort((a, b) => a.days - b.days || a.person.name.localeCompare(b.person.name));
  }, [people, query]);

  const shown = useMemo(
    () => occasions.filter((o) => kind === "ALL" || o.kind === kind),
    [occasions, kind],
  );

  const upcoming = useMemo(
    () => shown.filter((o) => o.days <= HORIZON_DAYS),
    [shown],
  );

  const [y, m] = month.split("-").map(Number);

  /**
   * Occasions falling in the month being displayed, keyed by day of month.
   *
   * The years are recomputed against the YEAR ON SCREEN rather than carried
   * over from the upcoming list, and that matters in both directions.
   *
   * The list is a countdown — it answers "what is next", so its anniversary
   * counts belong to whenever the next one falls. The grid is a month, and a
   * month has a year printed at the top of it. Reusing the list's number made
   * September 2027 still say "5 years" for somebody who would be at six by
   * then, and made somebody who joined this September appear as an
   * anniversary in the very month they started — their first is a year away.
   *
   * So a person only appears here in a year where they actually have one.
   */
  const byDayOfMonth = useMemo(() => {
    const map = new Map<number, { o: Occasion; years: number | null }[]>();
    for (const o of shown) {
      const [om, od] = o.md.split("-").map(Number);
      if (om !== m) continue;

      let years: number | null = null;
      if (o.kind === "ANNIVERSARY") {
        const joinedYear = o.person.joined
          ? new Date(o.person.joined).getUTCFullYear()
          : null;
        if (joinedYear === null) continue;
        years = y - joinedYear;
        // Nought years is the day they started, not an anniversary — and a
        // negative one is a month before they joined.
        if (years <= 0) continue;
      }

      // Leap-day people show on the 28th in common years, matching
      // nextOccurrence — the grid must agree with the list.
      const day = om === 2 && od === 29 && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 28 : od;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push({ o, years });
    }
    return map;
  }, [shown, m, y]);

  const onDay = useCallback((d: Date) => byDayOfMonth.get(d.getDate()) ?? [], [byDayOfMonth]);

  const thisMonthCount = useMemo(
    () => [...byDayOfMonth.values()].reduce((n, list) => n + list.length, 0),
    [byDayOfMonth],
  );

  if (error) return <LoadError message="Couldn't load the calendar" detail={error} onRetry={load} />;
  if (!people) {
    return <div className="space-y-3"><CardsSkeleton count={3} /><TableSkeleton rows={5} /></div>;
  }

  const birthdaysKnown = occasions.filter((o) => o.kind === "BIRTHDAY").length;
  const nextUp = upcoming[0];

  return (
    <div className="space-y-3">
      <SummaryStrip>
        <SummaryCard
          label={`In ${MONTH_NAMES[m - 1]}`} value={thisMonthCount} tone="purple"
        />
        <SummaryCard
          label="Birthdays" value={birthdaysKnown} tone="amber"
          active={kind === "BIRTHDAY"}
          onClick={() => setKind((k) => (k === "BIRTHDAY" ? "ALL" : "BIRTHDAY"))}
        />
        <SummaryCard
          label="Work anniversaries"
          value={occasions.filter((o) => o.kind === "ANNIVERSARY").length}
          tone="green"
          active={kind === "ANNIVERSARY"}
          onClick={() => setKind((k) => (k === "ANNIVERSARY" ? "ALL" : "ANNIVERSARY"))}
        />
        <SummaryCard
          label="Next up"
          value={nextUp ? countdownLabel(nextUp.days) : "—"}
          hint={nextUp ? nextUp.person.name.split(" ")[0] : undefined}
          title={nextUp ? `${nextUp.person.name} — ${monthDayLabel(nextUp.md)}` : undefined}
        />
      </SummaryStrip>

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem] items-start">
        {/* The month. Second on a phone: "what is coming up" beats "what does
            March look like" when you are holding the thing in one hand. */}
        <div className="min-w-0 order-2 lg:order-1 space-y-2">
          <div className="flex items-center gap-2">
            <MonthStepper month={month} onChange={setMonth} />
            <span className="text-[11px] text-gray-400">
              {thisMonthCount === 0
                ? "Nothing this month"
                : `${thisMonthCount} in ${MONTH_NAMES[m - 1]}`}
            </span>
          </div>

          <div className="border border-gray-200 dark:border-white/[0.08] rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            <MonthGrid
              view="month"
              year={y}
              month={m - 1}
              cellCount={(d) => onDay(d).length}
              renderCell={(d) => (
                <div className="space-y-0.5">
                  {onDay(d).slice(0, 3).map(({ o, years }) => (
                    <span
                      key={o.key}
                      title={`${o.person.name} — ${o.kind === "BIRTHDAY" ? "birthday" : `${years} years`}`}
                      className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate ${
                        o.kind === "BIRTHDAY"
                          ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                      }`}
                    >
                      {o.kind === "BIRTHDAY"
                        ? <Cake className="w-2.5 h-2.5 flex-shrink-0" aria-hidden />
                        : <Award className="w-2.5 h-2.5 flex-shrink-0" aria-hidden />}
                      <span className="truncate">{o.person.name.split(" ")[0]}</span>
                    </span>
                  ))}
                  {onDay(d).length > 3 && (
                    <span className="block text-[9px] text-gray-400 px-1">
                      +{onDay(d).length - 3} more
                    </span>
                  )}
                </div>
              )}
              // On a phone a cell is about 50px wide. A dot per occasion is
              // all that fits; the names are in the list above it.
              renderCellMobile={(d) => (
                <div className="flex justify-center gap-0.5">
                  {onDay(d).slice(0, 3).map(({ o }) => (
                    <span
                      key={o.key}
                      className={`w-1.5 h-1.5 rounded-full ${
                        o.kind === "BIRTHDAY" ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      aria-hidden
                    />
                  ))}
                </div>
              )}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Cake className="w-3 h-3 text-amber-500" aria-hidden /> Birthday
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Award className="w-3 h-3 text-emerald-500" aria-hidden /> Work anniversary
            </span>
          </div>
        </div>

        {/* What to do something about. */}
        <aside className="order-1 lg:order-2 lg:sticky lg:top-2">
          <section className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 overflow-hidden">
            <header className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400" aria-hidden />
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                Coming up
              </h3>
              {upcoming.length > 0 && (
                <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
                  next {HORIZON_DAYS} days
                </span>
              )}
            </header>

            {upcoming.length === 0 ? (
              <p className="text-[12px] text-gray-400 px-3 py-6 text-center">
                {occasions.length === 0
                  ? "No dates recorded yet. Birthdays and joining dates are set on each person's record under Staff."
                  : `Nothing in the next ${HORIZON_DAYS} days.`}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {upcoming.map((o) => (
                  <li key={o.key} className="flex items-center gap-2.5 px-3 py-2">
                    <PersonAvatar name={o.person.name} url={o.person.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-gray-900 dark:text-slate-100 truncate">
                        {o.person.name}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate inline-flex items-center gap-1">
                        {o.kind === "BIRTHDAY" ? (
                          <><Cake className="w-3 h-3 text-amber-500" aria-hidden /> Birthday</>
                        ) : (
                          <><Award className="w-3 h-3 text-emerald-500" aria-hidden /> {o.years} years</>
                        )}
                        <span className="text-gray-300 dark:text-slate-600">·</span>
                        {monthDayLabel(o.md)}
                      </p>
                    </div>
                    <span
                      title={longDate(o.on.toISOString())}
                      className={`text-[11px] font-medium flex-shrink-0 tabular-nums ${
                        o.days === 0
                          ? "text-indigo-600 dark:text-indigo-400"
                          : "text-gray-400"
                      }`}
                    >
                      {countdownLabel(o.days)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {occasions.length === 0 && (
        <EmptyState
          title="No birthdays or joining dates recorded"
          hint="Set a date of birth and a joining date on each person's record under Staff, and they appear here."
          icon={<Cake className="w-7 h-7" />}
        />
      )}
    </div>
  );
}
