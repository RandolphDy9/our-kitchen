"use client";
import { useEffect, useState } from "react";
import { useApp, set } from "@/lib/store";
import { checkinOpen, checkinOpensAt, fmtClock, fmtDate, fmtTime, me, pById } from "@/lib/model";
import { claim, organizerSignIn } from "@/lib/actions";
import type { EventDoc } from "@/lib/types";
import { Av, Icon, LvlChip, SplashArt } from "../ui";

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
  if (cp) pick = (
    <div className="card mint" style={{ padding: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Av p={cp} /><b style={{ flex: 1, minWidth: 0 }}>{cp.name}</b></div>
      <button className="btn dark block" onClick={() => claim(cp.id)}><Icon n="check" />Yes, check me in</button>
      <button className="btn ghost block" onClick={() => setConfirm(null)}>Not me</button>
    </div>
  );
  else if (!ql) pick = <p className="small muted">{S.players.length} players registered. Type your name to find yourself.</p>;
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
