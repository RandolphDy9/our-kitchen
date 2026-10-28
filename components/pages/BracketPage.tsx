"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, set, toast } from "@/lib/store";
import {
  CATS, LEVELS, anyP, bMatch, brList, canUndo, curBracket, eligible, fmtTime, freeCourts, isAdminView, me, myTeamIn, planOf,
  pmOf, pName, podium, poolTable, rankPlayers, refLabel, scTxt, standings, tName,
} from "@/lib/model";
import { bkDelete, bkSendCourt, bkStart, bkUndo, recordPlayoff, recordSched, startSched, undoSched } from "@/lib/actions";
import type { Bracket, Cat, Level, Ref } from "@/lib/types";
import { Av, Icon, TrophyArt, numOrNull } from "../ui";

export function Road() {
  const S = useApp(), m = me(S);
  if (!m) return null;
  return <>{brList(S).map((br) => {
    const ti = myTeamIn(br, m.id);
    if (ti < 0) return null;
    const pool = br.pools?.[ti] || null;
    const mine = planOf(br).map((p) => bMatch(br, p.id)).filter((x) => x.a === ti || x.b === ti);
    if (br.virtual && !mine.length) {
      const pt = poolTable(S, br.div!, pool);
      return (
        <section className="road" key={br.id}>
          <div className="road-top"><span className="eyebrow">Road to the championship · {br.name}</span><span className="pill dark">{pool ? `Pool ${pool}` : "Round robin"}</span></div>
          <h2>{pt.complete ? "Pool play finished" : "Pool play in progress"}</h2>
          <p>{pt.complete ? "Your team didn't make the playoffs this time. Great games!" : `Finish near the top of your ${pool ? "pool" : "standings"} to reach the playoffs. ${pt.played} of ${pt.total} games played.`}</p>
        </section>
      );
    }
    const pd = podium(br), pending = mine.find((x) => !x.res);
    const place = pd && (pd.gold === ti ? "🥇 Champions!" : pd.silver === ti ? "🥈 Runner-up" : pd.bronze === ti ? "🥉 Bronze medal" : "");
    let big: string, line: React.ReactNode = "";
    if (place) { big = place; line = `Teaming with ${pName(S, br.teams[ti].find((x) => x !== m.id))}. What a run!`; }
    else if (pending) {
      const opp = pending.a === ti ? pending.b : pending.a, oref = pending.a === ti ? pending.rb : pending.ra;
      big = pending.live ? `You're on Court ${pending.live.court}` : `Next: ${pending.r}`;
      line = opp != null
        ? <>vs <b>{tName(S, br, opp)}</b> ({br.virtual ? (br.pools?.[opp] ? `Pool ${br.pools[opp]}` : "round robin") : `seed ${opp + 1}`})</>
        : `vs the ${refLabel(br, oref).replace(/^W/, "w").replace(/^L/, "l")}`;
    } else {
      const last = mine[mine.length - 1], opp = last ? (last.a === ti ? last.b : last.a) : null;
      big = last ? `Out in the ${last.r.toLowerCase()}` : "Waiting to start";
      line = opp != null ? `Lost to ${tName(S, br, opp)}. Great effort!` : "";
    }
    return (
      <section className="road" key={br.id}>
        <div className="road-top"><span className="eyebrow">Road to the championship · {br.name}</span><span className="pill dark">{br.virtual ? (pool ? `Pool ${pool}` : "Round robin") : `Seed ${ti + 1}`}</span></div>
        <h2>{big}</h2><p>{line}</p>
        <div className="road-steps">{mine.map((x) => {
          const won = !!x.res && ((x.res.w === "a" && x.a === ti) || (x.res.w === "b" && x.b === ti));
          return <span key={x.id} className={`rs ${x.res ? (won ? "w" : "l") : "p"}`}>{x.short}{x.res ? (won ? " · Won" : " · Lost") : ""}</span>;
        })}</div>
      </section>
    );
  })}</>;
}

function BMBox({ br, id, meIdx, sel, onSel }: { br: Bracket; id: string; meIdx: number; sel: string | null; onSel: (id: string) => void }) {
  const S = useApp(), m = bMatch(br, id), admin = isAdminView(S);
  const row = (side: "a" | "b", ref: Ref) => {
    const i = m[side];
    if (i == null) return <span className="rowt tbd"><span className="sd">–</span><span className="nm">{refLabel(br, ref)}</span><span /></span>;
    const won = !!m.res && m.res.w === side, lost = !!m.res && m.res.w !== side, sc = m.res ? (side === "a" ? m.res.sa : m.res.sb) : null;
    return (
      <span className={`rowt ${won ? "win" : ""} ${lost ? "lose" : ""} ${i === meIdx ? "me" : ""}`}>
        <span className="sd" title={i === meIdx ? "Your team" : undefined}>{i === meIdx ? "★" : br.virtual ? (br.pools?.[i] || "•") : i + 1}</span>
        <span className="nm">{tName(S, br, i)}</span>
        <span className="sc">{sc != null ? sc : won ? <Icon n="check" /> : null}</span>
      </span>
    );
  };
  const head = m.live ? <span className="lv">Court {m.live.court} · Live</span> : m.res ? <span>Final score</span> : null;
  const cls = `bm ${id === "f" ? "final" : ""} ${id === "b" ? "bronze" : ""} ${admin && sel === id ? "sel" : ""}`;
  const inner = <><span className="bm-h"><span>{m.short}</span>{head}</span>{row("a", m.ra)}{row("b", m.rb)}</>;
  return admin
    ? <button type="button" className={cls} onClick={() => onSel(id)} aria-label={`${m.r} ${m.short}`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

function BracketView({ br, sel, onSel }: { br: Bracket; sel: string | null; onSel: (id: string) => void }) {
  const S = useApp(), meId = me(S)?.id, mi = meId ? myTeamIn(br, meId) : -1;
  const B = (id: string) => (pmOf(br, id) ? <BMBox br={br} id={id} meIdx={mi} sel={sel} onSel={onSel} /> : null);
  const center = (
    <div className="bcol center">
      <div className="ctop"><span className="cup"><TrophyArt /></span><span className="ct">Championship</span></div>{B("f")}
      <div className="cbot"><span className="ct">Battle for bronze</span>{B("b")}</div>
    </div>
  );
  if (br.size === 8) return (
    <div className="bracket b8">
      <div className="bcol"><span className="rt">Quarterfinals</span><div className="pair l">{B("q1")}{B("q2")}</div></div>
      <div className="bcol mid l"><span className="rt">Semifinal</span>{B("s1")}</div>{center}
      <div className="bcol mid r"><span className="rt">Semifinal</span>{B("s2")}</div>
      <div className="bcol"><span className="rt">Quarterfinals</span><div className="pair r">{B("q3")}{B("q4")}</div></div>
    </div>
  );
  if (br.size === 2) return <div className="bracket b2">{center}</div>;
  return <div className="bracket b4"><div className="bcol mid l"><span className="rt">Semifinal</span>{B("s1")}</div>{center}<div className="bcol mid r"><span className="rt">Semifinal</span>{B("s2")}</div></div>;
}

function Podium({ br }: { br: Bracket }) {
  const S = useApp(), p = podium(br);
  if (!p) return null;
  const blk = (i: number | null, place: string, medal: string, cls: string, n: number) => (
    <div className={`pod ${cls}`}>
      <span className="medal" aria-hidden="true">{medal}</span>
      {i == null ? null : <span className="stack">{br.teams[i].map((id) => <Av key={id} p={anyP(S, id)} />)}</span>}
      <b>{i == null ? "To be decided" : tName(S, br, i)}</b><span className="place">{place}</span><div className="step">{n}</div>
    </div>
  );
  return <section className="podium" aria-label="Podium">{blk(p.silver, "2nd place", "🥈", "silver", 2)}{blk(p.gold, "Champions", "🥇", "gold", 1)}{blk(p.bronze, "3rd place", "🥉", "bronze", 3)}</section>;
}

function BkBlock({ br, sel, onSel }: { br: Bracket; sel: string | null; onSel: (id: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const n = scroller.current;
    if (n) n.scrollLeft = (n.scrollWidth - n.clientWidth) / 2;
  }, [br.id]);
  const pd = podium(br);
  return (
    <>
      <Podium br={br} />
      <section className="card bk-card">
        <div className="sec-head">
          <div style={{ minWidth: 0 }}><h2>{br.name}</h2><span className="small muted">{br.virtual
            ? `${br.size === 8 ? "Quarterfinals to final" : br.size === 4 ? "Semifinals to final" : "Top teams play for gold"} · seeded from pool play`
            : `${br.size} teams · seeded by today's wins`}</span></div>
          {pd && pd.bronze != null ? <span className="pill dark">Complete</span> : <span className="pill">In progress</span>}
        </div>
        <div className="bk-scroll" ref={scroller}><BracketView br={br} sel={sel} onSel={onSel} /></div>
        <p className="small muted">Swipe sideways to see the whole bracket.</p>
      </section>
    </>
  );
}

function BkPanel({ br, sel, setSel }: { br: Bracket; sel: string | null; setSel: (s: string | null) => void }) {
  const S = useApp();
  const [delAsk, setDelAsk] = useState(false);
  const [a, setA] = useState(""), [b, setB] = useState(""), [court, setCourt] = useState("");
  useEffect(() => { setA(""); setB(""); setCourt(""); }, [sel]);
  if (!sel || !pmOf(br, sel)) return (
    <section className="card"><p className="small muted">Tap any match in the bracket to send it to a court or record the result.</p>
      {br.virtual ? null : <div className="row">{delAsk
        ? <><button className="btn sm danger" onClick={() => { setDelAsk(false); bkDelete(); }}>Yes, delete this playoff</button><button className="btn sm ghost" onClick={() => setDelAsk(false)}>Keep it</button></>
        : <button className="btn sm ghost" onClick={() => setDelAsk(true)}>Delete this playoff</button>}</div>}
    </section>
  );
  const id = sel, m = bMatch(br, id);
  const nm = (side: "a" | "b") => (m[side] != null ? tName(S, br, m[side]) : refLabel(br, side === "a" ? m.ra : m.rb));
  const sid = pmOf(br, id)?.sid;
  const win = async (w: "a" | "b") => {
    const ok = br.virtual ? await recordSched(sid!, w, numOrNull(a), numOrNull(b)) : await recordPlayoff(br.id, id, w, numOrNull(a), numOrNull(b));
    if (ok) { (document.activeElement as HTMLElement | null)?.blur(); toast("Result saved. The winner moves on."); }
  };
  let body;
  if (m.a == null || m.b == null) body = <p className="small muted">This match unlocks once the earlier results are in.</p>;
  else if (m.res) body = <>
    <p><b>{nm(m.res.w)}</b> won{scTxt(m.res) ? ` ${scTxt(m.res)}` : ""}.</p>
    {canUndo(br, id) ? <div><button className="btn sm" onClick={() => (br.virtual ? undoSched(sid!) : bkUndo(id))}>Undo result</button></div> : <p className="small muted">The next round has started, so this result is locked.</p>}
  </>;
  else {
    const free = freeCourts(S), cv = court || String(free.includes(m.court!) ? m.court : free[0] || "");
    body = <>
      {m.live ? <p><span className="pill dark">On Court {m.live.court} now</span></p> : <>
        <div className="row">
          <div className="field" style={{ flex: "0 1 140px" }}><label htmlFor="bk-court">Court</label>
            <select id="bk-court" value={cv} onChange={(e) => setCourt(e.target.value)}>{free.map((c) => <option key={c} value={c}>Court {c}</option>)}</select></div>
          <button className="btn sm" disabled={!free.length} onClick={() => (br.virtual ? startSched(sid!, cv) : bkSendCourt(id, +cv))}>Send to court</button>
        </div>
        {free.length ? null : <p className="small muted">Every court is busy right now.</p>}
      </>}
      <div className="score-row"><label htmlFor="bkA">{nm("a")}</label><input id="bkA" type="number" min={0} max={99} inputMode="numeric" placeholder="11" value={a} onChange={(e) => setA(e.target.value)} /></div>
      <div className="score-row"><label htmlFor="bkB">{nm("b")}</label><input id="bkB" type="number" min={0} max={99} inputMode="numeric" placeholder="7" value={b} onChange={(e) => setB(e.target.value)} /></div>
      <p className="small muted">Enter the score, or just tap who won. The winner moves on automatically.</p>
      <div className="row"><button className="btn sm dark" onClick={() => win("a")}>{nm("a")} won</button><button className="btn sm dark" onClick={() => win("b")}>{nm("b")} won</button></div>
    </>;
  }
  return (
    <section className="card">
      <div className="sec-head"><h2>{m.r} · {m.short}</h2><button className="btn sm ghost" onClick={() => setSel(null)}>Close</button></div>
      <p>{nm("a")} <b>vs</b> {nm("b")}</p>
      {m.time ? <p className="small muted">Scheduled {fmtTime(m.time)} on Court {m.court}</p> : null}
      {body}
    </section>
  );
}

type Cfg = { cat: Cat; lvl: Level; size: number; pair: "balanced" | "top"; inOnly: boolean };
function Builder({ onDone }: { onDone: () => void }) {
  const S = useApp();
  const [g, setG] = useState<Cfg>({ cat: "mixed", lvl: "any", size: 4, pair: "balanced", inOnly: true });
  const [draft, setDraft] = useState<(Cfg & { teams: string[][] }) | null>(null);
  const build = () => {
    const N = g.size, pool = eligible(S, g.cat, g.lvl, g.inOnly), { w } = standings(S);
    let teams: string[][] = [];
    if (g.cat === "mixed") {
      const M = rankPlayers(S, pool.filter((p) => p.gender === "M")), W = rankPlayers(S, pool.filter((p) => p.gender === "F"));
      if (M.length < N || W.length < N) return toast(`Mixed with ${N} teams needs ${N} men and ${N} women. Found ${M.length} and ${W.length}.`);
      for (let i = 0; i < N; i++) teams.push([M[i].id, (g.pair === "top" ? W[i] : W[N - 1 - i]).id]);
    } else {
      const P = rankPlayers(S, pool);
      if (P.length < 2 * N) return toast(`${N} teams needs ${2 * N} players. Found ${P.length}.`);
      for (let i = 0; i < N; i++) teams.push(g.pair === "top" ? [P[2 * i].id, P[2 * i + 1].id] : [P[i].id, P[2 * N - 1 - i].id]);
    }
    const tw = (t: string[]) => (w[t[0]] || 0) + (w[t[1]] || 0);
    teams = teams.map((t, i) => [t, i] as const).sort((x, y) => tw(y[0]) - tw(x[0]) || x[1] - y[1]).map((x) => x[0]);
    setDraft({ ...g, teams });
  };
  const sel = <K extends keyof Cfg>(id: string, k: K, opts: [string | number, string][]) => (
    <select id={id} value={String(g[k])} onChange={(e) => setG({ ...g, [k]: k === "size" ? +e.target.value : e.target.value })}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const pool = draft ? rankPlayers(S, eligible(S, draft.cat, draft.lvl, draft.inOnly)) : [];
  return (
    <section className="card">
      <div className="sec-head"><h2>New playoff</h2><button className="btn sm ghost" onClick={onDone}>Cancel</button></div>
      <div className="row">
        <div className="field"><label htmlFor="bk-cat">Category</label>{sel("bk-cat", "cat", Object.entries(CATS))}</div>
        <div className="field"><label htmlFor="bk-lvl">Level</label>{sel("bk-lvl", "lvl", Object.entries(LEVELS))}</div>
        <div className="field"><label htmlFor="bk-size">Teams</label>{sel("bk-size", "size", [[4, "4 teams"], [8, "8 teams"]])}</div>
        <div className="field"><label htmlFor="bk-pair">Pairing</label>{sel("bk-pair", "pair", [["balanced", "Balanced (best with newest)"], ["top", "Strongest together"]])}</div>
      </div>
      <label className="check"><input type="checkbox" checked={g.inOnly} onChange={(e) => setG({ ...g, inOnly: e.target.checked })} /> Only players who checked in</label>
      <button className="btn sm" onClick={build}>Build teams from today&apos;s results</button>
      {draft ? <>
        <p className="small muted">Seeds are ranked by wins today. Swap any player before you start.</p>
        <div className="draft">{draft.teams.map((t, i) => (
          <div className="draft-row" key={i}><span className="seed">{i + 1}</span>
            {[0, 1].map((j) => (
              <select key={j} aria-label={`Seed ${i + 1} player ${j + 1}`} value={t[j] || ""} onChange={(e) => {
                const teams = draft.teams.map((x) => [...x]);
                teams[i][j] = e.target.value;
                setDraft({ ...draft, teams });
              }}>
                <option value="">Pick a player</option>
                {pool.filter((p) => draft.cat !== "mixed" || (j === 0 ? p.gender === "M" : p.gender === "F")).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ))}
          </div>
        ))}</div>
        <button className="btn dark block" onClick={async () => { if (await bkStart({ cat: draft.cat, lvl: draft.lvl, size: draft.size, teams: draft.teams })) onDone(); }}>Start playoffs</button>
      </> : null}
    </section>
  );
}

export function BracketPage() {
  const S = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const admin = isAdminView(S), list = brList(S), br = curBracket(S);
  useEffect(() => setSel(null), [br?.id]);
  return (
    <div className="view">
      {admin ? null : <div style={{ display: "grid", gap: 14 }}><Road /></div>}
      <div className="sec-head"><h2>Playoffs</h2>{admin && !building ? <button className="btn sm dark" onClick={() => setBuilding(true)}><Icon n="plus" />New playoff</button> : null}</div>
      {admin && building ? <Builder onDone={() => setBuilding(false)} /> : null}
      {list.length > 1 ? (
        <div className="seg" role="group" aria-label="Choose a playoff">
          {list.map((b) => <button key={b.id} aria-pressed={b.id === br?.id} onClick={() => set({ bkId: b.id })}>{b.name}</button>)}
        </div>
      ) : null}
      {!br ? (admin && building ? null : (
        <div className="empty"><span className="sq"><Icon n="bracket" /></span><h3>No playoffs yet</h3>
          <p>{admin ? "Build a bracket from today's results. Top teams play for the championship, and semifinal losers battle for bronze." : "When the organizer starts the bracket, you'll see your road to the championship here."}</p>
          {admin ? <button className="btn dark" onClick={() => setBuilding(true)}>Create playoff</button> : null}
        </div>
      )) : <>
        <BkBlock br={br} sel={sel} onSel={(id) => setSel(sel === id ? null : id)} />
        {admin ? <BkPanel br={br} sel={sel} setSel={setSel} /> : null}
      </>}
    </div>
  );
}
