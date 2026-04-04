"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertCircle, Clock, CheckCircle2, Ban, FolderKanban,
  TrendingUp, Users, FileText, HardDrive, ArrowRight,
  RefreshCw, Calendar, ChevronRight, Zap, MessageSquare,
  Upload, LayoutGrid,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface DashboardStats {
  activeProjects: number;
  totalProjects: number;
  overdueTasksCount: number;
  blockedTasksCount: number;
  filesInReview: number;
  activeClients: number;
  pipelineValue: number;
  openQuotations: number;
  completionRate: number;
  monthCompletionRate: number;
  completedThisMonth: number;
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
  stats: DashboardStats;
  taskStats: TaskStats;
  urgentItems: UrgentItem[];
  projectHealth: ProjectHealth[];
  upcomingDeadlines: { tasks: DeadlineTask[]; projects: DeadlineProject[] };
  recentActivity: FeedItem[];
}

// ── Helpers ───────────────────────────────────────────────────

function fmt(n: number, currency = "USD") {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
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

function StatCard({ icon, label, value, sub, color, href }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string; href?: string;
}) {
  const inner = (
    <div className={`bg-white border rounded-2xl px-5 py-4 flex items-center gap-4 transition-all ${
      href ? "hover:shadow-md hover:border-indigo-200 cursor-pointer" : ""
    } border-gray-200`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
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
    quotation_sent: "FOLLOW UP",
  };

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const sev = SEVERITY[item.severity];
        return (
          <Link key={item.id} href={item.link}>
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
              <Link key={item.id} href={item.link}>
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

function QuickActions() {
  const actions = [
    { label: "New Project",    href: "/projects",    icon: <FolderKanban className="w-4 h-4" />, color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
    { label: "New Quotation",  href: "/quotations/new", icon: <FileText className="w-4 h-4" />,     color: "bg-purple-50 text-purple-700 hover:bg-purple-100" },
    { label: "Upload File",    href: "/files",        icon: <HardDrive className="w-4 h-4" />,     color: "bg-sky-50 text-sky-700 hover:bg-sky-100" },
    { label: "View Calendar",  href: "/calendar",    icon: <Calendar className="w-4 h-4" />,       color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map((a) => (
        <Link key={a.label} href={a.href}>
          <div className={`flex flex-col items-center gap-2 p-4 rounded-2xl border border-transparent ${a.color} transition-colors cursor-pointer`}>
            {a.icon}
            <span className="text-xs font-semibold text-center leading-tight">{a.label}</span>
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
        <circle cx="30" cy="30" r={r} fill="none" stroke="#f3f4f6" strokeWidth="5" />
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
      if (!res.ok) throw new Error(json.error);
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
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-64 mb-1" />
          <div className="h-4 bg-gray-100 rounded w-48" />
        </div>
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1,2,3,4,5].map((i) => <div key={i} className="h-24 bg-white border border-gray-200 rounded-2xl animate-pulse" />)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[1,2,3].map((i) => <div key={i} className="h-56 bg-white border border-gray-200 rounded-2xl animate-pulse" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[1,2].map((i) => <div key={i} className="h-64 bg-white border border-gray-200 rounded-2xl animate-pulse" />)}
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
              { icon: <FileText className="w-5 h-5 text-purple-600" />, label: "Quotations", desc: "Build and send professional proposals", href: "/quotations", color: "bg-purple-50" },
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

  // Headline message
  const alertCount = (stats.overdueTasksCount + stats.blockedTasksCount + stats.filesInReview);
  const headlineMsg = alertCount > 0
    ? `You have ${alertCount} item${alertCount !== 1 ? "s" : ""} that need${alertCount === 1 ? "s" : ""} attention`
    : "Everything is on track — great work!";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{greeting()}, AgencyOS</h1>
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

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 overflow-auto">

        {/* ── Row 1: Stats ───────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
          <StatCard
            icon={<FileText className="w-5 h-5 text-purple-600" />}
            label="Pipeline Value"
            value={fmt(stats.pipelineValue)}
            sub={`${stats.openQuotations} open quotation${stats.openQuotations !== 1 ? "s" : ""}`}
            color="bg-purple-50"
            href="/quotations"
          />
          <StatCard
            icon={<Users className="w-5 h-5 text-emerald-600" />}
            label="Active Clients"
            value={stats.activeClients}
            sub="Currently engaged"
            color="bg-emerald-50"
            href="/clients"
          />
        </div>

        {/* ── Row 2: Quick actions ───────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <QuickActions />
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
                  <span className="text-gray-600">Pipeline value</span>
                  <span className="font-semibold text-indigo-700">{fmt(stats.pipelineValue)}</span>
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

      </div>
    </div>
  );
}
