/* Derived data. Ported 1:1 from the original artifact's helpers; each takes the app state. */
import { ls, type AppState } from "./store";
import type {
  Bracket, Cat, Div, EventDoc, Match, PlanItem, Player, Reaction, Ref, Sched, SRef, Team,
} from "./types";

type S = AppState;

export const CATS: Record<Cat, string> = { mens: "Men's doubles", womens: "Women's doubles", mixed: "Mixed doubles" };
export const CAT_SHORT: Record<string, string> = { mens: "Men's", womens: "Women's", mixed: "Mixed" };
export const LEVELS: Record<string, string> = { low: "Low", high: "High", any: "Open" };
export const DEFAULT_REACTIONS: Reaction[] = [
  { id: "badass", emoji: "🔥", label: "Badass" }, { id: "pickler", emoji: "🥒", label: "Pro pickler" },
  { id: "flame", emoji: "☄️", label: "Flame thrower" }, { id: "great", emoji: "🙌🏼", label: "Great player" },
];
export const MAX_REACTIONS = 5;

/* ---------- formatting ---------- */
export function uid(n = 8) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  const r = new Uint8Array(n);
  crypto.getRandomValues(r);
  return [...r].map((x) => a[x % a.length]).join("");
}
export function shuffle<T>(a: T[]) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function fmtDate(d?: string) {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export function fmtTime(t?: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export const fmtClock = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");
export function at(date?: string, t?: string) {
  if (!date || !t) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
}
/* Players can check themselves in from an hour before the start (supabase/schema.sql enforces it too). */
export const CHECKIN_LEAD_MS = 60 * 60 * 1000;
export function checkinOpensAt(e?: EventDoc | null) {
  const s = at(e?.date, e?.start);
  return s ? new Date(s.getTime() - CHECKIN_LEAD_MS) : null;
}
export const checkinOpen = (e?: EventDoc | null) => {
  const o = checkinOpensAt(e);
  return !o || Date.now() >= o.getTime();
};
export function dur(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
export const initials = (n?: string | null) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export function hue(s?: string | null) {
  let h = 0;
  for (const c of s || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 5;
}
export const scTxt = (r?: { sa: number | null; sb: number | null } | null) =>
  r && r.sa != null && r.sb != null ? `${Math.max(r.sa, r.sb)}–${Math.min(r.sa, r.sb)}` : "";
export const todayISO = () => new Date().toLocaleDateString("en-CA");

/* ---------- people + matches ---------- */
export const ev = (S: S): EventDoc | null => S.events.find((e) => e.id === S.eventId) || null;
export const pById = (S: S, id?: string | null) => S.players.find((p) => p.id === id);
export const pName = (S: S, id?: string | null) => pById(S, id)?.name || "Removed player";
export const first = (S: S, id?: string | null) => pName(S, id).split(" ")[0];
export const anyP = (S: S, id: string): Pick<Player, "id" | "name"> => pById(S, id) || { id, name: "?" };
export function gamesPlayed(S: S) {
  const g: Record<string, number> = {};
  for (const m of S.matches) for (const id of [...m.teamA, ...m.teamB]) g[id] = (g[id] || 0) + 1;
  return g;
}
export const live = (S: S) => S.matches.filter((m) => m.status === "live");
export const done = (S: S) => S.matches.filter((m) => m.status === "done").sort((a, b) => (b.endedAt || "").localeCompare(a.endedAt || ""));
export const busy = (S: S) => new Set(live(S).flatMap((m) => [...m.teamA, ...m.teamB]));
export function me(S: S): Player | null {
  if (!S.eventId) return null;
  return (S.uid && S.players.find((p) => p.uid === S.uid)) || pById(S, ls.get("me." + S.eventId, "")) || null;
}
export const isAdminView = (S: S) => S.unlocked && !S.preview;
export const actorId = (S: S) => (isAdminView(S) ? "admin" : me(S)?.id || null);
export const actorName = (S: S, id: string) => (id === "admin" ? "Organizer" : pName(S, id));
export const photoSrc = (p: { url?: string; assetId?: string }) => p.url || "";
export const reactionsOf = (S: S) => {
  const r = ev(S)?.reactions;
  return Array.isArray(r) && r.length ? r : DEFAULT_REACTIONS;
};
export function tally(S: S, pid: string) {
  const t: Record<string, number> = {};
  for (const k of S.kudos) if (k.to === pid) t[k.r] = (t[k.r] || 0) + 1;
  return t;
}
export function kudosTotal(S: S, pid: string) {
  const ids = new Set(reactionsOf(S).map((r) => r.id));
  return S.kudos.filter((k) => k.to === pid && ids.has(k.r)).length;
}
export const wonBy = (m: Match, id: string) => !!m.winner && (m.winner === "A" ? m.teamA : m.teamB).includes(id);
export function standings(S: S) {
  const w: Record<string, number> = {}, g: Record<string, number> = {};
  for (const m of done(S)) {
    for (const id of [...m.teamA, ...m.teamB]) g[id] = (g[id] || 0) + 1;
    if (m.winner) for (const id of m.winner === "A" ? m.teamA : m.teamB) w[id] = (w[id] || 0) + 1;
  }
  const order = Object.keys(w).filter((id) => pById(S, id)).sort((a, b) => w[b] - w[a] || g[a] - g[b]);
  return { w, g, order };
}
export const cLabel = (m: Match) => (m.court ? `Court ${m.court}` : "Playoffs");
export const rLabel = (S: S, m: Match) =>
  m.sched ? `${divById(S, m.sched.div)?.level || "Tournament"} · ${m.sched.label}` : m.playoff ? `Playoffs · ${m.playoff.label}` : `Round ${m.round}`;
export function freeCourts(S: S) {
  const t = new Set(live(S).map((m) => m.court)), N = ev(S)?.courts || 0, f: number[] = [];
  for (let c = 1; c <= N; c++) if (!t.has(c)) f.push(c);
  return f;
}
export function eligible(S: S, cat: Cat, lvl: string, inOnly: boolean) {
  return S.players.filter((p) => (!inOnly || p.checkedIn) && (lvl === "any" || p.level === lvl) &&
    (cat === "mens" ? p.gender === "M" : cat === "womens" ? p.gender === "F" : true));
}
export function rankPlayers(S: S, list: Player[]) {
  const { w } = standings(S), g = gamesPlayed(S);
  return [...list].sort((a, b) => (w[b.id] || 0) - (w[a.id] || 0) ||
    ((g[a.id] || 0) - (w[a.id] || 0)) - ((g[b.id] || 0) - (w[b.id] || 0)) || a.name.localeCompare(b.name));
}

/* ---------- playoffs ---------- */
export const PLAN: Record<number, PlanItem[]> = {
  4: [
    { id: "s1", r: "Semifinal", short: "SF1", a: { seed: 1 }, b: { seed: 4 } },
    { id: "s2", r: "Semifinal", short: "SF2", a: { seed: 2 }, b: { seed: 3 } },
    { id: "f", r: "Championship", short: "Final", a: { w: "s1" }, b: { w: "s2" } },
    { id: "b", r: "Battle for bronze", short: "Bronze", a: { l: "s1" }, b: { l: "s2" } },
  ],
  8: [
    { id: "q1", r: "Quarterfinal", short: "QF1", a: { seed: 1 }, b: { seed: 8 } },
    { id: "q2", r: "Quarterfinal", short: "QF2", a: { seed: 4 }, b: { seed: 5 } },
    { id: "q3", r: "Quarterfinal", short: "QF3", a: { seed: 3 }, b: { seed: 6 } },
    { id: "q4", r: "Quarterfinal", short: "QF4", a: { seed: 2 }, b: { seed: 7 } },
    { id: "s1", r: "Semifinal", short: "SF1", a: { w: "q1" }, b: { w: "q2" } },
    { id: "s2", r: "Semifinal", short: "SF2", a: { w: "q3" }, b: { w: "q4" } },
    { id: "f", r: "Championship", short: "Final", a: { w: "s1" }, b: { w: "s2" } },
    { id: "b", r: "Battle for bronze", short: "Bronze", a: { l: "s1" }, b: { l: "s2" } },
  ],
};
export const planOf = (br: Bracket) => br.plan || PLAN[br.size] || PLAN[4];
export const pmOf = (br: Bracket, id: string) => planOf(br).find((x) => x.id === id);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normBr(d: any): Bracket {
  return { ...d, teams: (d.teams || []).map((t: string[] | { a: string; b: string }) => (Array.isArray(t) ? t : [t.a, t.b])), res: d.res || {}, live: d.live || {} };
}
export function bSide(br: Bracket, ref: Ref): number | null {
  if (ref.team != null) return ref.team;
  if (ref.ph) return null;
  if (ref.seed) return ref.seed - 1 < br.teams.length ? ref.seed - 1 : null;
  const src = (ref.w || ref.l)!, r = br.res[src];
  if (!r) return null;
  const m = bMatch(br, src);
  if (m.a == null || m.b == null) return null;
  const win = r.w === "a" ? m.a : m.b, lose = r.w === "a" ? m.b : m.a;
  return ref.w ? win : lose;
}
export type BM = PlanItem & { ra: Ref; rb: Ref; a: number | null; b: number | null; res: Bracket["res"][string] | null; live: Bracket["live"][string] | null };
export function bMatch(br: Bracket, id: string): BM {
  const p = pmOf(br, id)!;
  return { ...p, ra: p.a, rb: p.b, a: bSide(br, p.a), b: bSide(br, p.b), res: br.res[id] || null, live: br.live[id] || null } as BM;
}
export const tName = (S: S, br: Bracket, i: number | null) => (i == null ? "" : br.teams[i].map((id) => first(S, id)).join(" & "));
export const refLabel = (br: Bracket, ref: Ref) => (ref.ph ? ref.ph : `${ref.w ? "Winner" : "Loser"} of ${pmOf(br, (ref.w || ref.l)!)?.short || "?"}`);
export function podium(br: Bracket) {
  if (!pmOf(br, "f")) return null;
  const f = bMatch(br, "f"), b = pmOf(br, "b") ? bMatch(br, "b") : null;
  if (!f.res) return null;
  return { gold: f.res.w === "a" ? f.a : f.b, silver: f.res.w === "a" ? f.b : f.a, bronze: b && b.res ? (b.res.w === "a" ? b.a : b.b) : null };
}
export const downstream = (br: Bracket, id: string) => planOf(br).filter((p) => (p.a.w || p.a.l) === id || (p.b.w || p.b.l) === id).map((p) => p.id);
export const canUndo = (br: Bracket, id: string) => downstream(br, id).every((d) => !br.res[d] && !br.live[d]);
export const myTeamIn = (br: Bracket, pid: string) => br.teams.findIndex((t) => t.includes(pid));
export const brList = (S: S) => [...divBrackets(S), ...[...S.brackets].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))];
export const curBracket = (S: S) => {
  const l = brList(S);
  return l.find((b) => b.id === S.bkId) || l[0] || null;
};

/* ---------- imported schedule ---------- */
export const lvlKey = (l?: string) => (/novice|low/i.test(l || "") ? "low" : "high");
export const divById = (S: S, id?: string) => S.divs.find((d) => d.id === id);
export const divName = (d: Pick<Div, "cat" | "level">) => `${CAT_SHORT[d.cat] || ""} · ${d.level}`;
export const teamById = (d: Div | undefined, id?: string) => d?.teams.find((t) => t.id === id) || null;
export const teamName = (S: S, t: Team | null) => (t ? t.players.map((id) => first(S, id)).join(" & ") : "");
export const keyLabel = (k: string) => (k === "f" ? "Gold" : k === "b" ? "Bronze" : k[0] === "q" ? "QF" + k.slice(1) : "SF" + k.slice(1));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normDiv(d: any): Div {
  return { ...d, pools: d.pools || [], teams: (d.teams || []).map((t: Team) => ({ ...t, players: [t.a!, t.b!] })) };
}
export function poolTable(S: S, d: Div, pool: string | null) {
  const teams = d.teams.filter((t) => pool == null || t.pool === pool);
  const games = S.sched.filter((x) => x.div === d.id && x.stage === "pool" && (pool == null || x.pool === pool));
  const row: Record<string, { t: Team; w: number; l: number; pf: number; pa: number }> = Object.fromEntries(teams.map((t) => [t.id, { t, w: 0, l: 0, pf: 0, pa: 0 }]));
  for (const g of games) {
    if (!g.res) continue;
    const a = row[g.a?.t || ""], b = row[g.b?.t || ""];
    if (!a || !b) continue;
    const aw = g.res.w === "a";
    (aw ? a : b).w++;
    (aw ? b : a).l++;
    if (g.res.sa != null && g.res.sb != null) {
      a.pf += g.res.sa; a.pa += g.res.sb; b.pf += g.res.sb; b.pa += g.res.sa;
    }
  }
  const rows = Object.values(row).sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || teamName(S, x.t).localeCompare(teamName(S, y.t)));
  return { rows, complete: games.length > 0 && games.every((g) => g.res), played: games.filter((g) => g.res).length, total: games.length };
}
export function resolveRef(S: S, d: Div | undefined, ref?: SRef | null): Team | null {
  if (!d || !ref) return null;
  if (ref.t) return teamById(d, ref.t);
  if (ref.pool) {
    const pt = poolTable(S, d, ref.pool);
    return pt.complete ? pt.rows[ref.rank! - 1]?.t || null : null;
  }
  if (ref.rank) {
    const pt = poolTable(S, d, null);
    return pt.complete ? pt.rows[ref.rank - 1]?.t || null : null;
  }
  if (ref.w || ref.l) {
    const x = S.sched.find((s) => s.div === d.id && s.key === (ref.w || ref.l));
    if (!x || !x.res) return null;
    const A = resolveRef(S, d, x.a), B = resolveRef(S, d, x.b);
    if (!A || !B) return null;
    const win = x.res.w === "a" ? A : B, lose = x.res.w === "a" ? B : A;
    return ref.w ? win : lose;
  }
  return null;
}
export function refText(ref?: SRef | null) {
  if (!ref) return "TBD";
  if (ref.pool) return `Pool ${ref.pool} #${ref.rank}`;
  if (ref.rank) return `#${ref.rank} in standings`;
  if (ref.w) return `Winner of ${keyLabel(ref.w)}`;
  if (ref.l) return `Loser of ${keyLabel(ref.l)}`;
  return "TBD";
}
export function schedSides(S: S, x: Sched) {
  const d = divById(S, x.div);
  return { d, A: resolveRef(S, d, x.a), B: resolveRef(S, d, x.b) };
}
export function isMineSched(S: S, x: Sched) {
  const m = me(S);
  if (!m) return false;
  const { A, B } = schedSides(S, x);
  return [A, B].some((t) => t && t.players.includes(m.id));
}
export function divBrackets(S: S): Bracket[] {
  const STG: Record<string, string> = { qf: "Quarterfinal", sf: "Semifinal", gold: "Battle for gold", bronze: "Battle for bronze" };
  return S.divs.map((d) => {
    const ms = S.sched.filter((x) => x.div === d.id && x.stage !== "pool" && x.key);
    if (!ms.some((x) => x.key === "f")) return null;
    const has = (k: string) => ms.some((x) => x.key === k), size = has("q1") ? 8 : has("s1") ? 4 : 2;
    const idx: Record<string, number> = Object.fromEntries(d.teams.map((t, i) => [t.id, i]));
    const toRef = (r: SRef): Ref => {
      if (r.w || r.l) return { w: r.w, l: r.l };
      const t = resolveRef(S, d, r);
      return t ? { team: idx[t.id] } : { ph: refText(r) };
    };
    const plan: PlanItem[] = ms.map((x) => ({ id: x.key!, r: STG[x.stage], short: x.label, a: toRef(x.a), b: toRef(x.b), sid: x.id, time: x.time, court: x.court }));
    const res: Bracket["res"] = {}, lv: Bracket["live"] = {};
    ms.forEach((x) => {
      if (x.res) res[x.key!] = x.res;
      if (x.live) lv[x.key!] = x.live;
    });
    return { id: "div:" + d.id, virtual: true, div: d, name: divName(d), size, plan, teams: d.teams.map((t) => t.players), pools: d.teams.map((t) => t.pool), res, live: lv, createdAt: "~" } as Bracket;
  }).filter((b): b is Bracket => !!b);
}
export function schedLocked(S: S, x: Sched) {
  const later = x.stage === "pool"
    ? S.sched.filter((s) => s.div === x.div && s.stage !== "pool" && (s.res || s.live))
    : S.sched.filter((s) => s.div === x.div && [s.a, s.b].some((r) => r && (r.w === x.key || r.l === x.key)) && (s.res || s.live));
  return later.length > 0;
}
export function qualCount(S: S, d: Div) {
  const ks = S.sched.filter((x) => x.div === d.id).map((x) => x.key);
  return ks.includes("q1") || ks.includes("s1") ? 2 : ks.includes("b") ? 4 : ks.includes("f") ? 2 : 0;
}

/* ---------- paths ---------- */
export const paths = {
  event: (e: string) => `events/${e}`,
  matches: (e: string) => `events/${e}/matches`,
  roster: (e: string) => `roster/${e}/players`,
  checkins: (e: string) => `checkins/${e}/in`,
  gallery: (e: string) => `gallery/${e}/photos`,
  kudos: (e: string) => `kudos/${e}/given`,
  hearts: (e: string) => `photolikes/${e}/h`,
  comments: (e: string) => `photocomments/${e}/c`,
  playoffs: (e: string) => `playoffs/${e}/b`,
  sched: (e: string) => `sched/${e}/m`,
  divs: (e: string) => `sched/${e}/d`,
};
export const checkinLink = (eventId: string) =>
  (typeof location !== "undefined" ? location.origin : "") + "/#in-" + eventId;
