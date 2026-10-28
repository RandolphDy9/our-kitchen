"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useApp, set } from "@/lib/store";
import {
  CAT_SHORT, anyP, at, cLabel, done, dur, first, fmtClock, fmtTime, isAdminView, kudosTotal, live, me, pById, pName,
  reactionsOf, standings,
} from "@/lib/model";
import { reopen } from "@/lib/actions";
import type { EventDoc } from "@/lib/types";
import { Av, CatTag, Icon, Tally } from "./ui";

/** Re-render every `ms` so clocks and "min on court" stay current. */
export function useTick(ms = 30000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Gauge({ L, N, liveSet }: { L: number; N: number; liveSet: Set<number | null> }) {
  const cx = 170, cy = 158, R = 146, r = 96, W = 340, H = 160;
  const pt = (rad: number, a: number) => [cx + rad * Math.cos(Math.PI * (1 - a)), cy - rad * Math.sin(Math.PI * (1 - a))];
  const f = (n: number) => n.toFixed(1);
  const arc = (a0: number, a1: number, ro: number, ri: number) => {
    const [x0, y0] = pt(ro, a0), [x1, y1] = pt(ro, a1), [x2, y2] = pt(ri, a1), [x3, y3] = pt(ri, a0), lg = a1 - a0 > 0.5 ? 1 : 0;
    return `M${f(x0)},${f(y0)} A${ro},${ro} 0 ${lg} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${ri},${ri} 0 ${lg} 0 ${f(x3)},${f(y3)}Z`;
  };
  const n = Math.max(1, N), segs: ReactNode[] = [], labels: ReactNode[] = [], ticks: ReactNode[] = [];
  for (let i = 1; i <= n; i++) {
    const a0 = (i - 1) / n, a1 = i / n, am = (a0 + a1) / 2;
    if (liveSet.has(i)) segs.push(<path key={"s" + i} d={arc(a0 + 0.004, a1 - 0.004, r + 14, r + 2)} fill="#f6b90a" />);
    if (n <= 16 || i % 2) {
      const [lx, ly] = pt((R + r) / 2 + 7, am);
      labels.push(<text key={"l" + i} x={f(lx)} y={f(ly)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${f(am * 180 - 90)} ${f(lx)} ${f(ly)})`}>{i}</text>);
    }
    if (i < n) {
      const [t0x, t0y] = pt(R - 3, a1), [t1x, t1y] = pt(R - 12, a1);
      ticks.push(<line key={"t" + i} x1={f(t0x)} y1={f(t0y)} x2={f(t1x)} y2={f(t1y)} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />);
    }
  }
  return (
    <svg className="gauge" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${L} of ${N} courts in play`}>
      <path d={arc(0, 0.5, R, r)} fill="#121212" /><path d={arc(0.5, 1, R, r)} fill="#121212" />{segs}{ticks}{labels}
    </svg>
  );
}

export function Hero({ e, go = true }: { e: EventDoc; go?: boolean }) {
  const S = useApp();
  useTick();
  const now = new Date(), st = at(e.date, e.start), en = at(e.date, e.end);
  let big = "–", small = "", state: ReactNode = "";
  if (st && en) {
    if (now < st) { big = dur(+st - +now); small = "to first serve"; state = "Upcoming"; }
    else if (now <= en) { big = dur(+en - +now); small = "left to play"; state = <><span className="dot live" />Live</>; }
    else { big = dur(+en - +st); small = "played"; state = "Wrapped up"; }
  }
  const inn = S.players.filter((p) => p.checkedIn).sort((a, b) => (b.checkedInAt || "").localeCompare(a.checkedInAt || ""));
  const N = e.courts || 0, lv = live(S), L = lv.length;
  return (
    <section className="hero">
      <div className="hero-top">
        <div><span className="eyebrow">Event clock</span><div className="clock">{big}<small>{small}</small></div></div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span className="stack">{inn.slice(0, 3).map((p) => <Av key={p.id} p={p} />)}</span>
          {inn.length > 3 ? <span className="pill dark">+{inn.length - 3}</span> : null}
        </div>
      </div>
      <h1>{e.name}</h1>
      <div className="meta">
        <span><Icon n="pin" />{e.venue || "Venue TBA"}</span>
        <span><Icon n="clock" />{fmtTime(e.start)}–{fmtTime(e.end)}</span>
        {state ? <span className="toppill">{state}</span> : null}
      </div>
      <div className="gauge-wrap">
        <div className="gauge-label"><span>Courts in play</span><b>{L} / {N}</b></div>
        <Gauge L={L} N={N} liveSet={new Set(lv.map((m) => m.court))} />
        {go ? <button className="go" onClick={() => set({ tab: "courts" })} aria-label="Open the court board"><i /><b>→</b></button> : null}
      </div>
    </section>
  );
}

export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const S = useApp();
  const byR = Object.fromEntries(reactionsOf(S).map((r) => [r.id, r]));
  const items: { t: string; key: string; p: { id: string; name: string }; title: string; sub: string; right: ReactNode }[] = [];
  S.players.filter((p) => p.checkedIn && p.checkedInAt).forEach((p) =>
    items.push({ t: p.checkedInAt!, key: "c" + p.id, p, title: p.name, sub: "Checked in", right: <span className="pill">Here</span> }));
  done(S).filter((m) => m.winner && m.endedAt).forEach((m) => {
    const w = m.winner === "A" ? m.teamA : m.teamB, sa = m.scoreA, sb = m.scoreB;
    items.push({ t: m.endedAt!, key: "m" + m.id, p: anyP(S, w[0]), title: w.map((id) => first(S, id)).join(" & "),
      sub: m.court ? `Won on Court ${m.court}` : `Won ${m.playoff?.label || "a playoff match"}`,
      right: sa != null && sb != null ? <span className="amt">{Math.max(sa, sb)}–{Math.min(sa, sb)}</span> : <span className="pill">Win</span> });
  });
  S.kudos.filter((k) => k.at && byR[k.r] && pById(S, k.from)).forEach((k) =>
    items.push({ t: k.at!, key: "k" + k.id, p: pById(S, k.from)!, title: pName(S, k.from), sub: `Gave ${first(S, k.to)} “${byR[k.r].label}”`, right: <span className="em">{byR[k.r].emoji}</span> }));
  items.sort((a, b) => b.t.localeCompare(a.t));
  if (!items.length) return <p className="small muted">Check-ins, wins and reactions show up here as they happen.</p>;
  return <>{items.slice(0, limit).map((x) => (
    <div className="act" key={x.key}><Av p={x.p} /><div style={{ minWidth: 0 }}><div className="t">{x.title}</div><div className="s">{x.sub} · {fmtClock(x.t)}</div></div>{x.right}</div>
  ))}</>;
}

export function PulseCard() {
  const S = useApp();
  const ins = S.players.filter((p) => p.checkedIn && p.checkedInAt).map((p) => +new Date(p.checkedInAt!));
  const gs = done(S).filter((m) => m.endedAt).map((m) => +new Date(m.endedAt!));
  const all = [...ins, ...gs];
  let body: ReactNode;
  if (all.length < 2) body = <p className="small muted">The chart fills in as players arrive and games finish.</p>;
  else {
    const t1 = Math.max(...all);
    let t0 = Math.min(...all);
    if (t1 - t0 < 30 * 60000) t0 = t1 - 30 * 60000;
    const N = 7, W = 320, H = 150, L = 6, R = 314, T = 14, B = 118;
    const ts = Array.from({ length: N }, (_, i) => t0 + (t1 - t0) * i / (N - 1));
    const s1 = ts.map((t) => ins.filter((x) => x <= t).length), s2 = ts.map((t) => gs.filter((x) => x <= t).length);
    const max = Math.max(4, ...s1, ...s2);
    const X = (i: number) => L + (R - L) * i / (N - 1), Y = (v: number) => B - (B - T) * v / max;
    const path = (arr: number[]) => {
      const P = arr.map((v, i) => [X(i), Y(v)]);
      let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, k = 0.18;
        d += ` C${(p1[0] + (p2[0] - p0[0]) * k).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * k).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * k).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * k).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    };
    const li = N - 1, px = X(li), py = Y(s1[li]);
    body = (
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s1[li]} check-ins and ${s2[li]} finished games so far`}>
          {[0, 0.5, 1].map((f) => <line key={f} className="grid" x1={L} x2={R} y1={(T + (B - T) * f).toFixed(1)} y2={(T + (B - T) * f).toFixed(1)} />)}
          <line className="vline" x1={px} x2={px} y1={T} y2={B} />
          <path className="l1" d={path(s1)} /><path className="l2" d={path(s2)} />
          <circle className="pt" cx={px} cy={py} r="5" />
          {ts.map((t, i) => i % 2 ? null : <text key={i} className="axis day" x={X(i)} y={B + 20} textAnchor={i === 0 ? "start" : i === N - 1 ? "end" : "middle"}>{new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</text>)}
        </svg>
        <div className={`tip ${py < T + (B - T) * 0.45 ? "below" : ""}`} style={{ left: `${(px / W * 100).toFixed(1)}%`, top: `${(py / H * 100).toFixed(1)}%` }}>
          <span>As of {fmtClock(new Date(t1).toISOString())}</span>Checked in: {s1[li]}<br />Games done: {s2[li]}
        </div>
      </div>
    );
  }
  return (
    <section className="card">
      <div className="sec-head"><h2>Progress</h2>
        <div className="chart-legend"><span className="pill"><i style={{ background: "var(--ink)" }} />Check-ins</span><span className="pill"><i style={{ background: "var(--lime)" }} />Games done</span></div>
      </div>
      <div>{body}</div>
    </section>
  );
}

export function RCards() {
  const S = useApp();
  const d = done(S).filter((m) => m.winner).slice(0, 10);
  if (!d.length) return <div className="rcard"><span className="lab">No results yet</span><div className="names">First winners land here</div><div className="foot"><span>Stay tuned</span></div></div>;
  return <>{d.map((m) => {
    const w = m.winner === "A" ? m.teamA : m.teamB, sc = m.scoreA != null && m.scoreB != null ? `${Math.max(m.scoreA, m.scoreB)}–${Math.min(m.scoreA, m.scoreB)}` : "Win";
    return (
      <div className="rcard" key={m.id}>
        <span className="lab">{cLabel(m)} <span className="pill">{sc}</span></span>
        <span className="what">{CAT_SHORT[m.category]} winners</span>
        <div className="names">{w.map((id) => first(S, id)).join(" & ")}</div>
        <div className="foot"><span className="stack">{w.map((id) => <Av key={id} p={anyP(S, id)} />)}</span><span>{fmtClock(m.endedAt)}</span></div>
      </div>
    );
  })}</>;
}

const Lrow = ({ p, i, right, sub }: { p: { id: string; name: string }; i: number; right: ReactNode; sub: ReactNode }) => (
  <div className="lrow"><span className="rnk">{i + 1}</span><Av p={p} /><div style={{ minWidth: 0 }}><div className="name">{p.name}</div><div className="sub">{sub}</div></div>{right}</div>
);

export function Leaders() {
  const S = useApp();
  const { w, g, order } = standings(S), rows = order.slice(0, 5);
  if (!rows.length) return <p className="small muted">Wins show up here once the first games finish.</p>;
  return <div className="lboard">{rows.map((id, i) => (
    <Lrow key={id} p={pById(S, id)!} i={i} right={<span className="pill"><Icon n="bolt" />{w[id]} {w[id] === 1 ? "win" : "wins"}</span>} sub={<><span>{g[id]} played</span><Tally pid={id} /></>} />
  ))}</div>;
}

export function Fans() {
  const S = useApp();
  const rows = S.players.map((p) => [p, kudosTotal(S, p.id)] as const).filter((x) => x[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).slice(0, 5);
  if (!rows.length) return <p className="small muted">No reactions yet. Players can hype each other up from the Players tab.</p>;
  return <div className="lboard">{rows.map(([p, n], i) => <Lrow key={p.id} p={p} i={i} right={<span className="pill"><Icon n="heart" />{n}</span>} sub={<Tally pid={p.id} />} />)}</div>;
}

export function ResultsList() {
  const S = useApp();
  const d = done(S).slice(0, 40), mid = me(S)?.id, admin = isAdminView(S);
  if (!d.length) return <div className="empty"><span className="sq"><Icon n="trophy" /></span><p>No finished games yet. Results appear here the moment a court reports in.</p></div>;
  return <>{d.map((m) => {
    const line = (t: "A" | "B", team: string[], sc?: number | null) => {
      const won = m.winner === t;
      return (
        <div className={`result-line ${won ? "win" : "lose"}`} key={t}>
          <span className="stack">{team.map((id) => <Av key={id} p={anyP(S, id)} />)}</span>
          <span className="names">{team.map((id) => pName(S, id)).join(" & ")}{mid && team.includes(mid) ? <> <span className="chip on">You</span></> : null}</span>
          <span className={`pill ${won ? "" : "grey"}`}>{won ? <><Icon n="trophy" />Won</> : "Lost"}{sc != null ? ` · ${sc}` : ""}</span>
        </div>
      );
    };
    const a = line("A", m.teamA, m.scoreA), b = line("B", m.teamB, m.scoreB);
    return (
      <div className="result" key={m.id}>
        <div className="result-top">
          <span><b style={{ color: "var(--ink)", fontWeight: 600 }}>{cLabel(m)}{m.playoff ? " · " + m.playoff.label : ""}</b> · <CatTag m={m} /></span>
          <span className="num">{fmtClock(m.endedAt)}{admin ? <> <button className="btn sm ghost" onClick={() => reopen(m.id)}>Undo</button></> : null}</span>
        </div>
        {m.winner === "B" ? <>{b}{a}</> : <>{a}{b}</>}
      </div>
    );
  })}</>;
}
