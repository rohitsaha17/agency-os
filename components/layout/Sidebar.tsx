"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FolderKanban, CheckSquare,
  Calendar, CalendarClock, Receipt, Settings,
  HardDrive, TrendingDown, Scroll, Menu, X,
  Sun, MessageSquare, LogOut, BarChart3,
  PanelLeftClose, PanelLeftOpen, ShieldCheck,
} from "lucide-react";
import { ThemeToggle, ThemeToggleIcon } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useTheme } from "@/components/providers/ThemeProvider";
import { GlobalSearch } from "@/components/ui/GlobalSearch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { can, type Capability } from "@/lib/permissions";


/**
 * The dark-mode row. A <label> wrapping the switch, so tapping the word
 * "Dark mode" flips it too — the switch alone is 44px wide and 24px tall,
 * which is a small thing to hit with a thumb.
 */
function DarkModeRow() {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[44px] rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors">
      <span className="flex items-center gap-2.5 text-sm sm:text-xs font-medium text-slate-400">
        <Sun className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-500" />
        Dark mode
      </span>
      <ThemeToggle />
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────
   Nav structure
   ───────────────────────────────────────────────────────────── */
// v3: every entry names the capability that reveals it, so the nav can't
// drift from what the API actually allows (docs/V3_CONTEXT.md §2). `need:
// null` means "anyone signed in". The server is still the real gate.
const navItems: {
  group: string;
  links: { href: string; label: string; icon: typeof Users; need: Capability | null }[];
}[] = [
  {
    group: "Main",
    links: [
      { href: "/",          label: "Dashboard",    icon: LayoutDashboard, need: null              },
      { href: "/clients",   label: "Clients",      icon: Users,           need: "clients.manage"  },
      // Everyone works inside projects, so everyone gets the list. What you
      // see on a project is already scoped by role — an editor's board shows
      // their own tasks and none of the commercial tabs. Hiding the entry only
      // meant reaching a project you're on took a breadcrumb from somewhere else.
      { href: "/projects",  label: "Projects",     icon: FolderKanban,    need: null              },
    ],
  },
  {
    group: "Work",
    links: [
      { href: "/tasks",        label: "Tasks",        icon: CheckSquare,   need: null                },
      // Reviewing is its own job with its own queue, so it gets its own entry
      // rather than hiding behind a button on the tasks page.
      { href: "/approvals",    label: "Approvals",    icon: ShieldCheck,   need: "tasks.review"      },
      { href: "/my-calendar",  label: "My Calendar",  icon: CalendarClock, need: null                },
      { href: "/messages",     label: "Messages",     icon: MessageSquare, need: null                },
      // "Calendar" next to "My Calendar" gave no clue which was which, so a
      // manager looking for the reel somebody else was scheduling opened the
      // personal one, found nothing, and concluded the calendar was broken.
      { href: "/calendar",     label: "Team Calendar", icon: Calendar,     need: "content.plan"      },
      { href: "/files",        label: "Files",        icon: HardDrive,     need: null                },
      { href: "/reports",      label: "Reports",      icon: BarChart3,     need: "reports.delivery"  },
    ],
  },
  {
    group: "Finance",
    links: [
      { href: "/expenses",  label: "Expenses",  icon: TrendingDown, need: "expenses.create"  },
      { href: "/contracts", label: "Contracts", icon: Scroll,       need: "financials.view"  },
      { href: "/invoices",  label: "Invoices",  icon: Receipt,      need: "invoices.manage"  },
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
            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/40"
            : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]"
          }
          ${soon ? "cursor-default opacity-60" : ""}
        `}
      >
        {/* Accent on the trailing edge of the selected pill */}
        <span
          className={`
            absolute right-0 inset-y-[22%] w-[3px] rounded-l-full
            transition-all duration-200
            ${active ? "bg-indigo-300 opacity-100" : "opacity-0"}
          `}
        />

        {/* Icon — indigo tint when active */}
        <span className="relative flex-shrink-0">
          <Icon
            className={`w-4 h-4 transition-colors duration-150
              ${active ? "text-white" : "text-slate-500 group-hover:text-slate-300"}
            `}
          />
          {/* Collapsed: badge becomes a dot on the icon */}
          {collapsed && badge != null && badge > 0 && (
            <span className={`absolute -top-1 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center px-0.5 text-[9px] font-bold leading-none text-white rounded-full ring-2 ${active ? "bg-white/25 ring-indigo-600" : "bg-indigo-500 ring-slate-900"}`}>
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

  // v3: show a link only if the user holds its capability, and drop a whole
  // section once nothing in it survives — so an SMM sees no Finance heading
  // and a junior sees neither Finance nor Clients/Projects.
  //
  // Expenses is the one link that crosses the line: an SMM may record one
  // (expenses.create) but may not see money (financials.view). Filing an
  // expense under a FINANCE heading for someone with no financial access
  // reads wrong, so for them it moves up into Work instead.
  const seesMoney = can(appUser, "financials.view");
  // Only admin and manager run the agency's settings. Everyone else still
  // needs a way to their own password, so the same link becomes "My Account".
  const managesOrg = can(appUser, "settings.manage");
  const settingsHref = managesOrg ? "/settings" : "/settings?tab=account";
  const settingsLabel = managesOrg ? "Settings" : "My Account";
  const visibleNavItems = navItems
    .map((section) => {
      let links = section.links.filter((l) => l.need === null || can(appUser, l.need));
      if (!seesMoney) {
        if (section.group === "Finance") links = [];
        if (section.group === "Work" && can(appUser, "expenses.create")) {
          const expenses = navItems
            .find((s) => s.group === "Finance")!
            .links.find((l) => l.href === "/expenses")!;
          links = [...links, expenses];
        }
      }
      return { ...section, links };
    })
    .filter((section) => section.links.length > 0);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <UserCard appUser={appUser} collapsed={collapsed} />

      {/*
        The search box is gone from the nav, but search isn't: GlobalSearch
        still mounts (hidden) so Cmd/Ctrl+K opens it. Dropping the component
        entirely would have taken the shortcut with it, silently.
      */}
      <GlobalSearch hideTrigger />

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
              href={settingsHref}
              onClick={onClose}
              title={settingsLabel}
              data-tour="settings"
              className="flex items-center justify-center py-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all duration-150"
            >
              <Settings className="w-4 h-4" />
            </Link>
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
            {/* Dark mode. The whole row is the target, not the 24px switch —
                a thumb should not have to find a small control at the bottom
                of a drawer. */}
            <DarkModeRow />

            {/* Settings — org settings for admin/manager, own account otherwise */}
            <Link
              href={settingsHref}
              onClick={onClose}
              data-tour="settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all duration-150"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              {settingsLabel}
            </Link>

            {/* Sign out */}
            <button
              onClick={async () => {
                try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
                window.location.href = "/login";
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-white/[0.05] transition-all duration-150"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              Log out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager",
  SMM: "SMM", TEAM: "Team", MEMBER: "Team",
};

/**
 * Who is signed in, at the top of the rail rather than buried in the footer.
 *
 * The name and what they are is the context for everything below it — an SMM
 * and an editor see different navs, and the card says which one you're
 * looking at.
 */
function UserCard({ appUser, collapsed }: {
  appUser?: { name: string; email: string; role?: string } | null;
  collapsed?: boolean;
}) {
  const initials = appUser
    ? appUser.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "·";
  const role = appUser?.role ? ROLE_LABEL[appUser.role] ?? appUser.role : null;

  if (collapsed) {
    return (
      <div className="flex justify-center px-3 pb-2 flex-shrink-0" title={appUser?.name ?? "Signed out"}>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm ring-2 ring-white/10">
          {initials}
        </div>
      </div>
    );
  }

  return (
    <div className="px-2.5 pb-3 flex-shrink-0">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ring-2 ring-white/10">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-100 truncate leading-tight">
            {appUser?.name ?? "Signed out"}
          </p>
          <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
            {role ?? appUser?.email ?? "Vibrnd Studio Flow"}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Widen or narrow the rail. Lives in the header beside the bell. */
function CollapseToggle({ collapsed, onToggle }: { collapsed?: boolean; onToggle: () => void }) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button
      onClick={onToggle}
      title={label}
      aria-label={label}
      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
    >
      {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
    </button>
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
        className="hidden lg:flex fixed inset-y-0 left-0 flex-col z-30 bg-slate-900 safe-top safe-bottom"
      >
        {/* Subtle top border accent */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/*
          Brand, bell and the collapse toggle share one row.

          The toggle used to be a small circle hanging off the outside edge of
          the rail, overlapping page content and looking like a dropped
          artefact. It's a normal icon button in the header now, sitting with
          the other two controls.
        */}
        <div className={`h-16 flex items-center border-b border-white/[0.06] flex-shrink-0 ${
          collapsed ? "flex-col justify-center gap-0 px-2" : "justify-between px-4"
        }`}>
          {collapsed ? (
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm ring-1 ring-indigo-400/20" title="Vibrnd Studio Flow">
              <BrandLogo className="w-5 h-5 text-white" />
            </div>
          ) : (
            <>
              <Logo />
              <div className="flex items-center gap-0.5">
                <NotificationBell />
                <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
              </div>
            </>
          )}
        </div>

        {/* Collapsed: the two controls stack under the mark so both stay reachable */}
        {collapsed && (
          <div className="flex flex-col items-center gap-1 pt-2 pb-1 flex-shrink-0">
            <NotificationBell />
            <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          </div>
        )}

        <NavContent pathname={pathname} appUser={appUser} unreadCount={unreadCount} collapsed={collapsed} />
      </aside>

      {/* ── Mobile / tablet top bar ───────────────────────────── */}
      <div className="lg:hidden fixed top-0 inset-x-0 appbar bg-slate-900 flex items-center justify-between px-4 z-40 border-b border-white/[0.06]">
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
          lg:hidden fixed inset-y-0 left-0 w-72 bg-slate-900 flex flex-col z-50 safe-top safe-bottom
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
