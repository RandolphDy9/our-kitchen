"use client";
/* Game alerts: free and in-app. Chime + vibration + blinking title, and a system
   notification through the service worker when the app is in the background. */
import { ls } from "./store";

type WL = { release(): Promise<void>; addEventListener(t: "release", f: () => void): void };
const AL: { ctx: AudioContext | null; lock: WL | null; blink: ReturnType<typeof setInterval> | null; baseTitle: string } =
  { ctx: null, lock: null, blink: null, baseTitle: "Qsina" };

export const alertPrefs = () => ({ sound: ls.get("al.sound", true), wake: ls.get("al.wake", false), notify: ls.get("al.notify", false) });

export function primeAudio() {
  try {
    if (!AL.ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (C) AL.ctx = new C();
    }
    if (AL.ctx && AL.ctx.state === "suspended") AL.ctx.resume();
  } catch {}
}
export function chime() {
  if (!alertPrefs().sound) return;
  try {
    primeAudio();
    const c = AL.ctx;
    if (!c || c.state !== "running") return;
    const t0 = c.currentTime;
    ([[880, 0], [1175, 0.18], [1568, 0.36], [880, 0.8], [1175, 0.98], [1568, 1.16]] as const).forEach(([f, d]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + d);
      g.gain.linearRampToValueAtTime(0.35, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + d + 0.32);
      o.connect(g).connect(c.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.35);
    });
  } catch {}
}
export function buzz(pattern: number | number[] = [400, 150, 400, 150, 400]) {
  try { navigator.vibrate?.(pattern); } catch {}
}
export function blinkTitle(msg: string) {
  if (AL.blink) clearInterval(AL.blink);
  let on = false;
  AL.blink = setInterval(() => { on = !on; document.title = on ? msg : AL.baseTitle; }, 1000);
  document.title = msg;
}
export function stopBlink() {
  if (AL.blink) clearInterval(AL.blink);
  AL.blink = null;
  document.title = AL.baseTitle;
}
export async function applyWake(want: boolean) {
  const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WL> } }).wakeLock;
  try {
    if (want && !AL.lock && document.visibilityState === "visible" && wl) {
      AL.lock = await wl.request("screen");
      AL.lock.addEventListener("release", () => { AL.lock = null; });
    }
    if (!want && AL.lock) {
      await AL.lock.release();
      AL.lock = null;
    }
  } catch {
    AL.lock = null;
  }
}
export const wakeSupported = () => typeof navigator !== "undefined" && "wakeLock" in navigator;
export const notifySupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

export async function requestNotify() {
  if (!notifySupported()) return false;
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  return p === "granted";
}
/** Only fires when the page is hidden; the full-screen "You're up" takes over when it's visible. */
export async function notifyBackground(title: string, body: string, tag: string) {
  if (!alertPrefs().notify || !notifySupported() || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", requireInteraction: true, data: { url: location.href } } as NotificationOptions);
  } catch {}
}
