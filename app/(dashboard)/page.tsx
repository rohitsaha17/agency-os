"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can, type Capability } from "@/lib/permissions";
import { RoleBlocks } from "@/components/dashboard/RoleBlocks";
import { formatMoney } from "@/lib/money";
import {
  AlertCircle, Clock, CheckCircle2, Ban, FolderKanban,
  TrendingUp, Users, FileText, HardDrive, ArrowRight,
  RefreshCw, Calendar, ChevronRight, Zap, MessageSquare,
  Upload, LayoutGrid, Receipt, UserPlus, BarChart3,
} from "lucide-react";
// ── Types ─────────────────────────────────────────────────────

interface DashboardStats {
  activeProjects: number;
  totalProjects: number;
  overdueTasksCount: number;
  blockedTasksCount: number;
  filesInReview: number;
  activeClients: number;
  completionRate: number;
  monthCompletionRate: number;
  completedThisMonth: number;
  expensesThisMonth?: number | null; // absent when the caller lacks financials.view
  expenseCount: number;
  pendingExpenses: number;
}

interface TaskStats {
  todo: number; inProgress: number; inReview: number;
  done: number; blocked: number; total: number;
}

interface UrgentItem {
  type: string; id: string; title: string;
  subtitle: string; link: string;
  severity: "high" | "medium" | "low";
  daysOverdue?: number;
}

interface ProjectHealth {
  id: string; name: string; status: string;
  client: { id: string; name: string } | null;
  progress: number; total: number; done: number;
  blocked: number; overdue: number;
  daysLeft: number | null; risk: "red" | "amber" | "green";
  endDate: string | null;
}

interface DeadlineTask {
  id: string; title: string; dueDate: string;
  priority: string; status: string;
  project: { id: string; name: string } | null;
}

interface DeadlineProject {
  id: string; name: string; endDate: string; status: string;
  client: { id: string; name: string } | null;
}

interface FeedItem {
  type: string; id: string; title: string;
  subtitle: string; time: string; link: string;
}

interface DashboardData {
  generatedAt: string;
  currency?: string;
  stats: DashboardStats;
  taskStats: TaskStats;
  urgentItems: UrgentItem[];
  projectHealth: ProjectHealth[];
  upcomingDeadlines: { tasks: DeadlineTask[]; projects: DeadlineProject[] };
  recentActivity: FeedItem[];
}

// ── Helpers ───────────────────────────────────────────────────

function fmt(n: number, currency = "USD") {
  // Compact notation keeps the correct currency symbol (₹1.2L stays ₹, not $)
  return formatMoney(n, currency, {
    compact: n >= 1_000,
    precision: n >= 1_000 ? 1 : 0,
  });
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(d: string) {
  const date = new Date(d);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "bg-red-100 text-red-700",
  HIGH:   "bg-orange-100 text-orange-700",
  MEDIUM: "bg-blue-50 text-blue-700",
  LOW:    "bg-gray-100 text-gray-600",
};

// ── Sub-components ────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color, href, accent = false }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string; href?: string; accent?: boolean;
}) {
  const inner = (
    <div className={`bg-white border rounded-2xl px-5 py-4 flex items-center gap-4 transition-all group ${
      href ? "hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5 cursor-pointer" : ""
    } ${accent ? "border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white" : "border-gray-200"}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${color} transition-transform group-hover:scale-105`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
      {href && <ArrowRight className="w-4 h-4 text-gray-200 group-hover:text-indigo-400 transition-colors flex-shrink-0" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ProgressBar({ value, color = "bg-indigo-500", bg = "bg-gray-100" }: {
  value: number; color?: string; bg?: string;
}) {
  return (
    <div className={`h-1.5 rounded-full overflow-hidden ${bg}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function RiskDot({ risk }: { risk: "red" | "amber" | "green" }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
      risk === "red" ? "bg-red-500" : risk === "amber" ? "bg-amber-400" : "bg-emerald-500"
    }`} />
  );
}

function TaskBreakdown({ stats }: { stats: TaskStats }) {
  if (stats.total === 0) return (
    <div className="flex items-center justify-center py-6 text-xs text-gray-400">No tasks yet</div>
  );
  const pct = (n: number) => (n / stats.total) * 100;
  const bars = [
    { label: "Done",        value: stats.done,       color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
    { label: "In Progress", value: stats.inProgress, color: "bg-blue-500",    text: "text-blue-700",    bg: "bg-blue-50" },
    { label: "In Review",   value: stats.inReview,   color: "bg-yellow-400",  text: "text-yellow-700",  bg: "bg-yellow-50" },
    { label: "To Do",       value: stats.todo,        color: "bg-gray-300",    text: "text-gray-600",    bg: "bg-gray-50" },
    { label: "Blocked",     value: stats.blocked,    color: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50" },
  ];

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {bars.filter((b) => b.value > 0).map((b) => (
          <div
            key={b.label}
            className={`${b.color} transition-all duration-500`}
            style={{ width: `${pct(b.value)}%` }}
            title={`${b.label}: ${b.value}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-2">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${b.color}`} />
            <span className="text-xs text-gray-600 truncate">{b.label}</span>
            <span className={`text-xs font-semibold ml-auto ${b.text}`}>{b.value}</span>
          </div>
        ))}
      </div>
      {/* Completion rate */}
      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">Completion rate</span>
        <span className="text-sm font-bold text-gray-900">
          {stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}

function UrgentPanel({ items }: { items: UrgentItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
        <p className="text-sm font-medium text-gray-700">All clear!</p>
        <p className="text-xs text-gray-400 mt-0.5">No urgent items right now</p>
      </div>
    );
  }

  const SEVERITY = {
    high:   { border: "border-l-red-500",   bg: "bg-red-50/50",    icon: <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" /> },
    medium: { border: "border-l-amber-400", bg: "bg-amber-50/50",  icon: <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /> },
    low:    { border: "border-l-blue-400",  bg: "bg-blue-50/30",   icon: <Zap className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" /> },
  };

  const TYPE_LABELS: Record<string, string> = {
    task_overdue: "OVERDUE",
    task_blocked: "BLOCKED",
    files_review: "REVIEW",
  };

  return (
    <div className="space-y-1.5">
      {items.map((item, idx) => {
        const sev = SEVERITY[item.severity];
        return (
          <Link key={`${item.type}-${item.id}-${idx}`} href={item.link}>
            <div className={`flex items-start gap-2.5 p-3 rounded-xl border-l-4 ${sev.border} ${sev.bg} hover:opacity-90 transition-opacity`}>
              {sev.icon}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-bold tracking-wide ${
                    item.severity === "high" ? "text-red-600" :
                    item.severity === "medium" ? "text-amber-600" : "text-blue-600"
                  }`}>
                    {TYPE_LABELS[item.type] ?? item.type.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{item.subtitle}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ProjectHealthRow({ project }: { project: ProjectHealth }) {
  const progressColor =
    project.risk === "red" ? "bg-red-500" :
    project.risk === "amber" ? "bg-amber-400" :
    "bg-emerald-500";

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
        <RiskDot risk={project.risk} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
            <span className="text-xs font-bold text-gray-700 ml-2 flex-shrink-0">{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} color={progressColor} />
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-400 truncate">{project.client?.name}</span>
            {project.blocked > 0 && (
              <span className="text-xs text-red-500 flex items-center gap-1 flex-shrink-0">
                <Ban className="w-3 h-3" /> {project.blocked} blocked
              </span>
            )}
            {project.overdue > 0 && (
              <span className="text-xs text-red-500 flex items-center gap-1 flex-shrink-0">
                <AlertCircle className="w-3 h-3" /> {project.overdue} overdue
              </span>
            )}
            {project.daysLeft !== null && (
              <span className={`text-xs flex-shrink-0 ml-auto ${
                project.daysLeft < 0 ? "text-red-500 font-medium" :
                project.daysLeft <= 3 ? "text-amber-600 font-medium" :
                "text-gray-400"
              }`}>
                {project.daysLeft < 0
                  ? `${Math.abs(project.daysLeft)}d overdue`
                  : project.daysLeft === 0
                  ? "Due today"
                  : `${project.daysLeft}d left`}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function UpcomingDeadlines({ tasks, projects }: {
  tasks: DeadlineTask[]; projects: DeadlineProject[];
}) {
  const all: ({ date: string; type: "task" | "project"; id: string; title: string; sub: string; link: string; priority?: string })[] = [
    ...tasks.map((t) => ({
      date: t.dueDate, type: "task" as const, id: t.id, title: t.title,
      sub: t.project?.name ?? "No project",
      link: `/projects/${t.project?.id}`,
      priority: t.priority,
    })),
    ...projects.map((p) => ({
      date: p.endDate!, type: "project" as const, id: p.id, title: p.name,
      sub: p.client?.name ?? "",
      link: `/projects/${p.id}`,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (all.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-gray-400">
        No deadlines in the next 2 weeks
      </div>
    );
  }

  // Group by day label
  const groups: Record<string, typeof all> = {};
  for (const item of all) {
    const label = formatDate(item.date);
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([day, items]) => (
        <div key={day}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 px-1">{day}</p>
          <div className="space-y-1">
            {items.map((item) => (
              <Link key={`${item.type}-${item.id}`} href={item.link}>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  {item.type === "project"
                    ? <FolderKanban className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium truncate">{item.title}</p>
                    <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                  </div>
                  {item.priority && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${PRIORITY_COLORS[item.priority] ?? ""}`}>
                      {item.priority.charAt(0)}
                    </span>
                  )}
                  <span className={`text-xs flex-shrink-0 ${
                    daysUntil(item.date) === 0 ? "text-red-500 font-semibold" :
                    daysUntil(item.date) === 1 ? "text-amber-600 font-medium" :
                    "text-gray-400"
                  }`}>
                    {daysUntil(item.date) === 0 ? "Today" :
                     daysUntil(item.date) === 1 ? "Tomorrow" :
                     `in ${daysUntil(item.date)}d`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-gray-400">
        No recent activity
      </div>
    );
  }

  const ICONS: Record<string, React.ReactNode> = {
    task_completed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    file_uploaded:  <Upload className="w-4 h-4 text-blue-400" />,
    comment_added:  <MessageSquare className="w-4 h-4 text-indigo-400" />,
  };

  return (
    <div className="space-y-0">
      {items.map((item, i) => (
        <Link key={`${item.id}-${i}`} href={item.link}>
          <div className="flex items-start gap-3 py-2.5 hover:bg-gray-50 transition-colors px-1 rounded-xl">
            <div className="w-7 h-7 bg-gray-50 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              {ICONS[item.type] ?? <Zap className="w-4 h-4 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 font-medium leading-snug truncate">{item.title}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{item.subtitle}</p>
            </div>
            <span className="text-xs text-gray-300 flex-shrink-0 mt-0.5">{timeAgo(item.time)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function SectionCard({ title, subtitle, action, children, className = "" }: {
  title: string; subtitle?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-2xl overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action && (
          <Link href={action.href} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors">
            {action.label} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────

/**
 * Shortcuts to the things this person can actually do.
 *
 * Every entry names the capability that reveals it, the same way the sidebar
 * does — this grid was unconditional, so an editor was offered New Project,
 * Add Client, New Invoice, Contracts and Expenses, every one of which the API
 * refuses. A shortcut to a 403 isn't a shortcut.
 */
function QuickActions() {
  const { user } = useCurrentUser();

  type Action = { label: string; href: string; icon: React.ReactNode; accent: string; need: Capability | null };
  const actions: Action[] = ([
    { label: "New Project",    href: "/projects/new",   icon: <FolderKanban className="w-5 h-5" />, accent: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-200 dark:border-indigo-500/30", need: "content.plan" },
    { label: "Add Client",     href: "/clients",        icon: <UserPlus className="w-5 h-5" />,    accent: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-500/30", need: "clients.manage" },
    { label: "New Invoice",    href: "/invoices",       icon: <Receipt className="w-5 h-5" />,     accent: "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200 dark:border-amber-500/30", need: "invoices.manage" },
    { label: "My Tasks",       href: "/tasks",          icon: <CheckCircle2 className="w-5 h-5" />, accent: "bg-violet-50 text-violet-600 hover:bg-violet-100 border-violet-200 dark:border-violet-500/30", need: null },
    { label: "Upload Files",   href: "/files",          icon: <HardDrive className="w-5 h-5" />,   accent: "bg-sky-50 text-sky-600 hover:bg-sky-100 border-sky-200 dark:border-sky-500/30", need: null },
    { label: "My Calendar",    href: "/my-calendar",    icon: <Calendar className="w-5 h-5" />,    accent: "bg-pink-50 text-pink-600 hover:bg-pink-100 border-pink-200 dark:border-pink-500/30", need: null },
    { label: "Contracts",      href: "/contracts",      icon: <FileText className="w-5 h-5" />,    accent: "bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200 dark:border-orange-500/30", need: "financials.view" },
    { label: "Expenses",       href: "/expenses",       icon: <BarChart3 className="w-5 h-5" />,   accent: "bg-teal-50 text-teal-600 hover:bg-teal-100 border-teal-200 dark:border-teal-500/30", need: "expenses.create" },
  ] as Action[]).filter((a) => a.need === null || can(user, a.need));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {actions.map((a) => (
        <Link key={a.label} href={a.href}>
          <div
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl border ${a.accent} transition-all cursor-pointer group hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]`}
          >
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-white shadow-sm group-hover:shadow group-hover:bg-white dark:bg-slate-800 dark:group-hover:bg-slate-700 dark:ring-1 dark:ring-white/5 transition-all">
              {a.icon}
            </div>
            <span className="text-xs font-semibold text-center leading-tight">
              {a.label}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Monthly Metrics mini bar ──────────────────────────────────

function MetricRing({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 24, circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, value) / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="60" height="60" viewBox="0 0 60 60" className="-rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-100 dark:text-slate-800" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        <text x="30" y="30" textAnchor="middle" dominantBaseline="middle"
          style={{ transform: "rotate(90deg)", transformOrigin: "30px 30px" }}
          fontSize="11" fontWeight="700" fill={color}>{value}%</text>
      </svg>
      <span className="text-xs text-gray-500 font-medium text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function DashboardPage() {
  const { user: currentUser } = useCurrentUser();
  // v3: money cards need financials.view. The API strips the values too, so
  // hiding them here is the second layer, never the only one.
  const canSeeMoney = can(currentUser, "financials.view");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (!res.ok) {
        // API errors are now shaped as { error: { message, code } };
        // fall back to a plain string for older callers or unexpected shapes.
        const errObj = json?.error;
        const msg = typeof errObj === "string"
          ? errObj
          : (errObj?.message ?? `Request failed (${res.status})`);
        throw new Error(msg);
      }
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // Auto-refresh every 2 minutes
    const interval = setInterval(() => fetchDashboard(true), 120000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  // ── Loading skeleton ──────────────────────────────────────

  if (loading) {
    const Shimmer = ({ className }: { className: string }) => (
      <div className={`bg-gray-100 rounded animate-pulse ${className}`} />
    );
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            <div>
              <Shimmer className="h-6 w-56 mb-2" />
              <Shimmer className="h-3.5 w-40" />
            </div>
            <Shimmer className="h-4 w-28" />
          </div>
        </div>
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 overflow-auto">
          {/* Stat cards skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-center gap-4">
                <Shimmer className="w-11 h-11 rounded-xl flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <Shimmer className="h-3 w-20 mb-2" />
                  <Shimmer className="h-7 w-12 mb-1.5" />
                  <Shimmer className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </div>
          {/* Quick actions skeleton */}
          <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
            <Shimmer className="h-4 w-28 mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1,2,3,4].map((i) => <Shimmer key={i} className="h-20 rounded-2xl" />)}
            </div>
          </div>
          {/* Middle row skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[1,2,3].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <Shimmer className="h-4 w-32 mb-1.5" />
                    <Shimmer className="h-3 w-20" />
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {[1,2,3,4].map((j) => <Shimmer key={j} className="h-10 rounded-xl" />)}
                </div>
              </div>
            ))}
          </div>
          {/* Bottom row skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[1,2].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <Shimmer className="h-4 w-36 mb-1.5" />
                  <Shimmer className="h-3 w-24" />
                </div>
                <div className="p-5 space-y-3">
                  {[1,2,3,4,5].map((j) => (
                    <div key={j} className="flex items-center gap-3">
                      <Shimmer className="w-8 h-8 rounded-full flex-shrink-0" />
                      <div className="flex-1">
                        <Shimmer className="h-3.5 w-48 mb-1.5" />
                        <Shimmer className="h-2.5 w-32" />
                      </div>
                      <Shimmer className="h-3 w-10" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error / DB not connected ──────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
          {/* Error state */}
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Failed to load dashboard</p>
              <p className="text-sm text-red-700 mt-0.5">{error}</p>
              <button onClick={() => fetchDashboard()} className="mt-2 text-xs text-red-700 underline hover:text-red-900">
                Try again
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
            <QuickActions />
          </div>

          {/* Module overview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <FolderKanban className="w-5 h-5 text-indigo-600" />, label: "Projects", desc: "Manage client projects, tasks, timelines", href: "/projects", color: "bg-indigo-50" },
              { icon: <Users className="w-5 h-5 text-emerald-600" />, label: "Clients", desc: "CRM, brand assets, contacts, tax info", href: "/clients", color: "bg-emerald-50" },
              { icon: <CheckCircle2 className="w-5 h-5 text-blue-600" />, label: "Tasks", desc: "Hierarchical tasks with Kanban + list view", href: "/tasks", color: "bg-blue-50" },
              { icon: <Receipt className="w-5 h-5 text-purple-600" />, label: "Invoices", desc: "Bill clients and track what is outstanding", href: "/invoices", color: "bg-purple-50" },
              { icon: <HardDrive className="w-5 h-5 text-sky-600" />, label: "Files", desc: "Frame.io-style review and asset management", href: "/files", color: "bg-sky-50" },
              { icon: <Calendar className="w-5 h-5 text-pink-600" />, label: "Calendar", desc: "Deadlines and project timelines at a glance", href: "/calendar", color: "bg-pink-50" },
            ].map((m) => (
              <Link key={m.label} href={m.href}>
                <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-indigo-200 transition-all">
                  <div className={`w-10 h-10 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                    {m.icon}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{m.desc}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs text-indigo-600 font-medium">
                    Open module <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, taskStats, urgentItems, projectHealth, upcomingDeadlines, recentActivity } = data;

  /**
   * Who gets the agency-wide picture.
   *
   * financials.view is the line: admin and manager run the business and need
   * totals, revenue and everyone's overdue work. An SMM and a junior get the
   * role blocks — their own work, their own queue — because org counts are
   * neither theirs to act on nor theirs to see.
   */
  const seesOrgOverview = can(currentUser, "financials.view");

  // Headline message
  const alertCount = can(currentUser, "financials.view")
    ? (stats.overdueTasksCount + stats.blockedTasksCount + stats.filesInReview)
    : 0;
  const headlineMsg = alertCount > 0
    ? `You have ${alertCount} item${alertCount !== 1 ? "s" : ""} that need${alertCount === 1 ? "s" : ""} attention`
    : "Everything is on track — great work!";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {greeting()}, {currentUser?.name?.split(" ")[0] ?? "there"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{today}</p>
            {alertCount > 0 ? (
              <p className="text-sm text-amber-700 mt-1 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {headlineMsg}
              </p>
            ) : (
              <p className="text-sm text-emerald-600 mt-1 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {headlineMsg}
              </p>
            )}
          </div>
          <button
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : `Updated ${timeAgo(lastRefresh.toISOString())}`}
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-6 space-y-6 overflow-auto">

        {/* Shortcuts first — the fastest route to the thing you came to do. */}
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <QuickActions />
        </div>

        {/* v3: the blocks THIS role needs — a junior lands on their work, an
            SMM on their review queue, a manager on the money. */}
        <RoleBlocks currency={data.currency} />

        {/*
          Everything below is the AGENCY's position: total projects, org-wide
          overdue, revenue, completion across everyone. That's a manager's
          view of the business, and it was rendering for every role — a junior
          was being shown eight active projects and three clients they have no
          part in. Their dashboard is the blocks above.
        */}
        {seesOrgOverview && (<>

        {/* ── Row 1: Stats ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            icon={<FolderKanban className="w-5 h-5 text-indigo-600" />}
            label="Active Projects"
            value={stats.activeProjects}
            sub={`${stats.totalProjects} total`}
            color="bg-indigo-50"
            href="/projects"
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5 text-red-500" />}
            label="Overdue Tasks"
            value={stats.overdueTasksCount}
            sub={stats.blockedTasksCount > 0 ? `${stats.blockedTasksCount} blocked` : "All on track"}
            color={stats.overdueTasksCount > 0 ? "bg-red-50" : "bg-gray-50"}
            href="/tasks"
          />
          <StatCard
            icon={<HardDrive className="w-5 h-5 text-sky-600" />}
            label="Files In Review"
            value={stats.filesInReview}
            sub="Awaiting approval"
            color={stats.filesInReview > 0 ? "bg-sky-50" : "bg-gray-50"}
            href="/files"
          />
          {/* v3: money cards need financials.view (API also strips values) */}
          {canSeeMoney && (
            <StatCard
              icon={<Receipt className="w-5 h-5 text-amber-600" />}
              label="Expenses (Month)"
              value={fmt(stats.expensesThisMonth ?? 0, data.currency)}
              sub={stats.pendingExpenses > 0 ? `${stats.pendingExpenses} pending` : `${stats.expenseCount} this month`}
              color={stats.pendingExpenses > 0 ? "bg-amber-50" : "bg-gray-50"}
              href="/expenses"
            />
          )}
          <StatCard
            icon={<Users className="w-5 h-5 text-emerald-600" />}
            label="Active Clients"
            value={stats.activeClients}
            sub="Currently engaged"
            color="bg-emerald-50"
            href="/clients"
          />
        </div>

        {/* ── Row 3: Urgent + Task breakdown + Performance ──── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard
            title={`Needs Attention ${urgentItems.length > 0 ? `(${urgentItems.length})` : ""}`}
            subtitle="Sorted by urgency"
            className="col-span-1"
          >
            <UrgentPanel items={urgentItems} />
          </SectionCard>

          <SectionCard
            title="Task Overview"
            subtitle={`${taskStats.total} total tasks`}
            action={{ label: "All Tasks", href: "/tasks" }}
            className="col-span-1"
          >
            <TaskBreakdown stats={taskStats} />
          </SectionCard>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden col-span-1">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">This Month</h2>
              <p className="text-xs text-gray-400 mt-0.5">Performance overview</p>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-around">
                <MetricRing
                  value={stats.monthCompletionRate}
                  label="Task Completion"
                  color="#6366f1"
                />
                <MetricRing
                  value={stats.completionRate}
                  label="Overall Done"
                  color="#10b981"
                />
                <MetricRing
                  value={stats.activeProjects > 0 ? Math.min(100, Math.round((projectHealth.filter(p => p.risk === "green").length / Math.max(1, projectHealth.length)) * 100)) : 0}
                  label="Projects On Track"
                  color="#f59e0b"
                />
              </div>
              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Tasks completed</span>
                  <span className="font-semibold text-gray-900">{stats.completedThisMonth} this month</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Active clients</span>
                  <span className="font-semibold text-gray-900">{stats.activeClients}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 4: Project Health ──────────────────────────── */}
        {projectHealth.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Project Health</h2>
                <p className="text-xs text-gray-400 mt-0.5">Active projects sorted by recent activity</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> On track</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> At risk</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Critical</span>
                <Link href="/projects" className="text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-800">
                  All Projects <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
              {projectHealth.map((p) => <ProjectHealthRow key={p.id} project={p} />)}
            </div>
          </div>
        )}

        {/* ── Row 5: Deadlines + Activity ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard
            title="Upcoming Deadlines"
            subtitle="Next 2 weeks"
            action={{ label: "Calendar", href: "/calendar" }}
          >
            <UpcomingDeadlines
              tasks={upcomingDeadlines.tasks}
              projects={upcomingDeadlines.projects}
            />
          </SectionCard>

          <SectionCard
            title="Recent Activity"
            subtitle="Latest updates across the platform"
            action={{ label: "Files", href: "/files" }}
          >
            <ActivityFeed items={recentActivity} />
          </SectionCard>
        </div>

        </>)}

      </div>
    </div>
  );
}
