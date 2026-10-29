// Renders public/qsina-logo.png into the header logo and the PNG icons the manifest and iOS need.
import sharp from "sharp";

const SRC = "public/qsina-logo.png";
const BG = "#f7f6f2";
const AMBER = [0xf6, 0xb9, 0x0a]; // --lime in app/globals.css

// White to transparent ("color to alpha"), so the mark sits cleanly on any light background.
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mark = Buffer.alloc(data.length), black = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  // The source's background is off-white (251–254), so treat anything that light as fully transparent.
  const a = Math.max(0, (1 - Math.min(r, g, b) / 255 - 0.03) / 0.97);
  const un = (c) => (a < 0.004 ? 0 : Math.round(Math.max(0, Math.min(255, (c - 255 * (1 - a)) / a))));
  let [ur, ug, ub] = [un(r), un(g), un(b)];
  // Swap the source's lemon ball (#FCD410) for the app's amber (#F6B90A), keeping the shading of darker edge pixels.
  const s = Math.max(0, Math.min(1, (ur - ub - 40) / 150));
  if (s > 0) {
    const k = Math.min(1, ur / 252);
    [ur, ug, ub] = [[ur, AMBER[0]], [ug, AMBER[1]], [ub, AMBER[2]]].map(([c, t]) => Math.round(c + (t * k - c) * s));
  }
  mark[i] = ur; mark[i + 1] = ug; mark[i + 2] = ub; mark[i + 3] = Math.round(a * 255);
  // Notification badge: only the black strokes, as a white silhouette.
  black[i] = black[i + 1] = black[i + 2] = 255; black[i + 3] = Math.max(0, Math.round((247 - Math.max(r, g, b)) * 255 / 247));
}
const raw = { raw: { width: info.width, height: info.height, channels: 4 } };
const trim = async (buf) => sharp(await sharp(buf, raw).png().toBuffer()).trim({ threshold: 8 }).png().toBuffer();
const logo = await trim(mark), badgeMark = await trim(black);

const out = "public/";
await sharp(logo).resize({ height: 192 }).png({ compressionLevel: 9 }).toFile(out + "logo.png");

// The mark centred on a square, filling `fill` of its width.
const square = async (img, size, fill, bg) => {
  const inner = Math.round(size * fill);
  const fit = await sharp(img).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: fit, gravity: "center" }]).png({ compressionLevel: 9 });
};
const jobs = [
  ["icons/icon-192.png", logo, 192, 0.84, BG],
  ["icons/icon-512.png", logo, 512, 0.84, BG],
  ["icons/maskable-512.png", logo, 512, 0.62, BG],
  ["icons/apple-touch-icon.png", logo, 180, 0.76, BG],
  ["icons/badge-96.png", badgeMark, 96, 0.84, { r: 0, g: 0, b: 0, alpha: 0 }],
];
for (const [name, img, size, fill, bg] of jobs) await (await square(img, size, fill, bg)).toFile(out + name);
console.log("logo and icons written");
