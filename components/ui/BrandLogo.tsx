/* eslint-disable @next/next/no-img-element */

/**
 * Vibrnd Studio Flow — brand mark.
 *
 * Uses the ORIGINAL logo artwork, background-removed and cropped to the
 * mark (bold V + reels icon):
 *
 *   public/logo-mark.png — mark only, black on transparent
 *   public/logo-full.png — full lockup (mark + VIBRND Studio Flow text)
 *
 * The mark is black; on dark chrome we render it white via a CSS invert
 * filter (transparency is preserved, so only the glyph flips color).
 *
 * `tone="onDark"` (default) → white mark for dark surfaces.
 * `tone="onLight"`          → original black mark for light surfaces.
 */
export function BrandLogo({
  className,
  tone = "onDark",
}: {
  className?: string;
  tone?: "onDark" | "onLight";
}) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`object-contain select-none ${tone === "onDark" ? "invert" : ""} ${className ?? ""}`}
    />
  );
}

/** Full logo lockup (mark + wordmark) — for marketing-style surfaces. */
export function BrandLogoFull({
  className,
  tone = "onDark",
}: {
  className?: string;
  tone?: "onDark" | "onLight";
}) {
  return (
    <img
      src="/logo-full.png"
      alt="Vibrnd Studio Flow"
      draggable={false}
      className={`object-contain select-none ${tone === "onDark" ? "invert" : ""} ${className ?? ""}`}
    />
  );
}

/** Mark + text lockup used in app chrome (text stays crisp as HTML). */
export function BrandLockup({
  markClassName = "w-8 h-8",
  textClassName = "text-base",
}: {
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandLogo className={markClassName} />
      <span className={`font-bold leading-none tracking-tight ${textClassName}`}>
        Vibrnd
        <span className="block text-[0.62em] font-medium tracking-widest uppercase opacity-70 mt-0.5">
          Studio Flow
        </span>
      </span>
    </span>
  );
}
