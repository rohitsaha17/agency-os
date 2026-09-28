"use client";

import { Initials } from "@/components/dashboard/kit";

type Member = {
  userId: string;
  role: string;
  user: { id: string; name: string; avatarUrl?: string | null };
};

/**
 * Who is on this project, said plainly, to everybody.
 *
 * The header used to carry a single unlabelled huddle of SMM avatars. You
 * could hover one to learn a name, and there was nowhere at all to learn who
 * else was working on the thing — which is the first question anybody new to
 * a project asks, and the one the page answered worst.
 *
 * Two groups, because they are two different relationships: the SMM PLANS the
 * work, everybody else DOES it. Collapsing them into "team" loses the only
 * distinction that matters when you are trying to find the person to ask.
 *
 * Names are spelled out while there is room for them. A row of initials is
 * only a name you have to hover for, and hovering is not available on a
 * phone at all.
 */
export function ProjectTeam({ members }: { members: Member[] }) {
  const planners = members.filter((m) => m.role === "SMM");
  const workers = members.filter((m) => m.role !== "SMM");

  if (planners.length === 0 && workers.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Group label="Planned by" members={planners} empty="Nobody yet" />
      <Group label="Working on it" members={workers} empty="Nobody yet" />
    </div>
  );
}

/** Up to three names; beyond that, faces and a count. */
const NAMED = 3;

function Group({ label, members, empty }: {
  label: string; members: Member[]; empty: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 flex-shrink-0">
        {label}
      </span>

      {members.length === 0 ? (
        <span className="text-xs text-gray-400">{empty}</span>
      ) : members.length <= NAMED ? (
        <span className="flex items-center gap-2 flex-wrap min-w-0">
          {members.map((m) => (
            <span key={m.userId} className="inline-flex items-center gap-1.5 min-w-0">
              <Initials name={m.user.name} size={22} />
              <span className="text-xs text-gray-700 truncate">{m.user.name}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex -space-x-1.5" title={members.map((m) => m.user.name).join(", ")}>
            {members.slice(0, 5).map((m) => (
              <span key={m.userId} className="ring-2 ring-surface rounded-full">
                <Initials name={m.user.name} size={22} />
              </span>
            ))}
          </span>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {members.length} people
          </span>
        </span>
      )}
    </div>
  );
}
