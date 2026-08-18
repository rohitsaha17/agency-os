"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, Camera, Zap, MapPin, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MonthGrid, MONTH_NAMES, isSameDay, getWeekDays, isToday } from "@/components/calendar/MonthGrid";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "@/lib/toast";

interface BookingRow {
  id: string;
  photographerId: string;
  startAt: string;
  endAt: string;
  location: string | null;
  notes: string | null;
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  isAdHoc: boolean;
  photographer: { id: string; name: string };
  client: { id: string; name: string } | null;
  contentItem: { id: string; topic: string; status: string } | null;
}

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "bg-amber-50 border-amber-200 text-amber-800",
  CONFIRMED: "bg-emerald-50 border-emerald-200 text-emerald-800",
  COMPLETED: "bg-indigo-50 border-indigo-200 text-indigo-800",
  CANCELLED: "bg-gray-50 border-gray-200 text-gray-400 line-through",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function BookingsPage() {
  const now = new Date();
  const { user: currentUser } = useCurrentUser();
  const [view, setView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState<Date>(now);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [photographers, setPhotographers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bookNowOpen, setBookNowOpen] = useState(false);
  const [selected, setSelected] = useState<BookingRow | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      const days = getWeekDays(weekStart);
      const from = new Date(days[0]); from.setHours(0, 0, 0, 0);
      const to = new Date(days[6]); to.setHours(24, 0, 0, 0);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    return {
      from: new Date(year, month, -7).toISOString(),
      to: new Date(year, month + 1, 7).toISOString(),
    };
  }, [view, weekStart, year, month]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, uRes] = await Promise.all([
        fetch(`/api/bookings?from=${range.from}&to=${range.to}`),
        fetch("/api/users"),
      ]);
      if (bRes.ok) setBookings(await bRes.json());
      if (uRes.ok) {
        const users = await uRes.json();
        setPhotographers(
          (Array.isArray(users) ? users : []).filter((u: { designation?: string }) => u.designation === "PHOTOGRAPHER"),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const shift = (dir: 1 | -1) => {
    if (view === "week") {
      setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + dir * 7); return n; });
    } else {
      const m = month + dir;
      if (m < 0) { setYear((y) => y - 1); setMonth(11); }
      else if (m > 11) { setYear((y) => y + 1); setMonth(0); }
      else setMonth(m);
    }
  };

  const act = async (booking: BookingRow, action: "confirm" | "complete" | "cancel") => {
    const res = await fetch(`/api/bookings/${booking.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error?.message ?? "Failed"); return; }
    toast.success(`Booking ${action}ed`.replace("eed", "ed"));
    if (d.promptMarkItemPosted && booking.contentItem &&
        confirm(`Mark "${booking.contentItem.topic}" as delivered/POSTED?`)) {
      await fetch(`/api/content-items/${booking.contentItem.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "POSTED", note: "shoot completed" }),
      });
      toast.success("Content item marked posted");
    }
    setSelected(null);
    fetchAll();
  };

  const weekDays = getWeekDays(weekStart);
  const bookingsFor = (photographerId: string, day: Date) =>
    bookings.filter((b) => b.photographerId === photographerId && isSameDay(new Date(b.startAt), day));

  const renderBlock = (b: BookingRow) => (
    <button
      key={b.id}
      onClick={() => setSelected(b)}
      className={`w-full text-left border rounded-lg px-2 py-1.5 mb-1 ${STATUS_STYLE[b.status]} ${b.isAdHoc ? "border-dashed" : ""}`}
      title={`${b.client?.name ?? "Internal"} · ${fmtTime(b.startAt)}–${fmtTime(b.endAt)}${b.location ? ` @ ${b.location}` : ""}`}
    >
      <p className="text-[10px] font-semibold truncate">
        {b.isAdHoc && "⚡ "}{b.client?.name ?? "Internal"}
      </p>
      <p className="text-[9px] opacity-80">{fmtTime(b.startAt)}–{fmtTime(b.endAt)}</p>
      {b.location && (
        <p className="text-[9px] opacity-60 truncate flex items-center gap-0.5">
          <MapPin className="w-2 h-2" /> {b.location}
        </p>
      )}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Camera className="w-5 h-5 text-indigo-500" /> Bookings
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Photographer schedule — conflict-checked</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              {(["week", "month"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 font-medium capitalize ${view === v ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => { setWeekStart(now); setYear(now.getFullYear()); setMonth(now.getMonth()); }}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
              Today
            </button>
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => shift(-1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[140px] text-center">
                {view === "week"
                  ? `Week of ${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : `${MONTH_NAMES[month]} ${year}`}
              </span>
              <button onClick={() => shift(1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setBookNowOpen(true)}>⚡ Book now</Button>
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setDialogOpen(true)}>New Booking</Button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 sm:px-6 py-4 overflow-auto">
        {photographers.length === 0 && !loading ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center max-w-lg mx-auto mt-10">
            <Camera className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">No photographers yet</p>
            <p className="text-xs text-gray-500">
              Set designation = <b>Photographer</b> in Settings → Users to create their booking lane.
            </p>
          </div>
        ) : view === "week" ? (
          /* Week: photographer lanes */
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              {/* Day headers */}
              <div className="grid" style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
                <div />
                {weekDays.map((d, i) => (
                  <div key={i} className={`text-center py-2 text-xs font-medium ${isToday(d) ? "text-indigo-700" : "text-gray-400"}`}>
                    {d.toLocaleDateString("en-US", { weekday: "short" })}{" "}
                    <span className={isToday(d) ? "inline-flex w-6 h-6 items-center justify-center bg-indigo-600 text-white rounded-full" : ""}>
                      {d.getDate()}
                    </span>
                  </div>
                ))}
              </div>
              {loading ? (
                <div className="space-y-2 mt-2">{[1, 2].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
              ) : (
                photographers.map((p) => (
                  <div key={p.id} className="grid border-t border-gray-100"
                    style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
                    <div className="py-3 pr-3 flex items-start gap-2">
                      <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </span>
                      <span className="text-xs font-medium text-gray-700 leading-tight mt-1.5">{p.name}</span>
                    </div>
                    {weekDays.map((d, i) => (
                      <div key={i} className={`min-h-[90px] p-1 border-l border-gray-50 ${isToday(d) ? "bg-indigo-50/40" : ""}`}>
                        {bookingsFor(p.id, d).map(renderBlock)}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Month view */
          <MonthGrid
            view="month"
            year={year}
            month={month}
            loading={loading}
            cellCount={(day) => bookings.filter((b) => isSameDay(new Date(b.startAt), day)).length}
            renderCell={(day) => (
              <>
                {bookings.filter((b) => isSameDay(new Date(b.startAt), day)).slice(0, 3).map(renderBlock)}
              </>
            )}
          />
        )}
      </div>

      {/* Booking detail popover */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">
                {selected.isAdHoc && "⚡ "}Shoot{selected.client ? ` — ${selected.client.name}` : ""}
              </h2>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-2 text-sm text-gray-700">
              <p><b>{selected.photographer.name}</b></p>
              <p>{new Date(selected.startAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {fmtTime(selected.startAt)}–{fmtTime(selected.endAt)}</p>
              {selected.location && <p className="flex items-center gap-1 text-gray-500"><MapPin className="w-3.5 h-3.5" /> {selected.location}</p>}
              {selected.contentItem && (
                <p className="text-xs text-gray-500">Linked item: {selected.contentItem.topic} ({selected.contentItem.status})</p>
              )}
              {selected.notes && <p className="text-xs text-gray-500">{selected.notes}</p>}
              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[selected.status]}`}>
                {selected.status}
              </span>
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-200">
              {selected.status === "REQUESTED" && (
                <button onClick={() => act(selected, "confirm")}
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500">
                  Confirm
                </button>
              )}
              {["REQUESTED", "CONFIRMED"].includes(selected.status) && (
                <>
                  <button onClick={() => act(selected, "complete")}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                  </button>
                  <button onClick={() => act(selected, "cancel")}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                    Cancel booking
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <BookingDialog
          photographers={photographers}
          onClose={() => setDialogOpen(false)}
          onSaved={() => { setDialogOpen(false); fetchAll(); }}
        />
      )}
      {bookNowOpen && (
        <BookNowDialog
          onClose={() => setBookNowOpen(false)}
          onSaved={() => { setBookNowOpen(false); fetchAll(); }}
        />
      )}
    </div>
  );
}

// ── New booking dialog (with conflict warning) ───────────────

function BookingDialog({
  photographers, prefill, onClose, onSaved,
}: {
  photographers: { id: string; name: string }[];
  prefill?: { clientId?: string; date?: string; notes?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user: currentUser } = useCurrentUser();
  const canOverride = !!currentUser && ["ADMIN", "OWNER", "MANAGER"].includes(currentUser.role);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<{ id: string; topic: string }[]>([]);
  const [form, setForm] = useState({
    photographerId: photographers[0]?.id ?? "",
    clientId: prefill?.clientId ?? "",
    contentItemId: "",
    date: prefill?.date ?? new Date().toISOString().slice(0, 10),
    start: "10:00", end: "13:00",
    location: "", notes: prefill?.notes ?? "", isAdHoc: false,
  });
  const [conflict, setConflict] = useState<{ startAt: string; endAt: string; clientName: string | null; canOverride: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d); });
  }, []);

  // Content items filtered to counts-as-shoot types of the chosen client
  useEffect(() => {
    if (!form.clientId) { setItems([]); return; }
    Promise.all([
      fetch(`/api/content-items?clientId=${form.clientId}`).then((r) => r.json()),
      fetch("/api/creative-types").then((r) => r.json()),
    ]).then(([list, types]) => {
      const shootTypes = new Set((Array.isArray(types) ? types : []).filter((t: { countsAsShoot: boolean }) => t.countsAsShoot).map((t: { id: string }) => t.id));
      setItems((Array.isArray(list) ? list : [])
        .filter((i: { creativeTypeId: string; status: string }) => shootTypes.has(i.creativeTypeId) && i.status !== "POSTED")
        .map((i: { id: string; topic: string }) => ({ id: i.id, topic: i.topic })));
    }).catch(() => {});
  }, [form.clientId]);

  const submit = async (bookAnyway = false) => {
    if (!form.photographerId) { setError("Pick a photographer"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photographerId: form.photographerId,
          clientId: form.clientId || null,
          contentItemId: form.contentItemId || null,
          startAt: `${form.date}T${form.start}:00`,
          endAt: `${form.date}T${form.end}:00`,
          location: form.location || null,
          notes: form.notes || null,
          isAdHoc: form.isAdHoc,
          bookAnyway,
        }),
      });
      const d = await res.json();
      if (res.status === 409) {
        setConflict(d.conflict);
        return;
      }
      if (!res.ok) throw new Error(d.error?.message || "Failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New Booking</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}
          {conflict && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-800">⚠ Clash with an existing booking</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {conflict.clientName ?? "Internal"} · {fmtTime(conflict.startAt)}–{fmtTime(conflict.endAt)}
              </p>
              <div className="flex gap-2 mt-2">
                {canOverride && (
                  <button onClick={() => submit(true)}
                    className="px-2.5 py-1 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                    Book anyway
                  </button>
                )}
                <button onClick={() => setConflict(null)} className="text-xs text-gray-500 hover:text-gray-700">Pick another slot</button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Photographer <span className="text-red-500">*</span></label>
              <select value={form.photographerId} onChange={(e) => setForm((f) => ({ ...f, photographerId: e.target.value }))}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {photographers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Client (optional)</label>
              <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, contentItemId: "" }))}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Internal</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Shoot item (optional)</label>
              <select value={form.contentItemId} onChange={(e) => setForm((f) => ({ ...f, contentItemId: e.target.value }))}
                disabled={items.length === 0}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50">
                <option value="">None</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.topic}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Start</label>
                <input type="time" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                  className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">End</label>
                <input type="time" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                  className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Location</label>
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Client office, Andheri West"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <textarea value={form.notes} rows={2}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.isAdHoc}
              onChange={(e) => setForm((f) => ({ ...f, isAdHoc: e.target.checked }))}
              className="rounded border-gray-300 text-indigo-600" />
            Ad-hoc / sudden shoot <Zap className="w-3 h-3 text-amber-500" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => submit(false)}>Book</Button>
        </div>
      </div>
    </div>
  );
}

// ── Book now: next free slots ────────────────────────────────

function BookNowDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [hours, setHours] = useState("2");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [slots, setSlots] = useState<{ photographerId: string; photographerName: string; startAt: string; endAt: string }[] | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d); });
  }, []);

  const findSlots = async () => {
    setError(null);
    const res = await fetch(`/api/bookings/free-slots?hours=${hours}`);
    const d = await res.json();
    if (!res.ok) { setError(d.error?.message ?? "Failed"); return; }
    setSlots(d);
  };

  const book = async (slot: { photographerId: string; startAt: string; endAt: string }) => {
    setBooking(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photographerId: slot.photographerId,
          clientId: clientId || null,
          startAt: slot.startAt,
          endAt: slot.endAt,
          isAdHoc: true,
        }),
      });
      if (res.ok) { toast.success("Ad-hoc booking created"); onSaved(); }
      else { const d = await res.json(); setError(d.error?.message ?? "Failed"); }
    } finally { setBooking(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">⚡ Book now</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
          <div className="flex gap-2">
            <select value={hours} onChange={(e) => setHours(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              {["1", "2", "3", "4"].map((h) => <option key={h} value={h}>{h}h</option>)}
            </select>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="">Internal</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={findSlots}
              className="px-3 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">
              Find slots
            </button>
          </div>
          {slots && (
            slots.length === 0 ? (
              <p className="text-xs text-gray-400">No free slots today or tomorrow.</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {slots.map((s, i) => (
                  <li key={i}>
                    <button onClick={() => book(s)} disabled={booking}
                      className="w-full flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50">
                      <Camera className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-800 flex-1">{s.photographerName}</span>
                      <span className="text-[11px] text-gray-500">
                        {new Date(s.startAt).toLocaleDateString("en-US", { weekday: "short" })} {fmtTime(s.startAt)}–{fmtTime(s.endAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </div>
  );
}
