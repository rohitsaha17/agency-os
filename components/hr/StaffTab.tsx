"use client";

/**
 * Staff — who works here, and what we hold on them.
 *
 * The salary column is not rendered without payroll.manage, and more to the
 * point the API never sends it: `seesPay` here decides layout, not access. A
 * manager inspecting the network tab finds no salary to read.
 *
 * Clicking a row opens the record beside the table rather than replacing it,
 * which is what makes checking four people's joining dates one motion instead
 * of four page loads. The drawer links out to that person's attendance, leave
 * and pay rather than re-implementing three screens inside itself — those
 * pages already exist, already handle their own permissions, and a second
 * half-version of each is a second thing to keep true.
 *
 * Where something has not been filled in, the cell reads "—". The module used
 * to print "not set" in a dozen places, which turned an empty column into a
 * wall of the same three words.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, UserPlus, Pencil, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { Drawer, DrawerLine, DrawerSection } from "@/components/people/Drawer";
import {
  PersonAvatar, PersonCell, StatusBadge, SummaryCard, SummaryStrip,
  Table, Th, Td, Row, RowMenu, EmptyState, TableSkeleton, CardsSkeleton,
  MobileCard, ClearFilters,
} from "@/components/people/kit";
import {
  EMPLOYMENT_LABEL, longDate, matchesQuery, money, humanise,
} from "@/lib/people";

interface Staff {
  id: string; name: string; email: string; avatarUrl: string | null;
  role: string; isActive: boolean; craft: string | null; jobTitleId: string | null;
  phone: string | null; dateOfBirth: string | null; dateOfJoining: string | null;
  address: string | null; emergencyName: string | null; emergencyPhone: string | null;
  employmentType: string; notes: string | null;
  monthlySalary?: number | null;
  advanceOutstanding?: number;
}

const EMPLOYMENT = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;
const forInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function StaffTab({
  query, canEdit, seesPay, canInvite, currency, onNavigate,
}: {
  query: string;
  canEdit: boolean;
  seesPay: boolean;
  canInvite: boolean;
  currency: string;
  onNavigate: (tab: "attendance" | "leave" | "payroll" | "advances", userId?: string) => void;
}) {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [adding, setAdding] = useState(false);
  const [craft, setCraft] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      // Inactive people are asked for so the Status filter has something to
      // filter — the list still shows only the active ones by default.
      const res = await fetch("/api/hr/staff?includeInactive=1");
      if (!res.ok) {
        throw new Error(res.status === 403
          ? "Staff records aren't part of your access."
          : "Something went wrong loading the staff list.");
      }
      const d = await res.json();
      setStaff(d.staff ?? []);
    } catch (e) {
      setStaff(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const crafts = useMemo(
    () => [...new Set((staff ?? []).map((s) => s.craft).filter(Boolean) as string[])].sort(),
    [staff],
  );

  const rows = useMemo(() => (staff ?? []).filter((s) => {
    if (!matchesQuery(s, query)) return false;
    if (craft && s.craft !== craft) return false;
    if (type && s.employmentType !== type) return false;
    if (status === "inactive" ? s.isActive : status === "active" ? !s.isActive : false) return false;
    // Default view is the people who actually work here.
    if (!status && !s.isActive) return false;
    return true;
  }), [staff, query, craft, type, status]);

  const filtersOn = !!(craft || type || status);
  const opened = (staff ?? []).find((s) => s.id === open) ?? null;
  const active = (staff ?? []).filter((s) => s.isActive);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={craft} onChange={setCraft} allowEmpty placeholder="All roles" size="sm"
          options={crafts.map((c) => ({ value: c, label: c }))} className="min-w-[8.5rem]"
        />
        <Select
          value={type} onChange={setType} allowEmpty placeholder="All employment types" size="sm"
          options={EMPLOYMENT.map((t) => ({ value: t, label: EMPLOYMENT_LABEL[t] }))}
          className="min-w-[10rem]"
        />
        <Select
          value={status} onChange={setStatus} allowEmpty placeholder="Active only" size="sm"
          options={[{ value: "active", label: "Active only" }, { value: "inactive", label: "Inactive only" }]}
          className="min-w-[8.5rem]"
        />
        {filtersOn && <ClearFilters onClear={() => { setCraft(""); setType(""); setStatus(""); }} />}
        {canInvite && (
          <Button size="sm" className="ml-auto" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAdding(true)}>
            Add person
          </Button>
        )}
      </div>

      {error ? (
        <LoadError message="Couldn't load the staff list" detail={error} onRetry={load} />
      ) : !staff ? (
        <div className="space-y-3"><CardsSkeleton count={3} /><TableSkeleton rows={6} /></div>
      ) : (
        <>
          <SummaryStrip>
            <SummaryCard label="On the team" value={active.length} />
            <SummaryCard
              label="Joining date missing"
              value={active.filter((s) => !s.dateOfJoining).length}
              tone={active.some((s) => !s.dateOfJoining) ? "amber" : undefined}
              title="Records with no joining date recorded yet"
            />
            {seesPay && (
              <SummaryCard
                label="Salary not set"
                value={active.filter((s) => s.monthlySalary == null).length}
                tone={active.some((s) => s.monthlySalary == null) ? "amber" : undefined}
                title="Payroll cannot produce a figure for these people"
              />
            )}
            {seesPay && (
              <SummaryCard
                label="Owed on advances"
                value={money(active.reduce((t, s) => t + (s.advanceOutstanding ?? 0), 0), currency)}
              />
            )}
          </SummaryStrip>

          {rows.length === 0 ? (
            <EmptyState
              title={query || filtersOn ? "Nobody matches that" : "Nobody on the team yet"}
              hint={
                query || filtersOn
                  ? "Clear the search or the filters to see everyone."
                  : "Add the people who work here and their records appear across the module."
              }
              action={canInvite && !query && !filtersOn ? (
                <Button size="sm" icon={<UserPlus className="w-3.5 h-3.5" />} onClick={() => setAdding(true)}>
                  Add person
                </Button>
              ) : undefined}
            />
          ) : (
            <>
              <div className="hidden sm:block">
                <Table minWidth={seesPay ? 980 : 820}>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th>Role</Th>
                      <Th>Employment</Th>
                      <Th>Phone</Th>
                      <Th>Joined</Th>
                      {seesPay && <Th align="right">Salary</Th>}
                      {seesPay && <Th align="right">Owes</Th>}
                      <Th>Status</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <Row
                        key={s.id}
                        onOpen={() => setOpen(s.id)}
                        selected={open === s.id}
                        label={`Open ${s.name}'s record`}
                      >
                        <Td><PersonCell name={s.name} url={s.avatarUrl} secondary={s.email} /></Td>
                        <Td className="text-gray-600 dark:text-slate-300">{s.craft ?? humanise(s.role)}</Td>
                        <Td nowrap className="text-gray-600 dark:text-slate-300">
                          {EMPLOYMENT_LABEL[s.employmentType] ?? "—"}
                        </Td>
                        <Td className="text-gray-600 dark:text-slate-300">{s.phone ?? "—"}</Td>
                        <Td nowrap className="text-gray-600 dark:text-slate-300">{longDate(s.dateOfJoining)}</Td>
                        {seesPay && (
                          <Td align="right" className="text-gray-900 dark:text-slate-100">
                            {s.monthlySalary != null
                              ? money(s.monthlySalary, currency)
                              : <span className="text-gray-400">—</span>}
                          </Td>
                        )}
                        {seesPay && (
                          <Td align="right">
                            {s.advanceOutstanding
                              ? <span className="text-amber-600 dark:text-amber-400">{money(s.advanceOutstanding, currency)}</span>
                              : <span className="text-gray-400">—</span>}
                          </Td>
                        )}
                        <Td>
                          <StatusBadge tone={s.isActive ? "green" : "grey"}>
                            {s.isActive ? "Active" : "Inactive"}
                          </StatusBadge>
                        </Td>
                        <Td align="right" className="w-10">
                          <div onClick={(e) => e.stopPropagation()}>
                            <RowMenu
                              label={`Actions for ${s.name}`}
                              items={[
                                { label: "View record", onSelect: () => setOpen(s.id) },
                                { label: "Edit details", onSelect: () => setEditing(s), disabled: !canEdit },
                                { label: "View attendance", onSelect: () => onNavigate("attendance", s.id) },
                                { label: "View leave", onSelect: () => onNavigate("leave", s.id) },
                                { label: "View payroll", onSelect: () => onNavigate("payroll", s.id), disabled: !seesPay },
                                { label: "View advances", onSelect: () => onNavigate("advances", s.id), disabled: !seesPay },
                              ]}
                            />
                          </div>
                        </Td>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="sm:hidden space-y-1.5">
                {rows.map((s) => (
                  <MobileCard key={s.id} onOpen={() => setOpen(s.id)} label={`Open ${s.name}'s record`}>
                    <div className="flex items-center gap-2.5">
                      <PersonAvatar name={s.name} url={s.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{s.name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                          {s.craft ?? humanise(s.role)} · {EMPLOYMENT_LABEL[s.employmentType] ?? "—"}
                        </p>
                      </div>
                      <StatusBadge tone={s.isActive ? "green" : "grey"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </StatusBadge>
                    </div>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {opened && (
        <Drawer
          open
          onClose={() => setOpen(null)}
          title={opened.name}
          subtitle={`${opened.craft ?? humanise(opened.role)} · ${EMPLOYMENT_LABEL[opened.employmentType] ?? "—"}`}
          label={`${opened.name}'s record`}
          headerAside={<PersonAvatar name={opened.name} url={opened.avatarUrl} size="lg" />}
          footer={
            canEdit ? (
              <Button
                size="sm" variant="secondary" className="w-full"
                icon={<Pencil className="w-3.5 h-3.5" />}
                onClick={() => setEditing(opened)}
              >
                Edit details
              </Button>
            ) : undefined
          }
        >
          <DrawerSection title="Employment">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine label="Role" value={opened.craft ?? humanise(opened.role)} />
              <DrawerLine label="Access level" value={humanise(opened.role)} />
              <DrawerLine label="Employment" value={EMPLOYMENT_LABEL[opened.employmentType] ?? "—"} />
              <DrawerLine label="Joined" value={longDate(opened.dateOfJoining)} />
              <DrawerLine
                label="Status"
                value={<StatusBadge tone={opened.isActive ? "green" : "grey"}>{opened.isActive ? "Active" : "Inactive"}</StatusBadge>}
              />
            </div>
          </DrawerSection>

          <DrawerSection title="Contact">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine label="Email" value={opened.email} />
              <DrawerLine label="Phone" value={opened.phone ?? "—"} />
              <DrawerLine label="Date of birth" value={longDate(opened.dateOfBirth)} />
              <DrawerLine label="Address" value={opened.address ?? "—"} />
              <DrawerLine
                label="Emergency"
                value={opened.emergencyName
                  ? `${opened.emergencyName}${opened.emergencyPhone ? ` · ${opened.emergencyPhone}` : ""}`
                  : "—"}
              />
            </div>
          </DrawerSection>

          {seesPay && (
            <DrawerSection title="Money">
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
                <DrawerLine
                  label="Monthly salary"
                  value={opened.monthlySalary != null
                    ? money(opened.monthlySalary, currency)
                    : <span className="text-amber-600 dark:text-amber-400">Not configured</span>}
                  tone="strong"
                />
                <DrawerLine
                  label="Owed on advances"
                  value={opened.advanceOutstanding ? money(opened.advanceOutstanding, currency) : "—"}
                />
              </div>
            </DrawerSection>
          )}

          {opened.notes && (
            <DrawerSection title="Notes">
              <p className="text-[12px] text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{opened.notes}</p>
            </DrawerSection>
          )}

          {/* Links rather than copies. Each destination is the real screen,
              with its own permissions and its own month navigation. */}
          <DrawerSection title="Elsewhere in People">
            <div className="grid grid-cols-2 gap-1.5">
              <Jump label="Attendance" onClick={() => { setOpen(null); onNavigate("attendance", opened.id); }} />
              <Jump label="Leave" onClick={() => { setOpen(null); onNavigate("leave", opened.id); }} />
              {seesPay && <Jump label="Payroll" onClick={() => { setOpen(null); onNavigate("payroll", opened.id); }} />}
              {seesPay && <Jump label="Advances" onClick={() => { setOpen(null); onNavigate("advances", opened.id); }} />}
            </div>
          </DrawerSection>
        </Drawer>
      )}

      {editing && (
        <EditStaff
          staff={editing}
          seesPay={seesPay}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast.success("Saved"); load(); }}
        />
      )}

      {adding && (
        <AddPerson
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); toast.success("Added"); load(); }}
        />
      )}
    </div>
  );
}

function Jump({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] text-[12px] text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
    >
      {label}
      <ExternalLink className="w-3 h-3 text-gray-400" aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ */

function EditStaff({
  staff, seesPay, currency, onClose, onSaved,
}: {
  staff: Staff; seesPay: boolean; currency: string; onClose: () => void; onSaved: () => void;
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
    <Modal
      open onClose={onClose} title={`Edit ${staff.name}`} width="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} loading={busy}>Save changes</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone"><input className={input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Employment">
          <select className={input} value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
            {EMPLOYMENT.map((t) => <option key={t} value={t}>{EMPLOYMENT_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Date of joining">
          <input type="date" className={input} value={form.dateOfJoining} onChange={(e) => set("dateOfJoining", e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <input type="date" className={input} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
        </Field>
        {seesPay && (
          <Field label={`Monthly salary (${currency})`}>
            <input type="number" min="0" step="1" className={input}
              value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} />
          </Field>
        )}
        <Field label="Emergency contact">
          <input className={input} value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
        </Field>
        <Field label="Emergency phone">
          <input className={input} value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Address"><input className={input} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
        <div className="col-span-2">
          <Field label="Notes">
            <textarea rows={2} className={`${input} resize-none`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </Modal>
  );
}

/**
 * Adding somebody.
 *
 * This creates a USER, through the same endpoint Settings uses, so the role
 * rules — an admin is the only one who can make another admin — are the ones
 * that already exist. The rest of the record is filled in afterwards on the
 * row, because asking for an address before somebody has an account is a form
 * people abandon.
 */
function AddPerson({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("TEAM");
  const [designationId, setDesignationId] = useState("");
  const [jobs, setJobs] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/designations?activeOnly=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows = Array.isArray(d) ? d : (d?.designations ?? []);
        if (Array.isArray(rows)) setJobs(rows.map((j: { id: string; name: string }) => ({ id: j.id, name: j.name })));
      })
      .catch(() => { /* the job title can be set later on the row */ });
  }, []);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ready = name.trim().length > 1 && emailOk;

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), role,
          ...(designationId ? { designationId } : {}),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Couldn't add them");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose} title="Add a person" width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} loading={busy} disabled={!ready}
            icon={<UserPlus className="w-3.5 h-3.5" />}>
            Add person
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[12px] text-gray-500 dark:text-slate-400">
          Their phone, joining date and salary are filled in on the record afterwards.
        </p>
        <Field label="Full name">
          <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input
            type="email" className={input} value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={email.length > 0 && !emailOk}
          />
          {email.length > 0 && !emailOk && (
            <span className="block text-[11px] text-red-600 dark:text-red-400 mt-1">
              That doesn&rsquo;t look like an email address.
            </span>
          )}
        </Field>
        <Field label="Job title">
          <Select
            value={designationId} onChange={setDesignationId} allowEmpty
            placeholder="Set later" options={jobs.map((j) => ({ value: j.id, label: j.name }))}
            className="w-full"
          />
        </Field>
        <Field label="Access level">
          <Select
            value={role} onChange={setRole} className="w-full"
            options={[
              { value: "TEAM", label: "Team — their own work" },
              { value: "SMM", label: "SMM — plans and briefs" },
              { value: "MANAGER", label: "Manager — the whole board" },
              { value: "ADMIN", label: "Admin — everything" },
            ]}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
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
