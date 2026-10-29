"use client";
import { useEffect, useState } from "react";
import { useApp, set, type Tab } from "@/lib/store";
import { adminClubs, ev, eventCode, hue, initials, isAdminView, isClubOwner, me } from "@/lib/model";
import { boot, joinByCode, switchClub } from "@/lib/session";
import { organizerSignIn } from "@/lib/actions";
import { alertPrefs, applyWake, primeAudio } from "@/lib/alerts";
import { Icon, NameStory, type IconName } from "./ui";
import { GetTheApp, InstallPrompt, useMustInstall } from "./InstallPrompt";
import { Overlays } from "./Overlays";
import { EventPage } from "./pages/EventPage";
import { PeoplePage, PlayersPage } from "./pages/PlayersPage";
import { CourtsPage, MoveCode } from "./pages/CourtsPage";
import { BracketPage } from "./pages/BracketPage";
import { ResultsPage } from "./pages/ResultsPage";
import { Lightbox, PhotosPage } from "./pages/PhotosPage";
import { CheckedInPage, CheckinPage } from "./pages/CheckinPage";
import { CreateEventPage, SignInPage, TeamPage } from "./pages/AdminPages";

type S = ReturnType<typeof useApp.getState>;

function tabsFor(S: S): [Tab, string, IconName][] {
  if (S.team || S.creating || S.signingIn || !ev(S)) return [];
  if (isAdminView(S)) return [["event", "Event", "home"], ["players", "Players", "users"], ["courts", "Courts", "grid"], ["bracket", "Playoffs", "bracket"], ["results", "Results", "trophy"], ["photos", "Photos", "image"]];
  if (me(S)) return S.ciJustDone ? [] : [["courts", "Courts", "grid"], ["bracket", "Playoffs", "bracket"], ["people", "Players", "users"], ["results", "Results", "trophy"], ["photos", "Photos", "image"]];
  return [];
}

function TopBar() {
  const S = useApp(), m = me(S), admin = isAdminView(S);
  return (
    <header className="top">
      <div className="wrap wide top-row">
        <span className="logo" aria-label="Qsina"><img src="/logo.png" alt="" width={51} height={36} /><b><i>sina</i></b></span>
        <div className="top-actions">
          {S.unlocked ? <button className="iconpill" onClick={() => { set({ preview: !S.preview, tab: null, ciJustDone: false }); window.scrollTo(0, 0); }} title="Switch between admin and player view"><Icon n="eye" /><span className="lbl">{S.preview ? "Admin view" : "Player view"}</span></button> : null}
          {admin && S.ready && !S.offline && !S.creating ? <button className="plus-btn" onClick={() => { set({ creating: true, team: false }); window.scrollTo(0, 0); }} aria-label="New event" title="New event"><Icon n="plus" /></button> : null}
          {S.unlocked && isClubOwner(S) && !S.team ? <button className="iconpill" onClick={() => { set({ team: true, creating: false }); window.scrollTo(0, 0); }} title="Club owners and admins" aria-label="Club"><Icon n="users" /><span className="lbl">Club</span></button> : null}
          {!S.unlocked && adminClubs(S).length ? <button className="iconpill" onClick={() => { switchClub(adminClubs(S)[0].id); window.scrollTo(0, 0); }} title="Back to the club you run"><Icon n="home" /><span className="lbl">My club</span></button> : null}
          {!admin && m ? <span className={`av c${hue(m.id)}`} title={m.name} style={{ width: 40, height: 40 }}>{initials(m.name)}</span> : null}
        </div>
      </div>
    </header>
  );
}

/** For phones that can't scan: the code printed under the QR code ("Event QMTCV5DN") opens the event too. */
function EventCode() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    if (!(await joinByCode(code))) setErr("No event with that code. Check the letters under the QR code.");
    setBusy(false);
  };
  return (
    <form className="card" onSubmit={go}>
      <div className="field"><label htmlFor="ev-code">Or type the event code</label>
        <input id="ev-code" type="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
          placeholder="e.g. QMTCV5DN" value={code} onChange={(e) => setCode(e.target.value)} /></div>
      <p className="small muted">It&apos;s printed under the QR code, after “Event”.</p>
      {err ? <div className="notice" role="alert">{err}</div> : null}
      <button className="btn dark block" type="submit" disabled={busy}>{busy ? "Opening…" : "Open event"}</button>
    </form>
  );
}

function Page() {
  const S = useApp(), mustInstall = useMustInstall();
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
        <EventCode />
        <InstallPrompt stage="before" />
        <NameStory />
        {S.unlocked ? null : <button className="btn ghost" onClick={organizerSignIn}><Icon n="lock" />Organizer sign in</button>}
        {S.mode === "local" ? <p className="mode-note">Demo mode: data stays in this browser. Sign in as organizer to create an event.</p> : null}
      </div>
    );
  }
  if (!S.unlocked) {
    if (mustInstall === null) return null;
    if (mustInstall) return (
      <>
        <GetTheApp e={e} ios={me(S) ? (
          <section className="card"><p className="small"><b>Already checked in on this browser?</b> Get a code here, then open the app, pick your name and enter it.</p><MoveCode /></section>
        ) : null} />
        <button className="btn ghost" onClick={organizerSignIn}><Icon n="lock" />Organizer sign in</button>
      </>
    );
  }
  if (!admin && !me(S)) return <CheckinPage e={e} />;
  if (!admin && S.ciJustDone) return <CheckedInPage />;
  const P = { event: EventPage, players: PlayersPage, courts: CourtsPage, bracket: BracketPage, results: ResultsPage, photos: PhotosPage, people: PeoplePage }[S.tab || "courts"] || CourtsPage;
  return (
    <>
      {!admin && S.tab === "courts" ? <div style={{ marginBottom: 18 }}><InstallPrompt stage="after" /></div> : null}
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
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    link.dataset.base ||= link.getAttribute("href") || "/manifest.webmanifest";
    const e = ev(S);
    link.href = e && !isAdminView(S) ? `/m/${eventCode(e)}` : link.dataset.base;
  }, [S.eventId, S.events, S.unlocked, S.preview]);

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
