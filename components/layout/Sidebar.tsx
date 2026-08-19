"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FolderKanban, CheckSquare,
  Calendar, CalendarClock, Receipt, Settings,
  HardDrive, TrendingDown, Scroll, Menu, X,
  Sun, MessageSquare, LogOut, BarChart3,
  ChevronsLeft, ChevronsRight, Search,
} from "lucide-react";
import { ThemeToggle, ThemeToggleIcon } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useTheme } from "@/components/providers/ThemeProvider";
import { GlobalSearch } from "@/components/ui/GlobalSearch";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/* ─────────────────────────────────────────────────────────────
   Nav structure
   ───────────────────────────────────────────────────────────── */
const navItems = [
  {
    group: "Main",
    links: [
      { href: "/",          label: "Dashboard",    icon: LayoutDashboard },
      { href: "/clients",   label: "Clients",      icon: Users           },
      { href: "/projects",  label: "Projects",     icon: FolderKanban    },
    ],
  },
  {
    group: "Work",
    links: [
      { href: "/tasks",        label: "Tasks",        icon: CheckSquare   },
      { href: "/my-calendar",  label: "My Calendar",  icon: CalendarClock },
      { href: "/messages",     label: "Messages",     icon: MessageSquare },
      { href: "/calendar",     label: "Calendar",     icon: Calendar      },
      { href: "/files",        label: "Files",        icon: HardDrive     },
      { href: "/reports",      label: "Reports",      icon: BarChart3     },
    ],
  },
  {
    group: "Finance",
    links: [
      { href: "/expenses",  label: "Expenses",  icon: TrendingDown                      },
      { href: "/contracts", label: "Contracts", icon: Scroll                             },
      { href: "/invoices",  label: "Invoices",  icon: Receipt },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────
   Shared nav item component — renders a single nav link
   ───────────────────────────────────────────────────────────── */
function NavItem({
  href,
  label,
  icon: Icon,
  soon,
  active,
  badge,
  collapsed,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  soon?: boolean;
  active: boolean;
  badge?: number;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <Link
        href={soon ? "#" : href}
        onClick={onClick}
        title={collapsed ? label : undefined}
        data-tour={href === "/" ? "dashboard" : href.slice(1)}
        className={`
          relative flex items-center rounded-lg text-sm font-medium
          transition-all duration-150 group overflow-hidden
          ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}
          ${active
            ? "bg-white/[0.06] text-white"
            : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]"
          }
          ${soon ? "cursor-default opacity-60" : ""}
        `}
      >
        {/* Active left indicator bar */}
        <span
          className={`
            absolute left-0 inset-y-[20%] w-[3px] rounded-r-full
            transition-all duration-200
            ${active ? "bg-indigo-400 opacity-100" : "opacity-0"}
          `}
        />

        {/* Icon — indigo tint when active */}
        <span className="relative flex-shrink-0">
          <Icon
            className={`w-4 h-4 transition-colors duration-150
              ${active ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"}
            `}
          />
          {/* Collapsed: badge becomes a dot on the icon */}
          {collapsed && badge != null && badge > 0 && (
            <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center px-0.5 text-[9px] font-bold leading-none text-white bg-indigo-500 rounded-full ring-2 ring-slate-900">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>

        {!collapsed && (
          <>
            <span className="flex-1 tracking-tight">{label}</span>

            {badge != null && badge > 0 && (
              <span className="min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[11px] font-semibold leading-none text-white bg-indigo-500 rounded-full">
                {badge > 99 ? "99+" : badge}
              </span>
            )}

            {soon && (
              <span className="text-[10px] font-normal text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-md">
                Soon
              </span>
            )}
          </>
        )}
      </Link>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────
   Shared nav content (desktop sidebar + mobile drawer)
   ───────────────────────────────────────────────────────────── */
function NavContent({
  pathname,
  onClose,
  appUser,
  unreadCount,
  collapsed,
}: {
  pathname: string;
  onClose?: () => void;
  appUser?: { name: string; email: string; role?: string } | null;
  unreadCount: number;
  collapsed?: boolean;
}) {
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // v2 visibility rule: MEMBERs never see the Finance section, and Reports
  // is managers/admins only. (Server-side enforcement is the real gate.)
  const isMember = appUser?.role === "MEMBER";
  const visibleNavItems = navItems
    .filter((section) => !(isMember && section.group === "Finance"))
    .map((section) =>
      section.group === "Work" && isMember
        ? { ...section, links: section.links.filter((l) => l.href !== "/reports") }
        : section,
    );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Global Search — collapsed shows a compact icon trigger */}
      <div className={`pt-3 pb-1 flex-shrink-0 ${collapsed ? "px-3" : "px-2.5"}`}>
        {collapsed ? (
          <button
            title="Search (⌘K)"
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
            className="w-full flex items-center justify-center py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
        ) : (
          <GlobalSearch />
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-2 space-y-5 ${collapsed ? "px-3" : "px-2.5"}`}>
        {visibleNavItems.map((section) => (
          <div key={section.group}>
            {collapsed ? (
              <div className="h-px bg-white/[0.06] mx-1 mb-1.5" />
            ) : (
              <p className="px-3 mb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest select-none">
                {section.group}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.links.map(({ href, label, icon, soon }: { href: string; label: string; icon: React.ElementType; soon?: boolean }) => (
                <NavItem
                  key={href}
                  href={href}
                  label={label}
                  icon={icon}
                  soon={soon}
                  collapsed={collapsed}
                  active={isActive(href)}
                  badge={href === "/messages" ? unreadCount : undefined}
                  onClick={onClose}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`py-3 border-t border-white/[0.06] space-y-0.5 ${collapsed ? "px-3" : "px-2.5"}`}>
        {collapsed ? (
          <>
            <div className="flex justify-center py-1.5" title="Toggle dark mode">
              <ThemeToggleIcon />
            </div>
            <Link
              href="/settings"
              onClick={onClose}
              title="Settings"
              data-tour="settings"
              className="flex items-center justify-center py-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all duration-150"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <div className="flex justify-center pt-1" title={appUser?.name ?? "Signed out"}>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm ring-1 ring-indigo-400/30">
                {appUser ? appUser.name.charAt(0).toUpperCase() : "·"}
              </div>
            </div>
            <button
              onClick={async () => {
                try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
                window.location.href = "/login";
              }}
              title="Log out"
              className="w-full flex items-center justify-center py-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            {/* Dark mode toggle row */}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-2.5 text-xs font-medium text-slate-400">
                <Sun className="w-3.5 h-3.5 text-slate-500" />
                Dark mode
              </span>
              <ThemeToggle />
            </div>

            {/* Settings */}
            <Link
              href="/settings"
              onClick={onClose}
              data-tour="settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all duration-150"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              Settings
            </Link>

            {/* User row */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mt-1">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ring-1 ring-indigo-400/30">
                {appUser ? appUser.name.charAt(0).toUpperCase() : "·"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate leading-tight">
                  {appUser?.name ?? "Signed out"}
                </p>
                <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                  {appUser?.email ?? "Vibrnd Studio Flow"}
                </p>
              </div>
              <button
                onClick={async () => {
                  try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
                  window.location.href = "/login";
                }}
                title="Log out"
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors flex-shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Logo mark
   ───────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div className="flex items-center gap-2.5 text-white">
      <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm ring-1 ring-indigo-400/20">
        <BrandLogo className="w-4.5 h-4.5 text-white" />
      </div>
      <span className="font-semibold text-sm tracking-tight leading-tight">
        Vibrnd
        <span className="block text-[9px] font-medium tracking-[0.18em] uppercase text-slate-400">
          Studio Flow
        </span>
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Sidebar component
   ───────────────────────────────────────────────────────────── */
interface AppUser { id: string; name: string; email: string; role: string; }

const COLLAPSE_KEY = "vsf_sidebar_collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  /* Restore the collapsed preference, then keep `body` in sync so the
     content pane (styled in globals.css) shifts with the rail. */
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
    return () => document.body.classList.remove("sidebar-collapsed");
  }, [collapsed]);

  /* Fetch unread message count */
  const fetchUnread = useCallback(() => {
    fetch("/api/channels/unread-count")
      .then((r) => r.json())
      .then((data: { unreadCount?: number }) => {
        if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
      })
      .catch(() => {});
  }, []);

  /* Poll unread count on mount and every 60 seconds.
     TODO: replace polling with a WebSocket subscription once the realtime
     layer lands — this cuts request volume ~50% vs. the old 30s cadence. */
  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  useEffect(() => {
    // The footer identity is the LOGGED-IN user, not "some admin".
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AppUser | null) => {
        if (data && data.id) setAppUser(data);
      })
      .catch(() => {});
  }, []);

  /* Close drawer on route change */
  useEffect(() => { setOpen(false); }, [pathname]);

  /* Lock body scroll when mobile drawer is open */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* Focus trap: when drawer opens, focus the close button; on close,
     restore focus to whatever triggered it. */
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      openerRef.current = (document.activeElement as HTMLElement) ?? null;
      // Defer to after the drawer is rendered
      const t = setTimeout(() => closeBtnRef.current?.focus(), 30);
      return () => clearTimeout(t);
    } else if (openerRef.current) {
      openerRef.current.focus?.();
      openerRef.current = null;
    }
  }, [open]);

  return (
    <>
      {/* ── Desktop sidebar (lg+) ─────────────────────────────── */}
      <aside
        // Inline width so the rail animates reliably regardless of which
        // Tailwind width utilities get generated.
        style={{ width: collapsed ? 72 : 256, transition: "width 200ms ease" }}
        className="hidden lg:flex fixed inset-y-0 left-0 flex-col z-30 bg-slate-900"
      >
        {/* Subtle top border accent */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* Logo / Brand + notification bell */}
        <div className={`h-16 flex items-center border-b border-white/[0.06] flex-shrink-0 ${
          collapsed ? "justify-center px-2" : "justify-between px-5"
        }`}>
          {collapsed ? (
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm ring-1 ring-indigo-400/20" title="Vibrnd Studio Flow">
              <BrandLogo className="w-5 h-5 text-white" />
            </div>
          ) : (
            <>
              <Logo />
              <NotificationBell />
            </>
          )}
        </div>

        {/* Collapsed: bell moves under the mark so it stays reachable */}
        {collapsed && (
          <div className="flex justify-center pt-2 flex-shrink-0">
            <NotificationBell />
          </div>
        )}

        <NavContent pathname={pathname} appUser={appUser} unreadCount={unreadCount} collapsed={collapsed} />

        {/* Collapse / expand handle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-slate-800 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-700 shadow-md flex items-center justify-center transition-colors z-40"
        >
          {collapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {/* ── Mobile / tablet top bar ───────────────────────────── */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-slate-900 flex items-center justify-between px-4 z-40 border-b border-white/[0.06]">
        <Logo />
        <div className="flex items-center gap-1">
          <NotificationBell align="right" />
          <ThemeToggleIcon />
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Mobile backdrop ───────────────────────────────────── */}
      <div
        className={`
          lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm
          transition-opacity duration-300
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ── Mobile drawer ─────────────────────────────────────── */}
      <aside
        className={`
          lg:hidden fixed inset-y-0 left-0 w-72 bg-slate-900 flex flex-col z-50
          transform transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
        aria-label="Mobile navigation"
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-white/[0.06] flex-shrink-0">
          <Logo />
          <button
            ref={closeBtnRef}
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <NavContent pathname={pathname} onClose={() => setOpen(false)} appUser={appUser} unreadCount={unreadCount} />
      </aside>
    </>
  );
}
