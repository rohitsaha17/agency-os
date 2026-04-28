"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FolderKanban, CheckSquare,
  Calendar, FileText, Tag, Receipt, Settings, Zap,
  HardDrive, Users2, TrendingDown, Scroll, Menu, X,
  Sun, MessageSquare,
} from "lucide-react";
import { ThemeToggle, ThemeToggleIcon } from "@/components/ui/ThemeToggle";
import { useTheme } from "@/components/providers/ThemeProvider";
import { GlobalSearch } from "@/components/ui/GlobalSearch";

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
      { href: "/messages",     label: "Messages",     icon: MessageSquare },
      { href: "/calendar",     label: "Calendar",     icon: Calendar      },
      { href: "/files",        label: "Files",        icon: HardDrive     },
      { href: "/quotations",   label: "Quotations",   icon: FileText      },
      { href: "/rate-cards",   label: "Rate Cards",   icon: Tag           },
      { href: "/stakeholders", label: "Stakeholders", icon: Users2        },
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
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  soon?: boolean;
  active: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <li>
      <Link
        href={soon ? "#" : href}
        onClick={onClick}
        className={`
          relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
          transition-all duration-150 group overflow-hidden
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
        <Icon
          className={`w-4 h-4 flex-shrink-0 transition-colors duration-150
            ${active ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"}
          `}
        />

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
}: {
  pathname: string;
  onClose?: () => void;
  appUser?: { name: string; email: string } | null;
  unreadCount: number;
}) {
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Global Search */}
      <div className="px-2.5 pt-3 pb-1 flex-shrink-0">
        <GlobalSearch />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2.5 space-y-5">
        {navItems.map((section) => (
          <div key={section.group}>
            <p className="px-3 mb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest select-none">
              {section.group}
            </p>
            <ul className="space-y-0.5">
              {section.links.map(({ href, label, icon, soon }: { href: string; label: string; icon: React.ElementType; soon?: boolean }) => (
                <NavItem
                  key={href}
                  href={href}
                  label={label}
                  icon={icon}
                  soon={soon}
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
      <div className="px-2.5 py-3 border-t border-white/[0.06] space-y-0.5">
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all duration-150"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          Settings
        </Link>

        {/* User row */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mt-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ring-1 ring-indigo-400/30">
            {appUser ? appUser.name.charAt(0).toUpperCase() : "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-200 truncate leading-tight">
              {appUser?.name ?? "Admin"}
            </p>
            <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
              {appUser?.email ?? "AgencyOS"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Logo mark
   ───────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm ring-1 ring-indigo-400/20">
        <Zap className="w-4 h-4 text-white" />
      </div>
      <span className="text-white font-semibold text-sm tracking-tight">
        AgencyOS
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Sidebar component
   ───────────────────────────────────────────────────────────── */
interface AppUser { id: string; name: string; email: string; role: string; }

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

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
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: AppUser[]) => {
        if (Array.isArray(data) && data.length > 0) {
          // Show the first ADMIN, or just the first user
          const admin = data.find((u) => u.role === "ADMIN") ?? data[0];
          setAppUser(admin);
        }
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
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col z-30 bg-slate-900">
        {/* Subtle top border accent */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* Logo / Brand */}
        <div className="h-16 flex items-center px-5 border-b border-white/[0.06] flex-shrink-0">
          <Logo />
        </div>

        <NavContent pathname={pathname} appUser={appUser} unreadCount={unreadCount} />
      </aside>

      {/* ── Mobile / tablet top bar ───────────────────────────── */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-slate-900 flex items-center justify-between px-4 z-40 border-b border-white/[0.06]">
        <Logo />
        <div className="flex items-center gap-1">
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
