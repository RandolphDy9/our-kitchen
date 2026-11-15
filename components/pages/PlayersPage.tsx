"use client";
import { useState } from "react";
import { useApp, set } from "@/lib/store";
import { LEVELS, busy, fmtClock, gamesPlayed, kudosTotal, live, me, reactionsOf, tally, wonBy } from "@/lib/model";
import { clearDemo, delPlayer, playerCode, setGender, toggleIn, toggleReaction } from "@/lib/actions";
import type { Player } from "@/lib/types";
import { Av, Icon, LvlChip, Tally } from "../ui";
import { Fans } from "../widgets";
import { MoveCode } from "./CourtsPage";

type PF = { q: string; g: string; lvl: string; st: string };

export function PlayersPage() {
  const S = useApp();
  const [f, setF] = useState<PF>({ q: "", g: "all", lvl: "all", st: "all" });
  const [menu, setMenu] = useState<string | null>(null);
  // Codes made for a player whose phone lost their check-in, shown on that player's row.
  const [codes, setCodes] = useState<Record<string, string>>({});
  const makeCode = async (id: string) => {
    setMenu(null);
    const c = await playerCode(id);
    if (c) setCodes((x) => ({ ...x, [id]: c }));
  };
  const i = S.players.filter((p) => p.checkedIn).length;
  const gp = gamesPlayed(S), b = busy(S), courtOf: Record<string, number | null> = {};
  live(S).forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => (courtOf[id] = m.court)));
  const list = S.players.filter((p) => (f.g === "all" || p.gender === f.g) && (f.lvl === "all" || p.level === f.lvl) &&
    (f.st === "all" || (f.st === "in" ? p.checkedIn : !p.checkedIn)) && (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => (b.checkedIn ? 1 : 0) - (a.checkedIn ? 1 : 0) || a.name.localeCompare(b.name));
  const demo = S.players.some((p) => p.demo);
  const pf = (k: keyof PF, v: string) => setF((x) => ({ ...x, [k]: v, ...(k === "g" && v === "all" ? { lvl: "all" } : {}) }));

  return (
    <div className="view">
      <div className="sec-head"><h2>Players</h2><span className="muted small">{i} active · {S.players.length} total</span></div>
      <div className="notice">Players come from the tournament schedule. To add or change players, update the Excel file and import it again from the Event tab.</div>
      <div className="field"><label htmlFor="pq" className="lbl">Search</label><input id="pq" type="search" placeholder="Find a player" value={f.q} onChange={(e) => pf("q", e.target.value)} /></div>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="seg" role="group" aria-label="Status">
          {[["all", "Everyone"], ["in", "Active"], ["out", "Not here"]].map(([v, l]) => <button key={v} aria-pressed={f.st === v} onClick={() => pf("st", v)}>{l}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Division and level">
          {([["g", "all", "All"], ["g", "M", "Men"], ["g", "F", "Women"], ["lvl", "low", "Low"], ["lvl", "high", "High"]] as const).map(([k, v, l]) =>
            <button key={k + v} aria-pressed={k === "g" ? f.g === v : f.lvl === v} onClick={() => pf(k, v)}>{l}</button>)}
        </div>
      </div>
      {!S.players.length ? (
        <div className="empty"><h3>No players yet</h3><p>Import the tournament schedule (.xlsx) from the Event tab. Its players are added here automatically.</p><button className="btn dark" onClick={() => set({ tab: "event" })}>Go to Event</button></div>
      ) : (
        <div>
          {demo ? <p className="small muted" style={{ marginBottom: 8 }}>Includes demo players · <button className="btn sm ghost" onClick={clearDemo}>Remove demo players</button></p> : null}
          {list.length ? <div className="list">{list.map((p) => (
            <div className="item" key={p.id}><Av p={p} />
              <div style={{ minWidth: 0 }}><div className="name">{p.name}</div>
                <div className="sub">
                  {p.checkedIn ? <span className="status live"><span className="dot live" />Active {fmtClock(p.checkedInAt)}</span> : <span className="status"><span className="dot" />Not here</span>}
                  {p.gender ? <span className="chip on">{p.gender === "M" ? "Men" : "Women"}</span>
                    : <span className="gset" title="Set gender"><button onClick={() => setGender(p.id, "M")} aria-label={`${p.name} is a man`}>M</button><button onClick={() => setGender(p.id, "F")} aria-label={`${p.name} is a woman`}>F</button></span>}
                  <LvlChip l={p.level} />
                  {b.has(p.id) ? <span className="chip open">Court {courtOf[p.id]}</span> : null}
                  <span className="small muted num">{gp[p.id] || 0} games</span><Tally pid={p.id} />
                </div>
              </div>
              <div className="acts">
                <button className={`btn sm ${p.checkedIn ? "soft" : "dark"}`} onClick={() => toggleIn(p.id)}>{p.checkedIn ? "Undo" : "Check in"}</button>
                {menu === p.id ? <>
                  {p.checkedIn && p.uid ? <button className="btn sm dark" onClick={() => makeCode(p.id)}>Phone code</button> : null}
                  <button className="btn sm danger" onClick={() => { setMenu(null); delPlayer(p.id); }}>Remove</button>
                  <button className="btn sm ghost" onClick={() => setMenu(null)}>Close</button>
                </> : <button className="btn sm ghost" onClick={() => setMenu(p.id)} aria-label={`More for ${p.name}`}>⋯</button>}
              </div>
              {codes[p.id] ? (
                <div className="move-code player-code" role="status">
                  <span>Code for {p.name}</span><b className="num">{codes[p.id]}</b>
                  <p className="small">On their phone: open Qsina, tap their name and enter this code. It works for 10 minutes. Their check-in, games and alerts move to that phone.</p>
                  <button className="btn sm ghost" onClick={() => setCodes(({ [p.id]: _, ...x }) => x)}>Done</button>
                </div>
              ) : null}
            </div>
          ))}</div> : <div className="empty">No players match.</div>}
        </div>
      )}
    </div>
  );
}

function ReactButtons({ p }: { p: Player }) {
  const S = useApp();
  const m = me(S), self = m && m.id === p.id, t = tally(S, p.id);
  return (
    <div className="reacts">{reactionsOf(S).map((r) => {
      const mine = !!m && S.kudos.some((k) => k.from === m.id && k.to === p.id && k.r === r.id);
      return (
        <button key={r.id} className="react" aria-pressed={mine} disabled={!m || !!self} aria-label={`${r.label} for ${p.name}`} onClick={() => toggleReaction(p.id, r.id)}>
          <span className="e">{r.emoji}</span>{r.label}<span className="n">{t[r.id] || ""}</span>
        </button>
      );
    })}</div>
  );
}

/** The player's own card: today's numbers, the reactions they've received, and moving their check-in. */
function MyCard() {
  const S = useApp(), m = me(S);
  if (!m) return null;
  const fin = S.matches.filter((x) => x.status === "done" && [...x.teamA, ...x.teamB].includes(m.id));
  const wins = fin.filter((x) => wonBy(x, m.id)).length;
  return (
    <section className="profile mine">
      <div className="who"><Av p={m} />
        <div><h2>{m.name}</h2><span className="small muted">{m.gender === "M" ? "Men's · " : m.gender === "F" ? "Women's · " : ""}{LEVELS[m.level]} level</span></div>
      </div>
      <div className="pboxes">
        <div className="pbox"><span className="top"><Icon n="paddle" />{fin.length}</span><span>Games</span></div>
        <div className="pbox"><span className="top"><Icon n="trophy" />{wins}</span><span>Wins</span></div>
        <div className="pbox"><span className="top"><Icon n="heart" />{kudosTotal(S, m.id)}</span><span>Reactions</span></div>
      </div>
      <Tally pid={m.id} />
      <MoveCode />
    </section>
  );
}

export function PeoplePage() {
  const S = useApp();
  const [rq, setRq] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const m = me(S), q = rq.trim().toLowerCase();
  const list = S.players.filter((p) => p.checkedIn && p.id !== m?.id && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="view">
      <MyCard />
      {S.kudos.length ? <section className="card"><div className="sec-head"><h2>Crowd favourites</h2><span className="seeall">Reactions</span></div><Fans /></section> : null}
      <div className="sec-head"><h2>Hype your fellow players</h2><span className="small muted">{list.length} here</span></div>
      <p className="small muted" style={{ marginTop: -10 }}>Tap Hype, then a reaction to give it. Tap it again to take it back.</p>
      <div className="field"><label htmlFor="rq" className="lbl">Search</label><input id="rq" type="search" placeholder="Find a player" value={rq} onChange={(e) => setRq(e.target.value)} /></div>
      <div className="list">
        {!list.length ? <div className="empty">{q ? "No one matches." : "Other players show up here once they check in."}</div> : list.map((p) => {
          const isOpen = open === p.id, n = kudosTotal(S, p.id);
          return (
            <div className={`item hype ${isOpen ? "open" : ""}`} key={p.id}><Av p={p} />
              <div style={{ minWidth: 0 }}>
                <div className="name">{p.name}</div>
                <div className="sub"><LvlChip l={p.level} />{n ? <Tally pid={p.id} /> : null}</div>
              </div>
              <button className={`btn sm ${isOpen ? "soft" : ""}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>{isOpen ? "Done" : "Hype"}</button>
              {isOpen ? <ReactButtons p={p} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
