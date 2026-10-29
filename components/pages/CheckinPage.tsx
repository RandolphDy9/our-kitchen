"use client";
import { useEffect, useState } from "react";
import { useApp, set } from "@/lib/store";
import { checkinOpen, checkinOpensAt, fmtClock, fmtDate, fmtTime, me, pById } from "@/lib/model";
import { claim, moveIn, organizerSignIn } from "@/lib/actions";
import type { EventDoc, Player } from "@/lib/types";
import { Av, Icon, LvlChip, NameStory, SplashArt } from "../ui";
import { InstallPrompt } from "../InstallPrompt";

/** The name is checked in on another app or phone: move it here with the code shown there. */
function MovePanel({ p, onCancel }: { p: Player; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (x: React.FormEvent) => {
    x.preventDefault();
    if (code.length !== 4) return setErr("Enter the 4-digit code.");
    setBusy(true);
    setErr(null);
    if (!(await moveIn(p.id, code))) setErr("That code didn't work. Codes last 10 minutes and stop after 5 wrong tries, so get a fresh one and try again.");
    setBusy(false);
  };
  return (
    <form className="card move-in" onSubmit={go}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Av p={p} /><b style={{ flex: 1, minWidth: 0 }}>{p.name}</b></div>
      <p className="small"><b>{p.name}</b> is already checked in on another app or phone. If that&apos;s you, open Qsina there (on iPhone, usually Safari), tap <b>Move my check-in</b> on your profile, and enter the code here.</p>
      <div className="field"><label htmlFor="mv-code">4-digit code</label>
        <input id="mv-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="one-time-code" enterKeyHint="done"
          value={code} onChange={(x) => setCode(x.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
      {err ? <div className="notice" role="alert">{err}</div> : null}
      <button className="btn dark block" type="submit" disabled={busy}>{busy ? "Moving…" : "Move my check-in here"}</button>
      <button className="btn ghost block" type="button" onClick={onCancel}>Not me</button>
      <p className="small">Can&apos;t get to the other app? Ask the organizer to undo your check-in, then check in here.</p>
    </form>
  );
}

export function CheckinPage({ e }: { e: EventDoc }) {
  const S = useApp();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const open = checkinOpen(e), opensAt = checkinOpensAt(e);
  const [, tick] = useState(0);
  // Re-render when check-in opens (timers cap near 24 days, so far-off events just wait for a reload).
  useEffect(() => {
    if (open || !opensAt) return;
    const ms = opensAt.getTime() - Date.now();
    if (ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => tick((n) => n + 1), ms + 500);
    return () => clearTimeout(t);
  }, [open, opensAt?.getTime()]);
  const ql = q.trim().toLowerCase(), cp = confirm ? pById(S, confirm) : null;
  let pick;
  if (cp && cp.uid && cp.uid !== S.uid) pick = <MovePanel p={cp} onCancel={() => setConfirm(null)} />;
  else if (cp) pick = (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Av p={cp} /><b style={{ flex: 1, minWidth: 0 }}>{cp.name}</b></div>
      <button className="btn dark block" onClick={() => claim(cp.id)}><Icon n="check" />Yes, check me in</button>
      <button className="btn ghost block" onClick={() => setConfirm(null)}>Not me</button>
    </div>
  );
  else if (!ql) pick = <p className="small muted">{S.players.length} {S.players.length === 1 ? "player" : "players"} registered. Type your name to find yourself.</p>;
  else {
    const list = S.players.filter((p) => p.name.toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 15);
    pick = list.length ? list.map((p) => (
      <button key={p.id} onClick={() => setConfirm(p.id)}><Av p={p} /><span className="grow">{p.name}</span>
        {p.checkedIn ? <span className="status live"><span className="dot live" />Here</span> : <LvlChip l={p.level} />}</button>
    )) : <p className="small muted">No one named “{q}” yet. Only organizers can add players.</p>;
  }
  return (
    <div className="view">
      <section className="splash"><SplashArt />
        <div className="copy">
          <span className="toppill" style={{ justifySelf: "start" }}>{e.venue || "Pickleball"}</span>
          <h1>Ready to rally?</h1><p>Check in to see your court, follow the scores and hype your crew.</p>
          <div className="meta"><span>{e.name}</span><span>{fmtDate(e.date)} · {fmtTime(e.start)}–{fmtTime(e.end)}</span></div>
        </div>
      </section>
      <InstallPrompt stage="before" />
      {!open && opensAt ? (
        <section className="card"><h2>Check-in isn&apos;t open yet</h2>
          <p>It opens an hour before the event starts, at <b>{fmtClock(opensAt.toISOString())}</b> on {fmtDate(e.date)}. Come back then and find your name.</p>
        </section>
      ) : <section className="card"><h2>Check in</h2>
        <div className="field"><label htmlFor="ciq">Find your name</label>
          <input id="ciq" type="search" placeholder="Start typing" autoComplete="off" autoCapitalize="words" enterKeyHint="search" value={q} onChange={(x) => { setQ(x.target.value); setConfirm(null); }} /></div>
        <div className="pick">{pick}</div>
        <p className="small muted">Can&apos;t find your name? Ask the organizer at the front desk to add you.</p>
      </section>}
      <NameStory />
      {S.unlocked ? null : <button className="btn ghost" onClick={organizerSignIn}><Icon n="lock" />Organizer sign in</button>}
    </div>
  );
}

export function CheckedInPage() {
  const S = useApp(), m = me(S);
  return (
    <div className="view">
      <section className="card done"><span className="done-badge"><Icon n="check" /></span>
        <h1>You&apos;re in{m ? ", " + m.name.split(" ")[0] : ""}</h1>
        <p className="muted">The organizer can see you&apos;ve arrived. Watch the Courts tab for your matchup.</p>
        <button className="btn dark" onClick={() => { set({ ciJustDone: false, tab: "courts" }); window.scrollTo(0, 0); }}>See the courts</button>
      </section>
    </div>
  );
}
