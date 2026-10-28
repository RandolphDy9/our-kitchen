"use client";
import { useEffect, useState } from "react";
import { useApp, set, ls, type Tab } from "@/lib/store";
import { ev, fmtDate, hue, initials, isAdminView, me } from "@/lib/model";
import { boot } from "@/lib/session";
import { organizerSignIn } from "@/lib/actions";
import { alertPrefs, applyWake, primeAudio } from "@/lib/alerts";
import { Icon, Logo, type IconName } from "./ui";
import { Overlays } from "./Overlays";
import { EventPage } from "./pages/EventPage";
import { PeoplePage, PlayersPage } from "./pages/PlayersPage";
import { CourtsPage } from "./pages/CourtsPage";
import { BracketPage } from "./pages/BracketPage";
import { ResultsPage } from "./pages/ResultsPage";
import { Lightbox, PhotosPage } from "./pages/PhotosPage";
import { CheckedInPage, CheckinPage } from "./pages/CheckinPage";
import { CreateEventPage, SignInPage, TeamPage } from "./pages/AdminPages";

type S = ReturnType<typeof useApp.getState>;

function tabsFor(S: S): [Tab, string, IconName][] {
  if (S.team || S.creating || S.signingIn || !ev(S)) return [];
  if (isAdminView(S)) return [["event", "Event", "home"], ["players", "Players", "users"], ["courts", "Courts", "grid"], ["bracket", "Playoffs", "bracket"], ["results", "Results", "trophy"], ["photos", "Photos", "image"]];
  if (me(S)) return [["courts", "Courts", "grid"], ["bracket", "Playoffs", "bracket"], ["people", "Players", "users"], ["results", "Results", "trophy"], ["photos", "Photos", "image"]];
  return [];
}

function TopBar() {
  const S = useApp(), e = ev(S), m = me(S), admin = isAdminView(S);
  return (
    <header className="top">
      <div className="wrap wide top-row">
        <span className="logo" aria-label="OurKitchen"><Logo /><b>Our<i>Kitchen</i></b></span>
        <div className="top-title"><span>{e ? fmtDate(e.date) : ""}</span></div>
        <div className="top-actions">
          {S.unlocked ? <button className="iconpill" onClick={() => { set({ preview: !S.preview, tab: null, ciJustDone: false }); window.scrollTo(0, 0); }} title="Switch between admin and player view"><Icon n="eye" /><span className="lbl">{S.preview ? "Admin view" : "Player view"}</span></button> : null}
          {admin && S.ready && !S.offline && !S.creating ? <button className="plus-btn" onClick={() => { set({ creating: true, team: false }); window.scrollTo(0, 0); }} aria-label="New event" title="New event"><Icon n="plus" /></button> : null}
          {S.isOwner && !S.team ? <button className="iconpill" onClick={() => { set({ team: true, creating: false }); window.scrollTo(0, 0); }} title="Manage admins" aria-label="Manage admins"><Icon n="users" /><span className="lbl">Admins</span></button> : null}
          {!admin && m ? <span className={`av c${hue(m.id)}`} title={m.name} style={{ width: 40, height: 40 }}>{initials(m.name)}</span> : null}
        </div>
      </div>
    </header>
  );
}

type BIP = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
function InstallPrompt() {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone || ls.get("install.dismissed", false)) return;
    setHidden(false);
    const ua = navigator.userAgent;
    setIos(/iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua));
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (hidden || (!evt && !ios)) return null;
  const dismiss = () => { ls.set("install.dismissed", true); setHidden(true); };
  return (
    <div className="install" role="region" aria-label="Install the app">
      <span className="sq" style={{ width: 40, height: 40 }}><Icon n="download" /></span>
      <div style={{ minWidth: 0 }}>
        <b>Get the app</b>
        <p>{evt ? "Add OurKitchen to your home screen for full-screen court alerts." : <>Tap <Icon n="share" cls="inline" /> Share, then <b style={{ display: "inline", fontFamily: "inherit", fontSize: "inherit", textTransform: "none" }}>Add to Home Screen</b>.</>}</p>
      </div>
      {evt ? <button className="btn sm dark" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); setHidden(true); }}>Install</button>
        : <button className="x" onClick={dismiss} aria-label="Dismiss">✕</button>}
    </div>
  );
}

function Page() {
  const S = useApp();
  if (S.signingIn && !S.unlocked) return <SignInPage />;
  if (S.team) return <TeamPage />;
  if (S.creating) return <CreateEventPage />;
  if (!S.ready) return <div className="empty">Loading…</div>;
  if (S.offline) return <div className="empty"><h2>Can&apos;t reach the event</h2><p>Check-ins, scores and photos need a connection the first time. Check your signal and try again.</p><button className="btn dark" onClick={() => location.reload()}>Try again</button></div>;
  const e = ev(S), admin = isAdminView(S);
  if (!e) {
    if (admin) return <CreateEventPage first />;
    return (
      <div className="view">
        <div className="empty"><span className="sq dark"><Icon n="qr" /></span><h2>Scan the QR code at your event</h2><p>Your organizer has a check-in code at the front desk. Scan it with your phone camera to join.</p></div>
        <InstallPrompt />
        {S.unlocked ? null : <button className="btn ghost" onClick={organizerSignIn}><Icon n="lock" />Organizer sign in</button>}
        {S.mode === "local" ? <p className="mode-note">Demo mode: data stays in this browser. Sign in as organizer to create an event.</p> : null}
      </div>
    );
  }
  if (!admin && !me(S)) return <CheckinPage e={e} />;
  if (!admin && S.ciJustDone) return <CheckedInPage />;
  const P = { event: EventPage, players: PlayersPage, courts: CourtsPage, bracket: BracketPage, results: ResultsPage, photos: PhotosPage, people: PeoplePage }[S.tab || "courts"] || CourtsPage;
  return (
    <>
      {!admin && S.tab === "courts" ? <div style={{ marginBottom: 18 }}><InstallPrompt /></div> : null}
      <P e={e} />
    </>
  );
}

export default function App() {
  const S = useApp();
  const [online, setOnline] = useState(true);
  const tabs = tabsFor(S);
  const wantWake = alertPrefs().wake && !isAdminView(S) && !!me(S);

  useEffect(() => {
    boot();
    const prime = () => primeAudio();
    const on = () => setOnline(navigator.onLine);
    document.addEventListener("pointerdown", prime, { passive: true });
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    on();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      document.removeEventListener("pointerdown", prime);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => {
    applyWake(wantWake);
    const v = () => { if (document.visibilityState === "visible") applyWake(wantWake); };
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [wantWake]);

  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t[0] === S.tab)) set({ tab: tabs[0][0], scoring: null });
  }, [tabs, S.tab]);

  return (
    <>
      {online ? null : <div className="offline-bar" role="status">Offline · showing saved data</div>}
      <TopBar />
      <main className="wrap wide" key={(S.eventId || "") + (isAdminView(S) ? ":a" : ":p")}><Page /></main>
      {tabs.length ? (
        <nav className="nav" aria-label="Sections">
          {tabs.map(([k, l, i]) => (
            <button key={k} aria-label={l} aria-current={S.tab === k ? "page" : undefined} onClick={() => { set({ tab: k, scoring: null }); window.scrollTo(0, 0); }}>
              <Icon n={i} /><span>{l}</span>
            </button>
          ))}
        </nav>
      ) : null}
      <Lightbox />
      <Overlays />
    </>
  );
}
