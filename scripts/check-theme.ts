/**
 * The workspace theme resolver.
 *
 * Run after touching lib/theme.ts:
 *   npx tsx scripts/check-theme.ts
 * Exits non-zero on any regression.
 *
 * This is small but load-bearing. Organization.theme is a plain TEXT column
 * whose value ends up as a class name on <html>, written by an inline script.
 * Anything that reaches a script tag from the database has to be constrained
 * to values this build names — so the whitelist is asserted directly rather
 * than trusted.
 */
import { readFileSync } from "fs";
import {
  WORKSPACE_THEMES, resolveTheme, themeClass, ALL_THEME_CLASSES,
} from "../lib/theme";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("— every workspace is on the default until somebody says otherwise —");
check("the default is default", resolveTheme("default"), "default");
check("null is default", resolveTheme(null), "default");
check("undefined is default", resolveTheme(undefined), "default");
check("an empty string is default", resolveTheme(""), "default");
check("a typo is default", resolveTheme("gloo"), "default");
check("a theme from a newer deploy is default", resolveTheme("aurora"), "default");
check("a number is default", resolveTheme(42), "default");
check("an object is default", resolveTheme({ theme: "glo" }), "default");

console.log("");
console.log("— a named theme resolves —");
check("glo resolves", resolveTheme("glo"), "glo");
check("every listed theme resolves to itself",
  WORKSPACE_THEMES.every((t) => resolveTheme(t) === t), true);

console.log("");
console.log("— the default adds NO class —");
// Every workspace in existence is on the default, so it has to be the state
// where nothing is added and nothing can override anything.
check("default is the empty string", themeClass("default"), "");
check("glo carries its class", themeClass("glo"), "theme-glo");

console.log("");
console.log("— nothing from the database can reach a class name —");
const HOSTILE = [
  'glo" onload="alert(1)',
  "glo'); alert(1); //",
  "<script>alert(1)</script>",
  "theme-glo",          // the class itself is not a valid theme key
  "GLO",                // case matters; no silent coercion
  " glo",
  "glo ",
  "default\nglo",
];
for (const raw of HOSTILE) {
  check(`refused: ${JSON.stringify(raw).slice(0, 34)}`, resolveTheme(raw), "default");
}
check("so every emitted class is one this build named",
  HOSTILE.every((raw) => {
    const cls = themeClass(resolveTheme(raw));
    return cls === "" || ALL_THEME_CLASSES.includes(cls);
  }), true);
check("and each class is a plain identifier",
  ALL_THEME_CLASSES.every((c) => /^[a-z][a-z0-9-]*$/.test(c)), true);

console.log("");
console.log("— the stale-class list covers everything this build can apply —");
// The injected script removes all of these before adding the right one, so a
// bfcache restore or a re-render cannot leave a previous tenant's theme on.
check("no empty entries", ALL_THEME_CLASSES.includes(""), false);
check("one entry per non-default theme",
  ALL_THEME_CLASSES.length, WORKSPACE_THEMES.length - 1);
check("glo is in it", ALL_THEME_CLASSES.includes("theme-glo"), true);

console.log("");
console.log("— the class lands on a soft navigation too —");
/*
  Signing in is router.push("/"), a CLIENT navigation. React creates the theme
  <script> element rather than the browser parsing it, and a script inserted
  that way NEVER executes — checked in a browser, not assumed. So the inline
  script on its own left everyone who had just signed in looking at the
  default theme until they happened to reload, which is the one thing nobody
  does to a page that has just loaded.

  Asserted against the source, because the failure is silent: nothing throws,
  nothing 404s, the page renders perfectly in the wrong colours.
*/
const componentSource = readFileSync("components/layout/WorkspaceTheme.tsx", "utf8");
check("the inline script is still there, for the hard load",
  /dangerouslySetInnerHTML/.test(componentSource), true);
check("and an effect applies it too, for every client navigation",
  /classList\.add\(/.test(componentSource), true);
check("that effect runs before paint, or the wrong theme flashes",
  /useLayoutEffect/.test(componentSource), true);
check("stale classes are cleared before the right one goes on",
  /classList\.remove\(\.\.\.ALL_THEME_CLASSES\)/.test(componentSource), true);

console.log(fails === 0 ? "\nAll theme checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
