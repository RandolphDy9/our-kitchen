"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ls } from "@/lib/store";
import { fmtDate, fmtTime } from "@/lib/model";
import type { EventDoc } from "@/lib/types";
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
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;

/** Players on a phone check in from the installed app, not a browser tab. Computers carry on in the browser.
    null until the first render on the device, so the server-rendered page doesn't guess. */
export function useMustInstall(): boolean | null {
  const [must, setMust] = useState<boolean | null>(null);
  useEffect(() => setMust(!isStandalone() && platform() !== "other"), []);
  return must;
}

/** "Get the app", with steps for the phone in hand.
    iPhone: only before check-in. A Home Screen app there doesn't share Safari's storage, so installing first
    means checking in inside the app, with no code needed. Android shares storage, so either order works. */
export function InstallPrompt({ stage }: { stage: "before" | "after" }) {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (isStandalone() || ls.get("install.dismissed", false)) return;
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

const Step = ({ ic, title, children }: { ic: ReactNode; title: string; children?: ReactNode }) => (
  <li><span className="ws-ic">{ic}</span><p><b>{title}</b>{children}</p></li>
);
const AppIcon = <img src="/icons/icon-192.png" alt="" width={48} height={48} />;

/** The only page a phone sees in a browser tab: install Qsina, then check in from the app.
    The app opens on this event: its manifest's start_url carries the event's check-in code (app/m/[id]). */
export function GetTheApp({ e, ios }: { e: EventDoc; ios?: ReactNode }) {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setKind(platform());
    setEvt(deferred);
    waiting.add(setEvt);
    const done = () => setInstalled(true);
    window.addEventListener("appinstalled", done);
    return () => { waiting.delete(setEvt); window.removeEventListener("appinstalled", done); };
  }, []);
  if (!kind) return null;
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    if ((await evt.userChoice).outcome === "accepted") setInstalled(true);
    deferred = null;
    setEvt(null);
  };
  const open = <Step ic={AppIcon} title="Open Qsina">From your {kind === "android" ? "home screen" : "Home Screen"}. It opens right on this event.</Step>;
  const pick = <Step ic={<Icon n="check" />} title="Check in">Find your name and tap <em>Yes, check me in</em>.</Step>;

  let steps;
  if (installed) steps = <>{open}{pick}</>;
  else if (kind === "ios") steps = (
    <>
      <Step ic={<Icon n="share" />} title="Tap Share"><Icon n="share" cls="inline" /> is at the bottom in Safari, or top right in Chrome.</Step>
      <Step ic={<Icon n="plus" />} title="Add to Home Screen">Scroll down the list to find it, then tap <em>Add</em>.</Step>
      {open}{pick}
    </>
  );
  else if (kind === "ios-inapp") steps = (
    <>
      <Step ic={<Icon n="share" />} title="Open in Safari">Tap <em>•••</em> or <Icon n="share" cls="inline" />, then <em>Open in Safari</em>. Apps like Instagram and Messenger can&apos;t install Qsina.</Step>
      <Step ic={<Icon n="plus" />} title="Add to Home Screen">In Safari, tap <Icon n="share" cls="inline" /> <em>Share</em>, then <em>Add to Home Screen</em> and <em>Add</em>.</Step>
      {open}{pick}
    </>
  );
  else if (evt) steps = (
    <>
      <Step ic={<Icon n="download" />} title="Install Qsina">Tap the button below, then <em>Install</em>.</Step>
      {open}{pick}
    </>
  );
  else steps = (
    <>
      <Step ic={<b className="dots">⋮</b>} title="Open the menu">Tap <em>⋮</em> at the top right of Chrome.</Step>
      <Step ic={<Icon n="download" />} title="Install app">Tap <em>Install app</em> or <em>Add to Home screen</em>, then <em>Install</em>.</Step>
      {open}{pick}
    </>
  );

  return (
    <div className="view">
      <section className="card welcome gate" aria-labelledby="gate-h">
        <header>
          <span className="eyebrow">{e.name} · {fmtDate(e.date)} · {fmtTime(e.start)}</span>
          <h1 id="gate-h">{installed ? <>You&apos;ve got <mark>Qsina</mark></> : <>Get the app to <mark>check in</mark></>}</h1>
          <p>{installed ? "Now open it from your home screen. Check-in happens in the app." : "Qsina calls you to your court when it's your turn, so check-in happens in the app. Takes about 20 seconds."}</p>
        </header>
        <ol>{steps}</ol>
        {evt && !installed ? <div className="gate-go"><button className="btn dark block" onClick={install}>Install Qsina</button></div> : null}
      </section>
      {kind === "ios" || kind === "ios-inapp" ? ios : null}
      <p className="small muted gate-note">Already installed? Open Qsina from your {kind === "android" ? "home screen" : "Home Screen"} instead of this page.</p>
    </div>
  );
}
