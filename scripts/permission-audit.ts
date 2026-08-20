/**
 * V3 Phase 8 — the permission audit (docs/V3_CONTEXT.md §8).
 *
 * Logs in as each role and hits every API route directly, recording the
 * status and whether any money-bearing key came back. UI hiding is never the
 * gate; this proves the API itself refuses.
 *
 *   npx tsx scripts/permission-audit.ts            # against localhost:3000
 *   BASE=https://… npx tsx scripts/permission-audit.ts
 *
 * Writes docs/PERMISSION_AUDIT.md and exits non-zero if anything leaked.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = "Studio@2026";

const ACCOUNTS = [
  { role: "ADMIN",   email: "admin@vibrnd.test" },
  { role: "MANAGER", email: "manager@vibrnd.test" },
  { role: "SMM",     email: "smm@vibrnd.test" },
  { role: "TEAM",    email: "editor@vibrnd.test" },
];

/** Keys that must never reach a role without financials.view. */
const MONEY_KEYS = [
  "amount", "budget", "cycleAmount", "unitPrice", "billingAmount",
  "total", "subtotal", "revenue", "outstanding", "invoiced", "collected",
  "margin", "value", "defaultRate",
];

interface Probe {
  path: string;
  /** Roles that SHOULD get a 2xx. Everyone else must be refused or scoped. */
  allow: string[];
  /** True when a 200 carrying money is expected for the allowed roles. */
  money?: boolean;
  note?: string;
}

const PROBES: Probe[] = [
  // ── Money: the blackout ──
  { path: "/api/invoices",                  allow: ["ADMIN", "MANAGER"], money: true },
  { path: "/api/receipts",                  allow: ["ADMIN", "MANAGER"], money: true },
  { path: "/api/billable-items",            allow: ["ADMIN", "MANAGER"], money: true },
  { path: "/api/expenses",                  allow: ["ADMIN", "MANAGER", "SMM"], money: true,
    note: "SMM may file an expense but sees no amounts — stripped, not refused" },

  // ── Clients & projects ──
  { path: "/api/clients",                   allow: ["ADMIN", "MANAGER", "SMM", "TEAM"],
    note: "TEAM is scoped to clients they hold work on" },
  { path: "/api/projects",                  allow: ["ADMIN", "MANAGER", "SMM", "TEAM"],
    note: "TEAM is scoped to projects they hold work on" },
  { path: "/api/contracts",                 allow: ["ADMIN", "MANAGER"] },

  // ── Work ──
  { path: "/api/tasks?all=1",               allow: ["ADMIN", "MANAGER", "SMM", "TEAM"] },
  { path: "/api/tasks/approvals",           allow: ["ADMIN", "MANAGER", "SMM"] },
  { path: "/api/my-calendar?from=2026-08-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
    allow: ["ADMIN", "MANAGER", "SMM", "TEAM"] },
  { path: "/api/master-calendar?year=2026&month=8", allow: ["ADMIN", "MANAGER", "SMM", "TEAM"] },

  // ── Administration ──
  { path: "/api/users",                     allow: ["ADMIN", "MANAGER", "SMM", "TEAM"],
    note: "readable by all — assignment pickers need it; only ADMIN may write" },
  { path: "/api/designations",              allow: ["ADMIN", "MANAGER", "SMM", "TEAM"] },
  { path: "/api/permissions/matrix",        allow: ["ADMIN", "MANAGER", "SMM", "TEAM"] },

  // ── Reporting ──
  { path: "/api/reports/v3?report=delivery", allow: ["ADMIN", "MANAGER", "SMM"] },
  { path: "/api/reports/v3?report=financial", allow: ["ADMIN"], money: true },

  // ── Dashboard ──
  { path: "/api/dashboard/v3",              allow: ["ADMIN", "MANAGER", "SMM", "TEAM"] },
];

interface Result {
  role: string;
  path: string;
  status: number;
  moneyKeys: string[];
  verdict: "ok" | "LEAK" | "unexpected";
  note?: string;
}

async function login(email: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) return null;
  return res.headers.get("set-cookie");
}

function findMoney(body: string): string[] {
  return [...new Set(
    MONEY_KEYS.filter((k) => new RegExp(`"${k}"\\s*:\\s*(?!null)`).test(body)),
  )];
}

async function main() {
  const results: Result[] = [];
  let leaks = 0;

  for (const account of ACCOUNTS) {
    const cookie = await login(account.email);
    if (!cookie) {
      console.error(`✗ could not sign in as ${account.email} — run scripts/seed-v3-test-users.ts`);
      process.exit(1);
    }

    for (const probe of PROBES) {
      const res = await fetch(`${BASE}${probe.path}`, { headers: { cookie } });
      const body = await res.text();
      const allowed = probe.allow.includes(account.role);
      const seesMoney = account.role === "ADMIN" || account.role === "MANAGER";
      const moneyKeys = res.ok ? findMoney(body) : [];

      let verdict: Result["verdict"] = "ok";
      // The one thing that must never happen.
      if (moneyKeys.length > 0 && !seesMoney) { verdict = "LEAK"; leaks++; }
      else if (allowed && res.status >= 400) verdict = "unexpected";
      else if (!allowed && res.ok) verdict = "unexpected";

      results.push({
        role: account.role, path: probe.path, status: res.status,
        moneyKeys, verdict, note: probe.note,
      });
    }
  }

  // ── the document ──
  const byPath = new Map<string, Result[]>();
  for (const r of results) {
    if (!byPath.has(r.path)) byPath.set(r.path, []);
    byPath.get(r.path)!.push(r);
  }

  const lines: string[] = [
    "# Permission audit",
    "",
    "Generated by `npx tsx scripts/permission-audit.ts`. Every route is hit",
    "directly as each role — the interface is not involved, because hiding a",
    "button was never the gate (docs/V3_CONTEXT.md Prime Directive).",
    "",
    `Run against \`${BASE}\` on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "## What counts as a failure",
    "",
    "- **LEAK** — a money-bearing key reached SMM or TEAM. This is the one that matters.",
    "- **unexpected** — a role was refused something it should hold, or allowed something it shouldn't.",
    "",
    "## Results",
    "",
    "| Route | ADMIN | MANAGER | SMM | TEAM | Notes |",
    "|---|---|---|---|---|---|",
  ];

  for (const [path, rows] of byPath) {
    const cell = (role: string) => {
      const r = rows.find((x) => x.role === role);
      if (!r) return "—";
      const flag = r.verdict === "LEAK" ? " 🚨" : r.verdict === "unexpected" ? " ⚠️" : "";
      return `${r.status}${flag}`;
    };
    lines.push(
      `| \`${path}\` | ${cell("ADMIN")} | ${cell("MANAGER")} | ${cell("SMM")} | ${cell("TEAM")} | ${rows[0].note ?? ""} |`,
    );
  }

  lines.push(
    "",
    "## Money blackout",
    "",
    leaks === 0
      ? "No money-bearing field reached SMM or TEAM on any route above."
      : `**${leaks} leak(s) found — see the flagged cells.**`,
    "",
    "Routes that are entirely about money (invoices, receipts, billable items)",
    "refuse the request outright rather than returning a stripped husk. Routes",
    "that merely carry an amount alongside other data have the key deleted by",
    "`stripFinancials`, so the value never leaves the server.",
    "",
  );

  mkdirSync(join(process.cwd(), "docs"), { recursive: true });
  writeFileSync(join(process.cwd(), "docs", "PERMISSION_AUDIT.md"), lines.join("\n"), "utf8");

  const unexpected = results.filter((r) => r.verdict === "unexpected");
  console.log(`\n${results.length} probes across ${ACCOUNTS.length} roles`);
  console.log(`  leaks:      ${leaks}`);
  console.log(`  unexpected: ${unexpected.length}`);
  for (const u of unexpected) {
    console.log(`    ${u.role} ${u.path} → ${u.status}`);
  }
  console.log("\nWrote docs/PERMISSION_AUDIT.md");

  if (leaks > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
