"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { BrandLogo } from "@/components/ui/BrandLogo";

/**
 * First-login walkthrough.
 *
 * Spotlights the sidebar navigation one feature at a time with an anchored
 * popover (dark overlay + highlight ring, Next/Back/Skip, progress dots).
 * Anchors resolve via `[data-tour="…"]` attributes on the sidebar links;
 * when an anchor isn't visible (e.g. mobile, collapsed sidebar) the step
 * falls back to a centered card so the tour still works.
 *
 * Shown once per user — completion is remembered in localStorage under a
 * per-user key, so each teammate gets their own walkthrough.
 */

interface TourStep {
  /** matches data-tour attribute; null = centered welcome/finish card */
  anchor: string | null;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    anchor: null,
    title: "Welcome to Vibrnd Studio Flow",
    body: "Your agency's clients, projects, money and files — all connected in one place. Here's a 60-second tour of where everything lives.",
  },
  {
    anchor: "dashboard",
    title: "Dashboard",
    body: "Your daily control room — active projects, overdue tasks, pipeline value and everything needing attention, at a glance.",
  },
  {
    anchor: "clients",
    title: "Clients",
    body: "Full CRM per client: contacts, brand assets, tax details, plus every project, quote, invoice, expense and payment in one profile.",
  },
  {
    anchor: "projects",
    title: "Projects",
    body: "One-time or retainer projects per client. Each holds its tasks, files, expenses, contracts and chat — and can generate a full task plan from templates.",
  },
  {
    anchor: "tasks",
    title: "Tasks",
    body: "Hierarchical tasks with subtasks, assignees, priorities and due dates. Switch between list and kanban, drag to reorder.",
  },
  {
    anchor: "invoices",
    title: "Invoices",
    body: "Bill a client's package month in one click — the retainer line and any extras come through ready to price, then print on your letterhead.",
  },
  {
    anchor: "files",
    title: "Files & Reviews",
    body: "Upload deliverables, organize by client/project/folder, and run Frame.io-style review & approval cycles with comments.",
  },
  {
    anchor: "messages",
    title: "Team Chat",
    body: "Channels per project and per client keep every conversation next to the work it belongs to.",
  },
  {
    anchor: "settings",
    title: "Settings",
    body: "Your organization profile, PDF letterhead design, and team members with roles all live here. That's the tour — enjoy!",
  },
];

interface Rect { top: number; left: number; width: number; height: number; }

export function AppTour() {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);

  const storageKey = useMemo(
    () => (user ? `vsf_tour_done_${user.id}` : null),
    [user]
  );

  /**
   * Activate once per user, shortly after login — but only when the tour
   * can't get in anyone's way.
   *
   * It used to start 800ms after ANY page loaded, so someone deep in a
   * project could be part-way through typing a brief when an overlay
   * appeared on top and swallowed their keystrokes. A product tour is a
   * "here's where things live" thing: it belongs on the dashboard, on
   * arrival, with nothing else open.
   */
  useEffect(() => {
    if (!storageKey) return;
    if (pathname !== "/") return;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch { return; }
    const t = setTimeout(() => {
      // Don't interrupt someone mid-task. Not every dialog in the app uses the
      // shared Modal, so this asks the DOM what's actually happening rather
      // than trusting a marker to have been added: an overlay on screen, or a
      // caret sitting in a field, both mean "come back later".
      const focused = document.activeElement as HTMLElement | null;
      const typing =
        !!focused &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName) || focused.isContentEditable);
      if (typing) return;
      if (document.querySelector("[data-modal-open], [role='dialog']")) return;
      setActive(true);
    }, 800);
    return () => clearTimeout(t);
  }, [storageKey, pathname]);

  const finish = useCallback(() => {
    setActive(false);
    try {
      if (storageKey) localStorage.setItem(storageKey, new Date().toISOString());
    } catch { /* ignore */ }
  }, [storageKey]);

  // Track the anchor's position for the current step.
  useEffect(() => {
    if (!active) return;
    const current = STEPS[step];
    const measure = () => {
      if (!current.anchor) { setAnchorRect(null); return; }
      // The sidebar renders twice (mobile drawer + desktop rail), so the same
      // data-tour attribute can match multiple nodes. Pick the one that is
      // actually visible inside the viewport.
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${current.anchor}"]`)
      );
      const visible = candidates
        .map((el) => el.getBoundingClientRect())
        .find(
          (r) =>
            r.width > 0 &&
            r.height > 0 &&
            r.left >= 0 &&
            r.top >= 0 &&
            r.right <= window.innerWidth &&
            r.bottom <= window.innerHeight
        );
      if (!visible) { setAnchorRect(null); return; }
      setAnchorRect({
        top: visible.top,
        left: visible.left,
        width: visible.width,
        height: visible.height,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step]);

  // Keyboard: Esc skips, arrows navigate.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Never act on a keystroke meant for a field. A global listener that
      // doesn't check this will happily eat someone's typing.
      const el = e.target as HTMLElement | null;
      if (el && (
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
        || el.isContentEditable
      )) return;

      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const highlighted = current.anchor && anchorRect;

  // Popover placement: to the right of the sidebar anchor, vertically clamped.
  const popoverStyle: React.CSSProperties = highlighted
    ? {
        position: "fixed",
        left: Math.min(anchorRect!.left + anchorRect!.width + 16, window.innerWidth - 360),
        top: Math.max(16, Math.min(anchorRect!.top - 12, window.innerHeight - 260)),
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="fixed inset-0 z-[120]">
      {/* Overlay — with spotlight cutout when a target is highlighted */}
      {highlighted ? (
        <div
          className="fixed rounded-xl ring-2 ring-indigo-400 transition-all duration-300"
          style={{
            top: anchorRect!.top - 4,
            left: anchorRect!.left - 4,
            width: anchorRect!.width + 8,
            height: anchorRect!.height + 8,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/80" onClick={finish} />
      )}

      {/* Popover card */}
      <div
        style={popoverStyle}
        className="w-[min(340px,calc(100vw-32px))] max-w-[calc(100vw-32px)] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/50 p-5 text-slate-100"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {step === 0 && <BrandLogo className="w-6 h-6 text-white" />}
            <h3 className="text-sm font-bold">{current.title}</h3>
          </div>
          <button
            onClick={finish}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
            title="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">{current.body}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-indigo-500" : "w-1.5 bg-slate-700 hover:bg-slate-600"
              }`}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={finish}
            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-white/[0.05] transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              {step === 0 ? "Start tour" : isLast ? "Finish" : "Next"}
              {!isLast && <ArrowRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
