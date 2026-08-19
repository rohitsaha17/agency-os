"use client";

import Link from "next/link";
import { CalendarDays, CircleCheck } from "lucide-react";

/**
 * Google-Calendar-style pill that flips between the calendar and the task
 * board. The two pages show the same underlying items, so this is a view
 * switch rather than navigation between unrelated screens.
 */
export function CalendarTasksSwitch({ active }: { active: "calendar" | "tasks" }) {
  const base =
    "flex items-center justify-center w-9 h-8 transition-colors first:rounded-l-lg last:rounded-r-lg";
  return (
    <div className="flex border border-gray-200 rounded-lg overflow-hidden" role="group" aria-label="Calendar or tasks view">
      <Link
        href="/my-calendar"
        title="Switch to Calendar"
        aria-current={active === "calendar" ? "page" : undefined}
        className={`${base} ${active === "calendar" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}
      >
        <CalendarDays className="w-4 h-4" />
      </Link>
      <Link
        href="/tasks"
        title="Switch to Tasks"
        aria-current={active === "tasks" ? "page" : undefined}
        className={`${base} border-l border-gray-200 ${active === "tasks" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}
      >
        <CircleCheck className="w-4 h-4" />
      </Link>
    </div>
  );
}
