/**
 * Vibrnd Studio Flow — brand mark.
 *
 * Vector recreation of the logo: a bold "V" with a reels/clapper icon at
 * the top right. Drawn with `currentColor` so it inherits text color —
 * white on dark surfaces, near-black on light ones.
 *
 * To use the original PNG instead, drop it at `public/logo.png` and swap
 * this component's contents for:
 *   <img src="/logo.png" alt="Vibrnd Studio Flow" className={className} />
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Bold V */}
      <path d="M10 16 H40 L53 62 L64 28 H86 L62 94 H38 Z" />
      {/* Reels icon — rounded square with clapper strip + play cutouts */}
      <path
        fillRule="evenodd"
        d="M72 0 h20 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8 V8 a8 8 0 0 1 8 -8 Z
           M72.5 3.5 l3.5 5 h4 l-3.5 -5 Z
           M81.5 3.5 l3.5 5 h4 l-3.5 -5 Z
           M90.5 3.5 l3.5 5 h3 a5 5 0 0 0 -3 -4.4 Z
           M78 12 l9 5.5 -9 5.5 Z"
      />
    </svg>
  );
}

/** Wordmark + logo lockup used in the sidebar and auth pages. */
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
