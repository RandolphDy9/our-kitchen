// Renders the OurKitchen logo into the PNG icons the manifest and iOS need.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const ball = (s) => `<g transform="translate(${(1 - s) * 256} ${(1 - s) * 256}) scale(${s})">
  <circle cx="256" cy="256" r="200" fill="#f6b90a" stroke="#111" stroke-width="26"/>
  <path d="M90 311c100-11 222-78 333-167" fill="none" stroke="#111" stroke-width="26" stroke-linecap="round"/>
  <g fill="#111"><circle cx="178" cy="178" r="25"/><circle cx="278" cy="144" r="25"/><circle cx="333" cy="278" r="25"/><circle cx="233" cy="356" r="25"/><circle cx="155" cy="267" r="20"/></g></g>`;
const svg = (bg, s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ""}${ball(s)}</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="210" fill="#fff"/><g fill="#000"><circle cx="178" cy="178" r="30"/><circle cx="278" cy="144" r="30"/><circle cx="333" cy="278" r="30"/><circle cx="233" cy="356" r="30"/><circle cx="155" cy="267" r="24"/></g></svg>`;

const out = "public/icons/";
writeFileSync(out + "icon.svg", svg(null, 1.15));
const jobs = [
  ["icon-192.png", svg("#f7f6f2", 1.05), 192],
  ["icon-512.png", svg("#f7f6f2", 1.05), 512],
  ["maskable-512.png", svg("#f7f6f2", 0.78), 512],
  ["apple-touch-icon.png", svg("#f7f6f2", 0.95), 180],
  ["badge-96.png", badge, 96],
];
for (const [name, s, size] of jobs) await sharp(Buffer.from(s)).resize(size, size).png().toFile(out + name);
console.log("icons written");
