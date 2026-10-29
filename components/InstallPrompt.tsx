"use client";
import { useEffect, useState } from "react";
import { ls } from "@/lib/store";
import { Icon } from "./ui";

type BIP = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

/* Chrome offers installation once per page load, often before this banner is on screen, so keep that offer here. */
let deferred: BIP | null = null;
const waiting = new Set<(e: BIP | null) => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIP;
    waiting.forEach((f) => f(deferred));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    waiting.forEach((f) => f(null));
  });
}

type Kind = "ios" | "ios-inapp" | "android" | "other";
function platform(): Kind {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|Instagram|Messenger|Line\//i.test(ua);
  if (ios) return inApp ? "ios-inapp" : "ios";
  return /android/i.test(ua) ? "android" : "other";
}

/** "Get the app", with steps for the phone in hand.
    iPhone: only before check-in. A Home Screen app there doesn't share Safari's storage, so installing first
    means checking in inside the app, with no code needed. Android shares storage, so either order works. */
export function InstallPrompt({ stage }: { stage: "before" | "after" }) {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone || ls.get("install.dismissed", false)) return;
    setKind(platform());
    setEvt(deferred);
    setHidden(false);
    waiting.add(setEvt);
    return () => { waiting.delete(setEvt); };
  }, []);
  if (hidden || !kind) return null;
  if ((kind === "ios" || kind === "ios-inapp") && stage === "after") return null;
  if (kind === "other" && !evt) return null;
  const dismiss = () => { ls.set("install.dismissed", true); setHidden(true); };
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    deferred = null;
    setEvt(null);
  };

  let body;
  if (kind === "ios") body = (
    <>
      <ol className="steps">
        <li>Tap <Icon n="share" cls="inline" /> <b>Share</b> (at the bottom in Safari, top right in Chrome).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open <b>Qsina</b> from your Home Screen and check in there.</li>
      </ol>
      <p>Do this before you check in. Or skip it and check in below; the app is optional.</p>
    </>
  );
  else if (kind === "ios-inapp") body = (
    <>
      <p>To add Qsina to your Home Screen, open this page in <b>Safari</b> first: tap <b>•••</b> or <Icon n="share" cls="inline" />, then <b>Open in Safari</b>.</p>
      <p>Or skip it and check in below; the app is optional.</p>
    </>
  );
  else if (evt) body = <p>Install Qsina for a full-screen app and court alerts. {stage === "before" ? "You can install before or after checking in." : "You'll stay checked in."}</p>;
  else body = (
    <>
      <ol className="steps">
        <li>Tap <b>⋮</b> at the top right of Chrome.</li>
        <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
        <li>Open <b>Qsina</b> from your home screen. {stage === "before" ? "You can check in before or after." : "You'll stay checked in."}</li>
      </ol>
    </>
  );

  return (
    <section className="install" aria-label="Get the app">
      <div className="install-h">
        <span className="sq"><Icon n="download" /></span>
        <b>Want the Qsina app?</b>
        <button className="x" onClick={dismiss} aria-label="Not now">✕</button>
      </div>
      {body}
      {evt ? <button className="btn sm dark" onClick={install}>Install</button> : null}
    </section>
  );
}
