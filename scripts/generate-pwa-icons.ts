/**
 * Generate the PWA icon set from the existing brand mark.
 *
 * public/logo-mark.png is the black glyph on transparency used in app chrome.
 * A transparent icon is wrong for a home screen — Android drops it on white
 * and iOS on black, so the black mark disappears on one of them. These are
 * the mark in white on the brand indigo, which is how it already appears in
 * the sidebar.
 *
 * Two shapes, because launchers treat them differently:
 *   - `any`      the icon as drawn, used as-is where no mask is applied
 *   - `maskable` full-bleed, with the glyph inside the inner 80% that every
 *                launcher shape (circle, squircle, teardrop) is guaranteed
 *                to keep. Drawn smaller on purpose so a circular mask on a
 *                Pixel doesn't clip the V.
 *
 * Re-run with: npx tsx scripts/generate-pwa-icons.ts
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "public", "logo-mark.png");
const OUT = path.join(process.cwd(), "public", "icons");

/** bg-gradient-to-br from-indigo-500 to-indigo-600, the sidebar's brand chip. */
const FROM = "#6366f1";
const TO = "#4338ca";

function background(size: number, radius: number): Buffer {
  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${FROM}"/>
          <stop offset="100%" stop-color="${TO}"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
    </svg>`);
}

/**
 * The glyph in white. `negate` with alpha untouched turns the black mark
 * white and leaves the transparency alone, so only the glyph flips.
 */
async function whiteMark(size: number): Promise<Buffer> {
  return sharp(SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .negate({ alpha: false })
    .png()
    .toBuffer();
}

async function icon(size: number, opts: { maskable?: boolean } = {}) {
  // Maskable keeps the glyph inside the guaranteed-safe inner 80%; a plain
  // icon can afford to sit larger because nothing crops it.
  const glyphScale = opts.maskable ? 0.5 : 0.62;
  const radius = opts.maskable ? 0 : Math.round(size * 0.22);
  const glyph = Math.round(size * glyphScale);
  const offset = Math.round((size - glyph) / 2);

  return sharp(background(size, radius))
    .composite([{ input: await whiteMark(glyph), top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const jobs: [string, Buffer][] = [
    ["icon-192.png", await icon(192)],
    ["icon-512.png", await icon(512)],
    ["icon-192-maskable.png", await icon(192, { maskable: true })],
    ["icon-512-maskable.png", await icon(512, { maskable: true })],
    // iOS ignores the manifest and applies its own rounding, so this one is
    // a full square with no transparency and no corner radius of its own.
    ["apple-touch-icon.png", await sharp(background(180, 0))
      .composite([{ input: await whiteMark(112), top: 34, left: 34 }])
      .png().toBuffer()],
  ];

  for (const [name, buf] of jobs) {
    await sharp(buf).toFile(path.join(OUT, name));
    console.log(`  public/icons/${name.padEnd(24)} ${(buf.length / 1024).toFixed(1)} kB`);
  }

  // Next serves these two from the app directory automatically, so no <link>
  // has to be written or kept in step by hand.
  const app = path.join(process.cwd(), "app");
  await sharp(await icon(32)).toFile(path.join(app, "icon.png"));
  console.log("  app/icon.png                       32x32");
  await sharp(await sharp(background(180, 0))
    .composite([{ input: await whiteMark(112), top: 34, left: 34 }])
    .png().toBuffer()).toFile(path.join(app, "apple-icon.png"));
  console.log("  app/apple-icon.png                 180x180");
}

main().catch((e) => { console.error(e); process.exit(1); });
