"use client";

/**
 * The staff record — everything about a person on one row, which is the
 * thing that was actually asked for.
 *
 * The salary column simply is not rendered without payroll.manage, and more
 * to the point the API never sends it: `seesPay` here decides layout, not
 * access. A manager inspecting the network tab finds no salary to read.
 */

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { Avatar, Skeleton } from "@/components/hr/TodayTab";

interface Staff {
  id: string; name: string; email: string; avatarUrl: string | null;
  role: string; isActive: boolean; craft: string | null;
  phone: string | null; dateOfBirth: string | null; dateOfJoining: string | null;
  address: string | null; emergencyName: string | null; emergencyPhone: string | null;
  employmentType: string; notes: string | null;
  monthlySalary?: number | null;
  advanceOutstanding?: number;
}

const EMPLOYMENT = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;
const label = (t: string) => t.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const forInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function StaffTab({ query, canEdit, seesPay }: {
  query: string; canEdit: boolean; seesPay: boolean;
}) {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/hr/staff");
      if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to staff records." : `The server returned ${res.status}.`);
      const d = await res.json();
      setStaff(d.staff ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <LoadError message="Couldn't load the staff list" detail={error} onRetry={load} />;
  if (!staff) return <Skeleton />;

  const q = query.trim().toLowerCase();
  const rows = staff.filter((s) =>
    !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) ||
    (s.craft ?? "").toLowerCase().includes(q) || (s.phone ?? "").includes(q));

  return (
    <>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-white/[0.08]">
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Role</th>
              <th className="py-2 px-3 font-medium">Contact</th>
              <th className="py-2 px-3 font-medium">Joined</th>
              <th className="py-2 px-3 font-medium">Birthday</th>
              <th className="py-2 px-3 font-medium">Type</th>
              {seesPay && <th className="py-2 px-3 font-medium text-right">Salary</th>}
              {seesPay && <th className="py-2 px-3 font-medium text-right">Owes</th>}
              {canEdit && <th className="py-2 px-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 dark:border-white/[0.05]">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={s.name} url={s.avatarUrl} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-slate-100 truncate">{s.name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{s.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-gray-600 dark:text-slate-300">{s.craft ?? s.role}</td>
                <td className="py-2.5 px-3 text-gray-600 dark:text-slate-300">{s.phone ?? "—"}</td>
                <td className="py-2.5 px-3 text-gray-600 dark:text-slate-300 whitespace-nowrap">{day(s.dateOfJoining)}</td>
                <td className="py-2.5 px-3 text-gray-600 dark:text-slate-300 whitespace-nowrap">{day(s.dateOfBirth)}</td>
                <td className="py-2.5 px-3 text-gray-600 dark:text-slate-300 whitespace-nowrap">{label(s.employmentType)}</td>
                {seesPay && (
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-900 dark:text-slate-100">
                    {s.monthlySalary != null
                      ? s.monthlySalary.toLocaleString("en-IN")
                      : <span className="text-gray-400">not set</span>}
                  </td>
                )}
                {seesPay && (
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {s.advanceOutstanding
                      ? <span className="text-amber-600 dark:text-amber-400">{s.advanceOutstanding.toLocaleString("en-IN")}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                )}
                {canEdit && (
                  <td className="py-2.5 px-3 text-right">
                    <button type="button" onClick={() => setEditing(s)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-surface duration-150"
                      aria-label={`Edit ${s.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">
          {q ? "Nobody by that name." : "Nobody on the team yet."}
        </p>
      )}

      {editing && (
        <EditStaff
          staff={editing}
          seesPay={seesPay}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast.success("Saved"); load(); }}
        />
      )}
    </>
  );
}

function EditStaff({ staff, seesPay, onClose, onSaved }: {
  staff: Staff; seesPay: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    phone: staff.phone ?? "",
    dateOfBirth: forInput(staff.dateOfBirth),
    dateOfJoining: forInput(staff.dateOfJoining),
    address: staff.address ?? "",
    emergencyName: staff.emergencyName ?? "",
    emergencyPhone: staff.emergencyPhone ?? "",
    employmentType: staff.employmentType,
    monthlySalary: staff.monthlySalary != null ? String(staff.monthlySalary) : "",
    notes: staff.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: staff.id,
          ...form,
          // Only sent when it could be set — the server ignores it otherwise,
          // but sending it at all would be noise in the request.
          ...(seesPay ? { monthlySalary: form.monthlySalary === "" ? null : Number(form.monthlySalary) } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Couldn't save that");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={staff.name} width="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 px-1">
            Cancel
          </button>
          <Button size="sm" onClick={save} loading={busy}>Save</Button>
        </div>
      }>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone"><input className={input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Employment">
          <select className={input} value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
            {EMPLOYMENT.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </Field>
        <Field label="Date of joining"><input type="date" className={input} value={form.dateOfJoining} onChange={(e) => set("dateOfJoining", e.target.value)} /></Field>
        <Field label="Date of birth"><input type="date" className={input} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
        {seesPay && (
          <Field label="Monthly salary">
            <input type="number" min="0" step="1" className={input}
              value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} />
          </Field>
        )}
        <Field label="Emergency contact"><input className={input} value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} /></Field>
        <Field label="Emergency phone"><input className={input} value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} /></Field>
        <div className="col-span-2">
          <Field label="Address"><input className={input} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
        <div className="col-span-2">
          <Field label="Notes"><textarea rows={2} className={`${input} resize-none`} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2 mt-3">{error}</p>
      )}
    </Modal>
  );
}

// No width class here on purpose: `${input} w-16` would otherwise lose to a
// w-full baked into the shared string, which is a mistake this codebase has
// already made once.
const input =
  "min-w-0 w-full px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
