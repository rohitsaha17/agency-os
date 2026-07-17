/**
 * Vibrnd Studio Flow — brand mark.
 *
 * Faithful vector redraw of the Vibrnd logo: heavy geometric "V" whose
 * right arm sweeps up to a rounded tip, with a reels/clapper icon at the
 * top right (film-strip notches + play-button cutout). Drawn with
 * `currentColor` so it inherits text color — white on dark chrome,
 * near-black on light surfaces.
 *
 * To use the original raster artwork instead, save it (ideally with a
 * transparent background) as `public/logo.png` and swap this component's
 * body for:
 *   <img src="/logo.png" alt="Vibrnd Studio Flow" className={className} />
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 86 100"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* The V — left arm with flat top, right arm rising to a rounded tip */}
      <path
        d="M 4.5 20
           H 51.1
           L 44.2 72.6
           L 74.0 31.2
           A 6.8 6.8 0 0 1 85.2 38.9
           L 56.4 99.1
           H 28.9
           L 1.6 24.5
           Q 0.4 20 4.5 20
           Z"
      />
      {/* Reels icon — rounded square, clapper strip with notches, play cutout */}
      <path
        fillRule="evenodd"
        d="M 69.5 0 h 11.5 a 5 5 0 0 1 5 5 v 11.5 a 5 5 0 0 1 -5 5 h -11.5 a 5 5 0 0 1 -5 -5 V 5 a 5 5 0 0 1 5 -5 Z
           M 64.5 6 h 21.5 v 1.3 h -21.5 Z
           M 67.8 0.8 l 2.7 4.6 h 2.5 l -2.7 -4.6 Z
           M 73.9 0.8 l 2.7 4.6 h 2.5 l -2.7 -4.6 Z
           M 80.0 0.8 l 2.7 4.6 h 2.4 l -2.2 -4.2 a 5 5 0 0 0 -1.4 -0.4 Z
           M 71.8 9.7 l 7.6 4.35 l -7.6 4.35 Z"
      />
    </svg>
  );
}

/** Wordmark + logo lockup used on marketing-style surfaces. */
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
