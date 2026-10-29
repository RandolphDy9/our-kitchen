"use client";
import { useState } from "react";
import { useApp, set, ls, toast, type CView } from "@/lib/store";
import {
  CAT_SHORT, LEVELS, anyP, busy, divById, divName, ev, first, fmtTime, gamesPlayed, isAdminView, isMineSched, kudosTotal,
  live, me, pName, poolTable, qualCount, rLabel, refText, scTxt, schedLocked, schedSides, standings, teamName, todayISO, wonBy,
} from "@/lib/model";
import { recordSched, saveResult, showMoveCode, startSched, testAlert, undoSched } from "@/lib/actions";
import { alertPrefs, applyWake, chime, notifySupported, primeAudio, requestNotify, wakeSupported } from "@/lib/alerts";
import type { Match, Sched } from "@/lib/types";
import { ArtCourt, ArtPaddle, Av, CatOnly, Icon, Tally, numOrNull } from "../ui";
import { Select } from "../Select";
import { useTick } from "../widgets";
import { Road } from "./BracketPage";

function MyBanner() {
  const S = useApp(), m = me(S), e = ev(S);
  if (!m) return null;
  const games = S.matches.filter((x) => [...x.teamA, ...x.teamB].includes(m.id)).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const fin = games.filter((x) => x.status === "done"), wins = fin.filter((x) => wonBy(x, m.id)).length, played = fin.length;
  const rank = standings(S).order.indexOf(m.id), lm = games.find((x) => x.status === "live");
  const dots = games.filter((x) => x.status !== "void").map((x) => x.status === "live" ? <i key={x.id} className="cur" /> : wonBy(x, m.id) ? <i key={x.id} className="w"><Icon n="check" /></i> : <i key={x.id} className="l" />);
  while (dots.length < 7) dots.push(<i key={"e" + dots.length} />);
  const top = rank >= 0 && rank < 5 ? <span className="toppill">Top {rank + 1}</span> : null;
  let boost;
  if (lm) {
    const mine = lm.teamA.includes(m.id) ? lm.teamA : lm.teamB, opp = lm.teamA.includes(m.id) ? lm.teamB : lm.teamA, partner = mine.find((x) => x !== m.id);
    boost = (
      <section className="boost up"><ArtCourt />
        <div className="boost-top"><span className="eyebrow">You&apos;re up · {rLabel(S, lm)}</span>{top}</div>
        <h1>Court {lm.court}</h1><p>With <b>{pName(S, partner)}</b> vs <b>{opp.map((id) => pName(S, id)).join(" & ")}</b></p>
        <span className="dots-label">Today</span><div className="dots">{dots}</div>
      </section>
    );
  } else {
    const lastWon = played && wonBy(fin[fin.length - 1], m.id);
    const sub = `${wins} ${wins === 1 ? "win" : "wins"} from ${played} ${played === 1 ? "game" : "games"} today`;
    const [title, line] = !played ? ["Warm up!", "You're checked in. Your court shows up here the moment you're called."] : lastWon ? ["Keep it up!", sub] : ["Next one's yours", sub];
    boost = (
      <section className="boost"><ArtPaddle />
        <div className="boost-top"><span className="eyebrow">Today&apos;s run</span>{top}</div>
        <h1>{title}</h1><p>{line}</p><span className="dots-label">Games</span><div className="dots">{dots}</div>
      </section>
    );
  }
  return (
    <div className="view" style={{ gap: 14 }}>
      <div className="greet"><h1>Hey, {m.name.split(" ")[0]}</h1><p>{e?.name || ""} · {e?.venue || ""}</p></div>
      <div className="me-grid">{boost}
        <section className="profile"><Av p={m} /><h2>{m.name}</h2>
          <span className="where"><Icon n="pin" />{e?.venue || ""}</span>
          <span className="small muted">{m.gender === "M" ? "Men's · " : m.gender === "F" ? "Women's · " : ""}{LEVELS[m.level]} level</span>
          <div className="pboxes">
            <div className="pbox"><span className="top"><Icon n="paddle" />{played}</span><span>Games</span></div>
            <div className="pbox"><span className="top"><Icon n="trophy" />{wins}</span><span>Wins</span></div>
            <div className="pbox"><span className="top"><Icon n="heart" />{kudosTotal(S, m.id)}</span><span>Reactions</span></div>
          </div>
          <Tally pid={m.id} />
          <button className="btn dark block" style={{ marginTop: 8 }} onClick={() => set({ tab: "people" })}>Hype a player</button>
          <MoveCode />
        </section>
      </div>
    </div>
  );
}

function MyGames() {
  const S = useApp(), m = me(S);
  if (!m || !S.sched.length) return null;
  const mine = S.sched.filter((x) => isMineSched(S, x)).sort((a, b) => a.slot - b.slot);
  if (!S.divs.some((d) => d.teams.some((t) => t.players.includes(m.id)))) return null;
  const up = mine.filter((x) => !x.res).slice(0, 4), doneN = mine.filter((x) => x.res).length;
  return (
    <section className="card">
      <div className="sec-head"><h2>My games</h2><button className="link" onClick={() => set({ cview: "schedule", sdiv: "mine", sScoring: null, tab: "courts" })}>Full schedule</button></div>
      {up.length ? up.map((x) => {
        const { A, B } = schedSides(S, x), isA = !!A && A.players.includes(m.id), opp = isA ? B : A, ref = isA ? x.b : x.a, d = divById(S, x.div)!;
        return (
          <div className="mg" key={x.id}>
            <span className="mg-t"><b>{fmtTime(x.time)}</b><small>Court {x.court}</small></span>
            <div style={{ minWidth: 0 }}>
              <div className="smeta"><span className={`tag ${d.cat}`}>{CAT_SHORT[d.cat]}</span><span>{d.level} · {x.label}</span></div>
              <div className="mg-vs">vs {opp ? teamName(S, opp) : <span className="tbd-ph">{refText(ref)}</span>}</div>
            </div>
            {x.live ? <span className="pill dark">Live</span> : null}
          </div>
        );
      }) : <p className="small muted">{doneN ? "You've played all your scheduled games. Playoff games appear here once your spot is decided." : "No upcoming games."}</p>}
      {up.length && !up.some((x) => x.stage !== "pool") ? <p className="small muted">Playoff games show up here once pool play decides your spot.</p> : null}
    </section>
  );
}

function AlertsCard() {
  const S = useApp();
  const [p, setP] = useState(alertPrefs);
  if (!me(S)) return null;
  const upd = (k: "sound" | "wake" | "notify", v: boolean) => {
    ls.set("al." + k, v);
    setP((x) => ({ ...x, [k]: v }));
  };
  return (
    <section className="card alerts">
      <div className="sec-head"><h2>Game alerts</h2><span className="pill"><Icon n="bell" />On</span></div>
      <p className="small">When an organizer starts your game, this screen flashes <b>“You&apos;re up!”</b> with your court, {p.sound ? "plays a chime" : "stays silent"} and vibrates. Keep Qsina open during the event to get alerts.</p>
      <label className="check"><input type="checkbox" checked={p.sound} onChange={(e) => { upd("sound", e.target.checked); if (e.target.checked) { primeAudio(); chime(); } }} /> Play a sound</label>
      {wakeSupported() ? <label className="check"><input type="checkbox" checked={p.wake} onChange={(e) => { upd("wake", e.target.checked); applyWake(e.target.checked); toast(e.target.checked ? "Your screen will stay on while Qsina is open" : "Screen can sleep again"); }} /> Keep my screen on while the app is open</label> : null}
      {notifySupported() ? <label className="check"><input type="checkbox" checked={p.notify} onChange={async (e) => {
        const on = e.target.checked && (await requestNotify());
        upd("notify", on);
        if (e.target.checked && !on) toast("Notifications are blocked. Allow them in your browser settings.");
      }} /> Notify me when the app is in the background</label> : null}
      <button className="btn sm" onClick={() => { primeAudio(); testAlert(); }}>Test my alert</button>
    </section>
  );
}

function ScoreForm({ m }: { m: Match }) {
  const S = useApp();
  const [a, setA] = useState(""), [b, setB] = useState("");
  const nA = m.teamA.map((id) => first(S, id)).join(" & "), nB = m.teamB.map((id) => first(S, id)).join(" & ");
  const win = (w: "A" | "B") => saveResult(m.id, w, numOrNull(a), numOrNull(b));
  return (
    <form className="score-form" onSubmit={(e) => {
      e.preventDefault();
      if (a !== "" && b !== "" && a !== b) win(+a > +b ? "A" : "B");
      else toast("Enter two different scores, or tap who won.");
    }}>
      <div className="score-row"><label htmlFor="sA">{nA}</label><input id="sA" type="number" min={0} max={99} inputMode="numeric" placeholder="11" autoFocus value={a} onChange={(e) => setA(e.target.value)} /></div>
      <div className="score-row"><label htmlFor="sB">{nB}</label><input id="sB" type="number" min={0} max={99} inputMode="numeric" placeholder="7" value={b} onChange={(e) => setB(e.target.value)} /></div>
      <p className="small muted">Enter the score, or just tap who won.</p>
      <div className="row">
        <button className="btn sm dark" type="button" onClick={() => win("A")}>{nA} won</button>
        <button className="btn sm dark" type="button" onClick={() => win("B")}>{nB} won</button>
        <button className="btn sm ghost" type="button" onClick={() => set({ scoring: null })}>Cancel</button>
      </div>
    </form>
  );
}

function Board() {
  const S = useApp();
  useTick();
  const e = ev(S), N = e?.courts || 0, byC: Record<number, Match> = {}, mid = me(S)?.id, admin = isAdminView(S);
  live(S).forEach((m) => { if (m.court) byC[m.court] = m; });
  if (!N) return <div className="empty">Set the number of courts in Event.</div>;
  return <>{Array.from({ length: N }, (_, i) => i + 1).map((c) => {
    const m = byC[c];
    if (!m) return <article className="court free" key={c}><div className="court-head"><b>Court {c}</b><span className="pill grey">Open</span></div><p className="small muted">Ready for the next matchup</p></article>;
    const mine = !!mid && [...m.teamA, ...m.teamB].includes(mid);
    const mins = Math.max(0, Math.round((Date.now() - +new Date(m.createdAt || Date.now())) / 60000)), frac = Math.min(1, mins / 20);
    return (
      <article className={`court ${mine ? "me" : ""}`} key={c}>
        <div className="court-head"><b>Court {c}</b>{mine ? <span className="pill dark">You</span> : null}<CatOnly cat={m.category} /></div>
        {S.scoring === m.id ? <ScoreForm m={m} /> : <>
          <div className="court-body"><span className="ibox"><Icon n="paddle" /></span>
            <div style={{ minWidth: 0 }}>
              <div className="lab">{rLabel(S, m)} · {LEVELS[m.level]} level</div>
              <div className="tA">{m.teamA.map((id) => first(S, id)).join(" & ")}</div>
              <div className="tB"><em>VS</em>{m.teamB.map((id) => first(S, id)).join(" & ")}</div>
            </div>
            <span className="quad">{[...m.teamA, ...m.teamB].map((id, k) => <Av key={k} p={anyP(S, id)} />)}</span>
          </div>
          <div className="track" title={`${mins} minutes on court`}><span className="fill" style={{ width: `calc((100% - 6px) * ${frac.toFixed(3)})` }} /><span className="ticks"><i /><i /><i /><i /><i /><i /></span></div>
          <div className="court-foot"><span className="status"><Icon n="clock" />{mins} min on court</span>{admin ? <button className="btn sm dark" onClick={() => set({ scoring: m.id })}>Record result</button> : null}</div>
        </>}
      </article>
    );
  })}</>;
}

/** Shows the code that moves this check-in to another app or phone (on iPhone, the Home Screen app). */
function MoveCode() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (code) return (
    <div className="move-code" role="status">
      <span>Your move code</span><b className="num">{code}</b>
      <p className="small">Open Qsina in the other app or phone, pick your name and enter this code. It works for 10 minutes.</p>
      <button className="btn sm ghost" onClick={() => setCode(null)}>Done</button>
    </div>
  );
  return <button className="btn sm ghost" disabled={busy} onClick={async () => { setBusy(true); setCode(await showMoveCode()); setBusy(false); }}>Move my check-in</button>;
}

function Queue() {
  const S = useApp(), gp = gamesPlayed(S), b = busy(S);
  const q = S.players.filter((p) => p.checkedIn && !b.has(p.id)).sort((a, c) => (gp[a.id] || 0) - (gp[c.id] || 0) || a.name.localeCompare(c.name));
  if (!q.length) return <span className="muted small">Nobody waiting right now.</span>;
  return <>{q.map((p) => <span className="chip on" key={p.id}>{p.name} <span className="muted num">· {gp[p.id] || 0}</span></span>)}</>;
}

function SRow({ x }: { x: Sched }) {
  const S = useApp();
  const [a, setA] = useState(""), [b, setB] = useState("");
  const { d, A, B } = schedSides(S, x);
  if (!d) return null;
  const admin = isAdminView(S), mine = isMineSched(S, x), won = x.res?.w, cn = ev(S)?.courtNames?.[x.court];
  const side = (t: typeof A, ref: Sched["a"], w: boolean) => t ? <span className={w ? "w" : ""}>{teamName(S, t)}</span> : <span className="tbd-ph">{refText(ref)}</span>;
  const status = x.res ? <span className="pill grey">{scTxt(x.res) || "Final"}</span> : x.live ? <span className="pill dark">Live</span> : null;
  let acts = null;
  if (admin) {
    if (x.res) acts = schedLocked(S, x) ? null : <button className="btn sm ghost" onClick={() => undoSched(x.id)}>Undo</button>;
    else if (A && B) acts = <>{x.live ? null : <button className="btn sm" onClick={() => startSched(x.id)}>Start</button>}<button className="btn sm dark" onClick={() => set({ sScoring: x.id })}>Score</button></>;
  }
  const win = async (w: "a" | "b") => {
    if (await recordSched(x.id, w, numOrNull(a), numOrNull(b))) {
      (document.activeElement as HTMLElement | null)?.blur();
      set({ sScoring: null });
      toast("Result saved");
    }
  };
  return (
    <div className={`srow ${mine ? "me" : ""} ${x.res ? "done" : ""} ${x.live ? "live" : ""}`}>
      <span className="sct"><small>Court</small>{x.court}</span>
      <div className="sbody">
        <div className="smeta"><span className={`tag ${d.cat}`}>{CAT_SHORT[d.cat]}</span>{cn ? <span className="cname"><Icon n="trophy" />{cn}</span> : null}<span>{d.level} · {x.label}</span>{mine ? <span className="pill dark">You</span> : null}</div>
        <div className="steams">{side(A, x.a, won === "a")}<em>vs</em>{side(B, x.b, won === "b")}</div>
        {admin && S.sScoring === x.id && A && B ? (
          <div className="sform">
            <div className="score-row"><label htmlFor="ssA">{teamName(S, A)}</label><input id="ssA" type="number" min={0} max={99} inputMode="numeric" placeholder="11" autoFocus value={a} onChange={(e) => setA(e.target.value)} /></div>
            <div className="score-row"><label htmlFor="ssB">{teamName(S, B)}</label><input id="ssB" type="number" min={0} max={99} inputMode="numeric" placeholder="7" value={b} onChange={(e) => setB(e.target.value)} /></div>
            <div className="row">
              <button className="btn sm dark" onClick={() => win("a")}>{teamName(S, A)} won</button>
              <button className="btn sm dark" onClick={() => win("b")}>{teamName(S, B)} won</button>
              <button className="btn sm ghost" onClick={() => set({ sScoring: null })}>Cancel</button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="sact">{status}{acts}</div>
    </div>
  );
}

function Schedule() {
  const S = useApp();
  useTick(60000);
  const admin = isAdminView(S), m = me(S), dsel = S.sdiv || "all";
  const list = S.sched.filter((x) => dsel === "all" || (dsel === "mine" ? isMineSched(S, x) : x.div === dsel)).sort((a, b) => a.slot - b.slot || a.court - b.court);
  const groups: { slot: number; time: string; end: string; items: Sched[] }[] = [];
  for (const x of list) {
    let g = groups[groups.length - 1];
    if (!g || g.slot !== x.slot) { g = { slot: x.slot, time: x.time, end: x.end, items: [] }; groups.push(g); }
    g.items.push(x);
  }
  const today = ev(S)?.date === todayISO(), d = new Date(), nowM = d.getHours() * 60 + d.getMinutes();
  const mins = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
  // Accordion: the first slot that isn't finished (and the one after it) open by default, plus any slot with a live game.
  // A short list (a filter, "My games") just stays open. Taps override the defaults per slot,
  // and are remembered on this device for the event, so switching tabs or reloading keeps them.
  const slotKey = "slots." + (S.eventId || "");
  const [open, setOpen] = useState<Record<number, boolean>>(() => ls.get(slotKey, {}));
  const toggle = (slot: number, to: boolean) => setOpen((o) => { const n = { ...o, [slot]: to }; ls.set(slotKey, n); return n; });
  const unfinished = groups.findIndex((g) => g.items.some((x) => !x.res));
  const focus = unfinished < 0 ? groups.length - 1 : unfinished, showAll = list.length <= 12;
  return (
    <div className="view" style={{ gap: 16 }}>
      <div className="field"><label htmlFor="sdiv">Show</label>
        <Select id="sdiv" value={dsel} onChange={(v) => set({ sdiv: v })} options={[
          ["all", "All divisions"], ...(!admin && m ? [["mine", "My games"] as const] : []), ...S.divs.map((dv) => [dv.id, divName(dv)] as const)]} />
      </div>
      {groups.length ? groups.map((g, gi) => {
        const n = g.items.length, fin = g.items.filter((x) => x.res).length, lv = g.items.filter((x) => x.live && !x.res).length;
        const st = today ? (nowM >= mins(g.end) ? (lv ? "" : "past") : nowM >= mins(g.time) ? "now" : "") : "";
        const mine = g.items.filter((x) => isMineSched(S, x));
        const isOpen = g.items.some((x) => x.id === S.sScoring) || (open[g.slot] ?? (showAll || lv > 0 || st === "now" || gi === focus || gi === focus + 1));
        const sum = fin === n ? `All ${n} final` : [`${n} game${n > 1 ? "s" : ""}`, lv ? `${lv} live` : "", fin ? `${fin} final` : ""].filter(Boolean).join(" · ");
        const bodyId = `slot-${g.slot}`;
        return (
          <section className={`tslot ${st} ${isOpen ? "open" : ""}`} key={g.slot}>
            <button type="button" className="tslot-h" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(g.slot, !isOpen)}>
              <span className="tslot-t">
                <span className="tslot-time"><b>{fmtTime(g.time)}</b><span>to {fmtTime(g.end)}</span>{st === "now" ? <span className="pill dark">Now</span> : null}</span>
                <span className="tslot-sum">{lv ? <span className="dot live" /> : null}{sum}
                  {mine.length ? <span className="pill">You · Court {mine.map((x) => x.court).join(", ")}</span> : null}</span>
              </span>
              <Icon n="chev" />
            </button>
            {isOpen ? <div className="tslot-list" id={bodyId}>{g.items.map((x) => <SRow key={x.id} x={x} />)}</div> : null}
          </section>
        );
      }) : <div className="empty">{dsel === "mine" ? "No games for you in the schedule yet." : "No games match this filter."}</div>}
    </div>
  );
}

function Pools() {
  const S = useApp(), mid = me(S)?.id;
  if (!S.divs.length) return <div className="empty">No pools yet.</div>;
  return (
    <div className="view" style={{ gap: 16 }}>{S.divs.map((d) => {
      const pools = d.pools.length ? d.pools : [null], q = qualCount(S, d);
      return (
        <section className="card" key={d.id}>
          <div className="sec-head"><h2>{divName(d)}</h2><span className={`tag ${d.cat}`}>{d.teams.length} teams</span></div>
          <div className="pools">{pools.map((p) => {
            const pt = poolTable(S, d, p);
            return (
              <div className="pool" key={p || "rr"}>
                <div className="pool-h"><b>{p ? `Pool ${p}` : "Round robin"}</b><span>{pt.played}/{pt.total} played{pt.complete ? " · Final" : ""}</span></div>
                <div className="tbl-wrap"><table className="ptable"><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>+/-</th></tr></thead><tbody>
                  {pt.rows.map((r, i) => {
                    const isMe = !!mid && r.t.players.includes(mid);
                    return <tr key={r.t.id} className={`${i < q ? "q" : ""} ${isMe ? "me" : ""}`}><td>{i + 1}</td><td>{teamName(S, r.t)}{isMe ? " ★" : ""}</td><td>{r.w}</td><td>{r.l}</td><td>{r.pf - r.pa > 0 ? "+" : ""}{r.pf - r.pa}</td></tr>;
                  })}
                </tbody></table></div>
              </div>
            );
          })}</div>
          <p className="small muted">{q ? `Top ${q} ${d.pools.length ? "in each pool" : "teams"} move on to the playoffs (highlighted). ` : ""}Ties break on point difference, then points scored.</p>
        </section>
      );
    })}</div>
  );
}

export function CourtsPage() {
  const S = useApp();
  const admin = isAdminView(S), hasSched = S.sched.length > 0, sv: CView = hasSched ? S.cview || "schedule" : "board";
  return (
    <div className="view">
      {admin ? null : <><MyBanner /><MyGames /><AlertsCard /><div style={{ display: "grid", gap: 14 }}><Road /></div></>}
      {hasSched ? (
        <div className="seg" role="group" aria-label="Courts view">
          {([["schedule", "Schedule"], ["pools", "Pools"], ["board", "Live courts"]] as const).map(([k, l]) =>
            <button key={k} aria-pressed={sv === k} onClick={() => set({ cview: k, sScoring: null })}>{l}</button>)}
        </div>
      ) : null}
      {sv === "schedule" ? <Schedule /> : sv === "pools" ? <Pools /> : <>
        <div className="sec-head"><h2>Courts</h2><span className="small muted">{live(S).length} of {ev(S)?.courts || 0} in play</span></div>
        <div className="legend"><span className="tag mens"><i />Men&apos;s</span><span className="tag womens"><i />Women&apos;s</span><span className="tag mixed"><i />Mixed</span></div>
        <div className="board"><Board /></div>
        <section className="card"><div className="sec-head"><h2>Waiting to play</h2><span className="small muted">Checked in, not on court</span></div><div className="queue"><Queue /></div></section>
      </>}
    </div>
  );
}
