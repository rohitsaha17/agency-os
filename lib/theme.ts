/**
 * Which visual theme a workspace renders in.
 *
 * The tenant's theme is decided on the server from the signed-in user's
 * organization row, and nowhere else. Not from a subdomain, not from a URL,
 * not from a header, and — importantly — not from localStorage, which is
 * per-browser rather than per-tenant and would survive one workspace's user
 * signing out and another signing in.
 *
 * WHY THIS IS A WHITELIST AND NOT A PASS-THROUGH
 *
 * `Organization.theme` is a plain TEXT column. Its value ends up as a class
 * name on <html>, placed there by a short inline script. Anything that
 * reaches a script tag from the database has to be constrained to values this
 * module names, or a bad row becomes an injection point. `resolveTheme` is
 * the only way a theme is read, and it answers "default" for anything it does
 * not recognise — including null, a typo, or a value from a newer deploy that
 * this one has never heard of.
 *
 * Failing to "default" is also the right behaviour operationally: an
 * unrecognised theme renders the app everybody already knows, rather than
 * something half-styled.
 */

export const WORKSPACE_THEMES = ["default", "glo"] as const;

export type WorkspaceTheme = (typeof WORKSPACE_THEMES)[number];

/** Narrow whatever the database holds to a theme this build can render. */
export function resolveTheme(raw: unknown): WorkspaceTheme {
  return typeof raw === "string" && (WORKSPACE_THEMES as readonly string[]).includes(raw)
    ? (raw as WorkspaceTheme)
    : "default";
}

/**
 * The class that carries a theme, or "" for the default.
 *
 * The default deliberately has NO class. Every workspace in existence is on
 * it, so it has to be the state where nothing is added and nothing overrides
 * anything — the app exactly as it shipped. A `.theme-default` class would be
 * a second thing that could accidentally acquire rules.
 */
export function themeClass(theme: WorkspaceTheme): string {
  return theme === "default" ? "" : `theme-${theme}`;
}

/** Every class this build could apply — used to clear stale ones. */
export const ALL_THEME_CLASSES: string[] = WORKSPACE_THEMES
  .map(themeClass)
  .filter(Boolean);
