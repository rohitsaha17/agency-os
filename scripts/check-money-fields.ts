/**
 * The money blackout is a denylist, so it can only protect fields it names.
 *
 *   npx tsx scripts/check-money-fields.ts
 *
 * stripFinancials() (lib/permissions.ts) removes money from any payload sent to
 * a user without financials.view — but only for the field NAMES in MONEY_FIELDS.
 * Add a money column to the schema and forget to list it, and it leaks silently
 * to SMM/TEAM the first time any route returns it through jsonFor(). That is
 * exactly how `monthlySalary`, `grossAmount` and friends sat unprotected for a
 * while.
 *
 * Money in this schema is always `Decimal`. So: every Decimal column must be
 * classified — either it is money (named in MONEY_FIELDS) or it is explicitly
 * NOT money (a percentage, a quantity) and listed below. A new, unclassified
 * Decimal fails this check, which forces the decision to be made rather than
 * defaulted to "leaks".
 */
import { readFileSync } from "fs";
import { MONEY_FIELD_NAMES } from "../lib/permissions";

/**
 * Decimal columns that are deliberately NOT money, so stripFinancials leaves
 * them alone. A percentage or a count is not somebody's salary.
 */
const NOT_MONEY = new Set<string>([
  "discountPct", // a percentage on an invoice line
  "taxPct",      // a percentage on an invoice line
  "quantity",    // a count of billable units
]);

const schema = readFileSync("prisma/schema.prisma", "utf8");

// Every `  fieldName  Decimal …` declaration in the schema.
const decimals = new Set<string>();
for (const m of schema.matchAll(/^\s+(\w+)\s+Decimal\b/gm)) {
  decimals.add(m[1]);
}

let fails = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      ${detail}`}`);
};

console.log(`— every Decimal column is classified (${decimals.size} found) —`);
for (const field of [...decimals].sort()) {
  const isMoney = MONEY_FIELD_NAMES.has(field);
  const isNotMoney = NOT_MONEY.has(field);
  check(
    `${field.padEnd(20)} ${isMoney ? "money (stripped)" : isNotMoney ? "not money (kept)" : "UNCLASSIFIED"}`,
    isMoney !== isNotMoney, // exactly one must be true
    isMoney && isNotMoney
      ? `${field} is in BOTH MONEY_FIELDS and the not-money allowlist — pick one.`
      : `${field} is a new Decimal column. Add it to MONEY_FIELDS in lib/permissions.ts if it holds money, or to NOT_MONEY in this script if it does not.`,
  );
}

// Guard the other direction too: a name listed as not-money must still exist,
// so the allowlist doesn't rot into a list of fields that were renamed away.
console.log("\n— the not-money allowlist has no stale entries —");
for (const field of NOT_MONEY) {
  check(`${field} still exists in the schema`, decimals.has(field),
    `${field} is on the not-money allowlist but is no longer a Decimal column — remove it.`);
}

console.log(fails === 0 ? "\nAll money-field checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
