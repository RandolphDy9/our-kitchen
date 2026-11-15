/* Tournament schedule import: parser (pure functions). Reads rows from the admins' Excel
   schedule: a time column plus Court 1, Court 2… columns. Clubs write matchups their own way
   ("Ana/Bea vs Cara/Dee", "Ana & Bea VS Cara and Dee", "WD Nov A", "QF1: Top 1 vs Top 8"…), so the
   reader is generous about wording and then checks the schedule itself (missing games, players on
   two courts at once, playoffs that can't be filled in) so the organizer sees problems before game day. */
import type { Cat, SRef } from "./types";

type Cell = string | number | null | undefined;
type DivInfo = { cat: Cat | null; level: string };
type Slot = { start: string; end: string };
type PoolCell = { kind: "pool"; div: DivInfo; pool: string | null; A: string[]; B: string[] };
type PoCell = { kind: "po"; div: DivInfo; stage: "gold" | "bronze" | "sf" | "qf"; num: number | null; toks: string[]; top: [number, number] | null };
type ParsedCell = PoolCell | PoCell | { kind: "unknown" };

export type ParsedPlayer = { key: string; name: string; gender: "M" | "F" | "" };
export type ParsedTeam = { id: string; players: string[]; pool: string | null; label: string };
export type ParsedDiv = { id: string; cat: Cat; level: string; pools: string[]; teams: ParsedTeam[] };
export type ParsedSched = {
  id: string; div: string; stage: "pool" | "qf" | "sf" | "gold" | "bronze"; key: string | null; pool?: string | null;
  slot: number; time: string; end: string; court: number; a: SRef; b: SRef; label: string;
};
export type Parsed = {
  /** skipped: games in the file that won't be imported. checks: problems in the schedule itself worth fixing
      before game day. warnings: smaller notes about how the file was read. */
  players: ParsedPlayer[]; divs: ParsedDiv[]; sched: ParsedSched[]; skipped: string[]; checks: string[]; warnings: string[]; courts: number;
  courtNames: Record<number, string>; start: string | null; end: string | null; slots: number;
};

/* ---------- text clean-up ---------- */
const INVISIBLE = /[​-‍⁠﻿­]/g;
/** Strips invisible characters (word joiners pasted from chat apps), curly quotes and odd spaces. */
export const clean = (v: unknown) => String(v ?? "").replace(INVISIBLE, "").replace(/[   ]/g, " ").replace(/[‘’`]/g, "'");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const IMP_SKIP = /open\s*(for\s*)?play|warm\s*-?\s*up|^break$|^lunch(\s*break)?$|^reserved$|^tbd$|^-+$/i;
export const nameKey = (n: unknown) => clean(n).toLowerCase().replace(/[^a-z0-9]/g, "");
function lev(a: string, b: string) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[n];
}

/* ---------- times ---------- */
export function impTime(v: Cell): Slot | null {
  const s = clean(v).trim();
  if (!s) return null;
  // "10:00", "10.00", "10:00 AM", "10am", "10 a.m."
  const t = [...s.matchAll(/(\d{1,2})(?:[:.](\d{2})\s*(?:([ap])\.?\s*m\b\.?)?|\s*([ap])\.?\s*m\b\.?)/gi)];
  if (!t.length) return null;
  const fix = (m: RegExpMatchArray) => {
    let h = +m[1];
    const ap = (m[3] || m[4] || "").toLowerCase();
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (!ap && h < 7) h += 12;
    return String(h).padStart(2, "0") + ":" + (m[2] || "00");
  };
  const start = fix(t[0]);
  let end = t[1] ? fix(t[1]) : null;
  if (!end) {
    const [h, mi] = start.split(":").map(Number);
    const d = h * 60 + mi + 15;
    end = String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0");
  }
  return { start, end };
}

/* ---------- divisions and pools ---------- */
const LEVEL_ORDER = ["Novice", "Low Intermediate", "Intermediate", "High Intermediate", "Advanced", "Open"];
/** Sort order for division levels: Novice first, Advanced last, then ratings like 3.5 by number. */
export const levelRank = (l: string) => {
  const i = LEVEL_ORDER.indexOf(l);
  return i >= 0 ? i : 10 + (parseFloat(l) || 0);
};
export function impDiv(t: string): DivInfo {
  const s = " " + squash(clean(t)) + " ";
  const cat: Cat | null = /wom[ae]n|ladies|girls|\bW\s?Ds?\b/i.test(s) ? "womens"
    : /mix|\bX\s?Ds?\b|\bMXD?\b/i.test(s) ? "mixed"
      : /\bm[ae]n\b|\bmens\b|\bmen's\b|\bgents\b|\bboys\b|\bM\s?Ds?\b/i.test(s) ? "mens" : null;
  const rating = s.match(/(?:^|[^\d.])([1-5][.,]\d{1,2})(?:\s*(?:-|–|to)\s*([1-5][.,]\d{1,2}))?\s*(\+)?/);
  const level = /high(?:er)?\s*-?\s*int|upper\s*-?\s*int/i.test(s) ? "High Intermediate"
    : /low(?:er)?\s*-?\s*int/i.test(s) ? "Low Intermediate"
      : /interm|\bint\b|\binter\b/i.test(s) ? "Intermediate"
        : /novice|beginner|\bbeg\b|\bnov\b/i.test(s) ? "Novice"
          : /advance|\badv\b|expert/i.test(s) ? "Advanced"
            : rating ? rating[1].replace(",", ".") + (rating[2] ? "–" + rating[2].replace(",", ".") : "") + (rating[3] || "")
              : "Open";
  return { cat, level };
}
/** "Pool A", "Group B", "Grp C", "Flight D", "Pool 2" (→ B), or a trailing letter after the level ("Advance A"). */
export function impPool(head: string): string | null {
  const s = squash(clean(head));
  const m = s.match(/\b(?:pool|group|grp|flight)\s*#?\s*([A-H]|[1-8])\b/i);
  if (m) return /\d/.test(m[1]) ? "ABCDEFGH"[+m[1] - 1] : m[1].toUpperCase();
  const t = s.match(/\b(?:advanced?|adv|novice|nov|beg(?:inner)?|interm\w*|int|open|[1-5][.,]\d{1,2}\+?)\s*[-–:]?\s*([A-H])\s*$/i);
  return t && t[1] === t[1].toUpperCase() ? t[1] : null;
}

/* ---------- teams ---------- */
/** Two partners joined by &, +, "and", / or a comma. "&" wins over "/", so "Keen/Kevin & Lyka" keeps "Keen/Kevin" together. */
export function splitTeam(s: string): string[] | null {
  const t = squash(s).replace(/^[-–:,.\s]+|[-–:,\s]+$/g, "");
  if (!t) return null;
  for (const sep of [/\s*&\s*/, /\s*\+\s*/, /\s+and\s+/i, /\s*\/\s*/, /\s*,\s*/]) {
    const parts = t.split(sep).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 2) return parts;
  }
  return null;
}
/** A playoff placeholder rather than a team: A1, Pool B #2, QF3, Seed 4, Top 1, Winner of SF1. */
const isPlace = (s: string) => /^(?:pool\s*)?[A-H]\s*#?\s*[1-8]\b|^(?:QF|SF)\s*\d|^(?:seed|top|winner|loser|wildcard)\b|^W\s?\d\b/i.test(squash(s));
function vsSides(line: string): [string, string] | null {
  for (const re of [/\s+(?:vs\.?|versus)\s+/i, /\s+v\.?\s+/i]) {
    const p = line.split(re);
    if (p.length === 2) return [p[0], p[1]];
  }
  return null;
}

/* ---------- cells ---------- */
function impCell(txt: string): ParsedCell {
  const lines = clean(txt).split(/\r?\n+/).map(squash).filter(Boolean);
  // "Ana & Bea" / "vs" / "Cara & Dee" on three lines
  for (let i = 1; i < lines.length - 1; i++) if (/^(?:vs\.?|versus|v\.?)$/i.test(lines[i])) lines.splice(i - 1, 3, `${lines[i - 1]} vs ${lines[i + 1]}`);
  for (let i = lines.length - 1; i >= 0; i--) {
    const sides = vsSides(lines[i]);
    if (!sides) continue;
    let [L, R] = sides, head = lines.filter((_, j) => j !== i).join(" ");
    // one-line form: "WD Novice Pool A: Ana & Bea vs Cara & Dee"
    const k = L.lastIndexOf(":");
    if (k > 0) {
      head = squash(head + " " + L.slice(0, k));
      L = L.slice(k + 1);
    }
    if (isPlace(L) || isPlace(R)) break;
    const A = splitTeam(L), B = splitTeam(R);
    if (A && B) return { kind: "pool", div: impDiv(head), pool: impPool(head), A, B };
  }
  const all = lines.join(" ");
  const stageOf = (): [PoCell["stage"], RegExp] | null => {
    if (/bronze|3rd\s*place|third\s*place/i.test(all)) return ["bronze", /battle\s*for\s*bronze|bronze(\s*medal)?(\s*match)?|3rd\s*place(\s*match)?|third\s*place(\s*match)?/i];
    if (/gold|championship/i.test(all)) return ["gold", /battle\s*for\s*gold|gold(\s*medal)?(\s*match)?|championship(\s*final)?(\s*match)?/i];
    if (/\bsemi|\bSF\s*\d?\b/i.test(all)) return ["sf", /\b(?:SF|semi\s*-?\s*finals?|semis?)\s*#?\s*(\d)?\s*:?/i];
    if (/\bQF\s*\d|\bquarter/i.test(all)) return ["qf", /\b(?:QF|quarter\s*-?\s*finals?|quarters?)\s*#?\s*(\d)?\s*:?/i];
    if (/\bfinals?\b|^F\s*:/i.test(all)) return ["gold", /\bfinals?\b|^F\s*:/i];
    return null;
  };
  const st = stageOf();
  if (!st) return { kind: "unknown" };
  const [stage, label] = st, lm = all.match(label);
  const num = lm && lm[1] && (stage === "qf" || stage === "sf") ? +lm[1] : null;
  const body = lm ? all.slice(0, lm.index) + " " + all.slice(lm.index! + lm[0].length) : all;
  const toks = [...body.matchAll(/\b(?:winner\s*(?:of\s*)?)?(QF\s*\d|[A-H]\s?#\s?[1-8]|[A-H][1-8]|(?:seed|top)\s*#?\s*\d{1,2})\b/gi)].map((m) => {
    const x = m[1].replace(/[\s#]+/g, "").toUpperCase();
    return /^(SEED|TOP)/.test(x) ? "SEED" + x.replace(/\D/g, "") : x;
  });
  const top = all.match(/top\s*(\d)\s*(?:&|and|,|vs)\s*(\d)/i);
  const stripped = body.replace(/\b(?:winner\s*(?:of\s*)?)?(?:QF\s*\d|[A-H]\s?#\s?[1-8]|[A-H][1-8]|(?:seed|top)\s*#?\s*\d{1,2})\b/gi, " ");
  return { kind: "po", div: impDiv(stripped), stage, num, toks, top: stage === "gold" || stage === "bronze" ? (top ? [+top[1], +top[2]] : null) : null };
}
const COURT_RE = /\b(?:court|ct|crt)\.?\s*#?\s*(\d+)/i;
export const impFindHeader = (rows: Cell[][]) => rows.findIndex((r) => Array.isArray(r) && r.filter((c) => COURT_RE.test(clean(c))).length >= 2);

/** Playoff seeding across pools: the top `adv` of each pool are seeded first (best record first), then everyone
    else as wildcards. Pools are already sorted best-first. With no pools, it's just the standings order. */
export function seedOrder<R>(pools: R[][], adv: number, cmp: (a: R, b: R) => number): R[] {
  if (pools.length <= 1) return [...(pools[0] || [])];
  const auto = pools.flatMap((p) => p.slice(0, adv)), rest = pools.flatMap((p) => p.slice(adv));
  return [...auto.sort(cmp), ...rest.sort(cmp)];
}

type PTeam = { key: string; players: string[]; label: string; pool: string | null; count: number; mergedInto?: string };
type PGame = { slot: number; time: string; end: string; court: number; pool: string | null; ta: string; tb: string };
type PDiv = { key: string; cat: Cat | null; level: string; teams: Map<string, PTeam>; pools: Set<string>; games: PGame[]; po: (PoCell & { slot: number; time: string; end: string; court: number })[] };
type PPlayer = { key: string; variants: Record<string, number>; g: { M?: number; F?: number } };

export function parseSchedule(rows: Cell[][]): Parsed {
  const skipped: string[] = [], warnings: string[] = [], checks: string[] = [], hi = impFindHeader(rows);
  if (hi < 0) throw new Error("Couldn't find a header row with court columns (like “Court 1”, “Court 2”).");
  const head = rows[hi], cols: { ci: number; court: number }[] = [], courtNames: Record<number, string> = {};
  head.forEach((h, ci) => {
    const m = clean(h).match(COURT_RE);
    if (m) {
      cols.push({ ci, court: +m[1] });
      const extra = squash(clean(h).replace(COURT_RE, ""));
      if (extra) courtNames[+m[1]] = extra;
    }
  });
  let tc = head.findIndex((h) => /time/i.test(clean(h)));
  if (tc < 0) tc = 0;
  const divs = new Map<string, PDiv>(), players = new Map<string, PPlayer>(), slots: Slot[] = [];
  const getDiv = (d: DivInfo) => {
    const key = (d.cat || "?") + "|" + d.level;
    if (!divs.has(key)) divs.set(key, { key, cat: d.cat, level: d.level, teams: new Map(), pools: new Set(), games: [], po: [] });
    return divs.get(key)!;
  };
  const addPlayer = (n: string) => {
    const k = nameKey(n);
    if (!k) return null;
    if (!players.has(k)) players.set(k, { key: k, variants: {}, g: {} });
    const p = players.get(k)!;
    p.variants[n] = (p.variants[n] || 0) + 1;
    return k;
  };
  const addTeam = (dv: PDiv, names: string[], pool: string | null) => {
    const ks = names.map(addPlayer).filter((k): k is string => !!k);
    const key = [...ks].sort().join("+");
    if (!dv.teams.has(key)) dv.teams.set(key, { key, players: ks, label: names.join("/"), pool: pool || null, count: 0 });
    const t = dv.teams.get(key)!;
    t.count++;
    if (pool && !t.pool) t.pool = pool;
    return key;
  };
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const tm = impTime(row[tc]);
    if (!tm) continue;
    const slot = slots.length;
    slots.push(tm);
    for (const { ci, court } of cols) {
      const v = row[ci];
      if (v == null) continue;
      const txt = clean(v).trim();
      if (!txt || (IMP_SKIP.test(squash(txt.split(/\n/)[0])) && !/\bvs?\b/i.test(txt))) continue;
      const c = impCell(txt), at = { slot, time: tm.start, end: tm.end, court };
      const short = squash(txt).slice(0, 60);
      if (c.kind === "unknown") { skipped.push(`${tm.start} Court ${court}: couldn't read “${short}”`); continue; }
      if (!c.div.cat) { skipped.push(`${tm.start} Court ${court}: couldn't tell the division of “${short}”`); continue; }
      const dv = getDiv(c.div);
      if (c.kind === "pool") {
        if (c.pool) dv.pools.add(c.pool);
        dv.games.push({ ...at, pool: c.pool, ta: addTeam(dv, c.A, c.pool), tb: addTeam(dv, c.B, c.pool) });
      } else dv.po.push({ ...at, ...c });
    }
  }
  // merge near-duplicate teams (typos like "Rickys/Victor")
  for (const dv of divs.values()) {
    const list = [...dv.teams.values()].sort((a, b) => b.count - a.count);
    for (const t of [...list].reverse()) {
      const m = list.find((o) => o !== t && !o.mergedInto && o.count >= t.count && (o.pool === t.pool || !o.pool || !t.pool) &&
        t.players.some((k) => o.players.includes(k)) && (() => {
          const a = t.players.find((k) => !o.players.includes(k)), b = o.players.find((k) => !t.players.includes(k));
          return !!a && !!b && lev(a, b) <= 2;
        })());
      if (m && !t.mergedInto) {
        t.mergedInto = m.key;
        warnings.push(`Treated “${t.label}” as “${m.label}” (${dv.level} ${dv.cat}) — looks like a typo.`);
      }
    }
    const fin = (k: string) => {
      let t = dv.teams.get(k)!;
      while (t.mergedInto) t = dv.teams.get(t.mergedInto)!;
      return t.key;
    };
    dv.games.forEach((g) => { g.ta = fin(g.ta); g.tb = fin(g.tb); });
    for (const t of [...dv.teams.values()]) if (t.mergedInto) dv.teams.delete(t.key);
  }
  // genders
  const gOf = (p: PPlayer) => (p.g.M && !p.g.F ? "M" : p.g.F && !p.g.M ? "F" : null);
  for (const dv of divs.values()) for (const t of dv.teams.values()) for (const k of t.players) {
    const p = players.get(k)!;
    if (dv.cat === "womens") p.g.F = 1;
    if (dv.cat === "mens") p.g.M = 1;
  }
  for (let pass = 0; pass < 3; pass++) for (const dv of divs.values()) if (dv.cat === "mixed") for (const t of dv.teams.values()) {
    const [a, b] = t.players.map((k) => players.get(k)!);
    if (!a || !b) continue;
    const ga = gOf(a), gb = gOf(b);
    if (ga && !gb) b.g[ga === "M" ? "F" : "M"] = 1;
    if (gb && !ga) a.g[gb === "M" ? "F" : "M"] = 1;
  }
  const usedKeys = new Set<string>();
  for (const dv of divs.values()) for (const t of dv.teams.values()) t.players.forEach((k) => usedKeys.add(k));
  const outPlayers: ParsedPlayer[] = [...players.values()].filter((p) => usedKeys.has(p.key)).map((p) => {
    const name = Object.entries(p.variants).sort((a, b) => b[1] - a[1])[0][0];
    if (p.g.M && p.g.F) warnings.push(`“${name}” plays in both men's and women's divisions. Check if these are two different people.`);
    return { key: p.key, name, gender: gOf(p) || "" };
  });
  // divisions + playoffs
  const order: Record<string, number> = { womens: 0, mens: 1, mixed: 2 };
  const outDivs: ParsedDiv[] = [], outSched: ParsedSched[] = [];
  let di = 0;
  const sorted = [...divs.values()].sort((a, b) => (order[a.cat!] - order[b.cat!]) || (levelRank(a.level) - levelRank(b.level)));
  for (const dv of sorted) {
    const id = "d" + (++di), dn = divLabel(dv);
    const teams = [...dv.teams.values()].map((t, i) => ({ id: id + "t" + (i + 1), key: t.key, players: t.players, pool: t.pool, label: t.label }));
    const tid = (k: string) => teams.find((t) => t.key === k)!.id;
    if (!teams.length) { skipped.push(`${dn}: playoff games but no teams in this division`); continue; }
    const pools = [...dv.pools].sort();
    outDivs.push({ id, cat: dv.cat!, level: dv.level, pools, teams: teams.map(({ key: _k, ...t }) => t) });
    dv.games.forEach((g, i) => outSched.push({ id: id + "g" + (i + 1), div: id, stage: "pool", key: null, pool: g.pool, slot: g.slot, time: g.time, end: g.end, court: g.court, a: { t: tid(g.ta) }, b: { t: tid(g.tb) }, label: g.pool ? `Pool ${g.pool}` : "Round robin" }));
    const po = dv.po, sfs = po.filter((p) => p.stage === "sf");
    const maxSeed = Math.max(0, ...po.flatMap((p) => p.toks.filter((t) => t.startsWith("SEED")).map((t) => +t.slice(4))));
    const adv = pools.length > 1 ? Math.max(1, Math.floor(maxSeed / pools.length)) : maxSeed;
    const pref = (tok: string): SRef => (tok.startsWith("QF") ? { w: "q" + tok.slice(2) } : tok.startsWith("SEED") ? { seed: +tok.slice(4), adv } : { pool: tok[0], rank: +tok.slice(1) });
    const used = new Set<string>();
    const push = (p: (typeof po)[number], key: string, stage: ParsedSched["stage"], a: SRef, b: SRef, label: string) => {
      if (used.has(key)) { skipped.push(`${p.time} Court ${p.court}: a second ${label} for ${dn}`); return; }
      used.add(key);
      outSched.push({ id: id + key, div: id, stage, key, slot: p.slot, time: p.time, end: p.end, court: p.court, a, b, label });
    };
    const qfs = po.filter((p) => p.stage === "qf");
    let nextQ = 1;
    const qNum = (n: number | null) => { if (n) return n; while (qfs.some((q) => q.num === nextQ) || used.has("q" + nextQ)) nextQ++; return nextQ++; };
    qfs.sort((x, y) => (x.num || 9) - (y.num || 9)).forEach((p) => {
      const n = qNum(p.num);
      if (p.toks.length < 2) { skipped.push(`${p.time} Court ${p.court}: couldn't read the quarterfinal matchup`); return; }
      push(p, "q" + n, "qf", pref(p.toks[0]), pref(p.toks[1]), "QF" + n);
    });
    const firstish = (p: (typeof po)[number]) => (p.num ? p.num : p.toks.some((t) => t === "QF1" || t === "A1" || t === "SEED1") ? 1 : 2);
    const sfSorted = [...sfs].sort((x, y) => firstish(x) - firstish(y));
    sfSorted.slice(0, 2).forEach((p, i) => {
      const k = "s" + (i + 1);
      if (p.toks.length < 2) { skipped.push(`${p.time} Court ${p.court}: couldn't read the semifinal matchup`); return; }
      push(p, k, "sf", pref(p.toks[0]), pref(p.toks[1]), "SF" + (i + 1));
    });
    sfSorted.slice(2).forEach((p) => skipped.push(`${p.time} Court ${p.court}: a third semifinal for ${dn}`));
    const hasSF = sfSorted.length >= 2;
    po.filter((p) => p.stage === "gold").forEach((p) => push(p, "f", "gold",
      hasSF ? { w: "s1" } : { rank: p.top ? p.top[0] : 1 }, hasSF ? { w: "s2" } : { rank: p.top ? p.top[1] : 2 }, "Gold"));
    po.filter((p) => p.stage === "bronze").forEach((p) => push(p, "b", "bronze",
      hasSF ? { l: "s1" } : { rank: p.top ? p.top[0] : 3 }, hasSF ? { l: "s2" } : { rank: p.top ? p.top[1] : 4 }, "Bronze"));
  }
  checkSchedule(outDivs, outSched, outPlayers, checks);
  const courts = Math.max(0, ...cols.map((c) => c.court));
  return { players: outPlayers, divs: outDivs, sched: outSched, skipped, checks, warnings, courts, courtNames, start: slots[0]?.start || null, end: slots.at(-1)?.end || null, slots: slots.length };
}

const CAT_NAME: Record<string, string> = { mens: "Men's", womens: "Women's", mixed: "Mixed" };
const divLabel = (d: { cat: Cat | null; level: string }) => `${CAT_NAME[d.cat || ""] || "?"} ${d.level}`;
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : xs.slice(0, -1).join(", ") + " and " + xs.at(-1));

/** Looks for problems in the schedule itself. Each line says what's wrong in the club's own terms. */
function checkSchedule(divs: ParsedDiv[], sched: ParsedSched[], players: ParsedPlayer[], out: string[]) {
  const pname = Object.fromEntries(players.map((p) => [p.key, p.name]));
  const tLabel = (t: ParsedTeam) => t.players.map((k) => pname[k]).join(" & ");
  for (const d of divs) {
    const dn = divLabel(d), games = sched.filter((x) => x.div === d.id), poolGames = games.filter((x) => x.stage === "pool");
    // pools: every team should meet every other team once
    for (const pool of d.pools.length ? d.pools : [null]) {
      const ts = d.teams.filter((t) => pool == null || t.pool === pool), pn = pool ? `${dn} Pool ${pool}` : dn;
      const gs = poolGames.filter((x) => pool == null || x.pool === pool);
      const met = new Map<string, number>();
      gs.forEach((g) => { const k = [g.a.t, g.b.t].sort().join("|"); met.set(k, (met.get(k) || 0) + 1); });
      const missing: string[] = [];
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) if (!met.get([ts[i].id, ts[j].id].sort().join("|"))) missing.push(`${tLabel(ts[i])} vs ${tLabel(ts[j])}`);
      const twice = [...met].filter(([, n]) => n > 1).map(([k]) => k.split("|").map((id) => tLabel(d.teams.find((t) => t.id === id)!)).join(" vs "));
      if (missing.length && missing.length <= 3) out.push(`${pn}: ${list(missing)} ${missing.length === 1 ? "isn't" : "aren't"} on the schedule.`);
      else if (missing.length) {
        const n = (t: ParsedTeam) => gs.filter((g) => g.a.t === t.id || g.b.t === t.id).length, counts = new Set(ts.map(n));
        if (counts.size > 1) out.push(`${pn}: teams don't play the same number of games (${ts.map((t) => `${tLabel(t)} ${n(t)}`).join(", ")}).`);
      }
      if (twice.length) out.push(`${pn}: ${list(twice)} ${twice.length === 1 ? "is" : "are"} on the schedule twice.`);
    }
    // playoffs
    const has = (k: string) => games.some((x) => x.key === k);
    const qfs = games.filter((x) => x.stage === "qf"), sfs = games.filter((x) => x.stage === "sf");
    if (qfs.length && qfs.length !== 4) out.push(`${dn}: has ${qfs.length} quarterfinal${qfs.length === 1 ? "" : "s"} instead of 4.`);
    if (qfs.length && !sfs.length && (has("f") || has("b"))) out.push(`${dn}: has quarterfinals and a final but no semifinals, so the final can't be filled in. Add the two semifinals.`);
    else if (qfs.length && sfs.length === 1) out.push(`${dn}: has quarterfinals but only one semifinal.`);
    if ((qfs.length || sfs.length) && !has("f")) out.push(`${dn}: has playoff games but no Battle for Gold.`);
    if (qfs.length && sfs.some((x) => x.a.pool || x.b.pool || x.a.seed || x.b.seed)) out.push(`${dn}: has quarterfinals, but its semifinals use pool places or seeds instead of quarterfinal winners. Check the semifinal cells.`);
    const lastPool = Math.max(-1, ...poolGames.map((x) => x.slot));
    for (const x of games.filter((g) => g.stage !== "pool")) {
      for (const r of [x.a, x.b]) {
        if (r.pool && !d.pools.includes(r.pool)) out.push(`${dn} ${x.label}: refers to Pool ${r.pool}, but there's no Pool ${r.pool} in this division.`);
        else if (r.pool && r.rank! > d.teams.filter((t) => t.pool === r.pool).length) out.push(`${dn} ${x.label}: refers to ${r.pool}${r.rank}, but Pool ${r.pool} doesn't have ${r.rank} teams.`);
        if (r.seed && r.seed > d.teams.length) out.push(`${dn} ${x.label}: refers to seed ${r.seed}, but there are only ${d.teams.length} teams.`);
        const src = r.w || r.l;
        const sg = src && games.find((g) => g.key === src);
        if (sg && sg.slot >= x.slot) out.push(`${dn} ${x.label} at ${x.time} starts before ${sg.label} (${sg.time}) is over.`);
      }
      const gone = [x.a, x.b].map((r) => r.w || r.l).filter((k): k is string => !!k && !has(k)).map((k) => k.toUpperCase().replace(/^Q/, "QF").replace(/^S/, "SF"));
      if (gone.length) out.push(`${dn} ${x.label}: uses the winners of ${list(gone)}, but ${gone.length === 1 ? "that game isn't" : "those games aren't"} in this division.`);
      if ((x.a.pool || x.a.seed || x.a.rank) && x.slot <= lastPool)
        out.push(`${dn} ${x.label} at ${x.time} starts before pool play ends (last pool game at ${poolGames.find((g) => g.slot === lastPool)!.time}).`);
    }
    const seeds = [...qfs, ...sfs].flatMap((x) => [x.a.seed, x.b.seed]).filter((s): s is number => !!s);
    if (seeds.length && new Set(seeds).size !== seeds.length) out.push(`${dn}: the same seed is used in two playoff games.`);
  }
  // one player on two courts at the same time (pool play; playoff teams aren't known yet)
  const teamPlayers = new Map(divs.flatMap((d) => d.teams.map((t) => [t.id, { d, players: t.players }] as const)));
  const at = new Map<string, { court: number; dn: string }[]>();
  for (const x of sched) if (x.stage === "pool") for (const tid of [x.a.t!, x.b.t!]) {
    const tp = teamPlayers.get(tid)!;
    for (const k of tp.players) {
      const key = x.time + "|" + k;
      if (!at.has(key)) at.set(key, []);
      at.get(key)!.push({ court: x.court, dn: divLabel(tp.d) });
    }
  }
  const clash = new Map<string, { time: string; at: { court: number; dn: string }[] }[]>();
  for (const [key, v] of at) if (v.length > 1) {
    const [time, k] = key.split("|");
    clash.set(k, [...(clash.get(k) || []), { time, at: v }]);
  }
  for (const [k, cs] of clash) out.push(cs.length === 1
    ? `${pname[k]} is on two courts at ${cs[0].time}: ${list(cs[0].at.map((c) => `Court ${c.court} (${c.dn})`))}. Two people with the same name, or a clash?`
    : `${pname[k]} is on two courts at once at ${list(cs.map((c) => c.time))} (${list([...new Set(cs.flatMap((c) => c.at.map((x) => x.dn)))])}). Two people with the same name, or a clash?`);
  // names that might be the same person, or two people under one name
  const divsOf = new Map<string, ParsedDiv[]>();
  for (const d of divs) for (const t of d.teams) for (const k of t.players) divsOf.set(k, [...(divsOf.get(k) || []), d]);
  for (const p of players) {
    const ds = divsOf.get(p.key) || [];
    for (const cat of ["mens", "womens", "mixed"] as Cat[]) {
      const same = ds.filter((d) => d.cat === cat);
      if (same.length > 1) out.push(`“${p.name}” is in ${list(same.map(divLabel))}. Same person in both, or two people with the same name?`);
    }
    if (/\//.test(p.name)) out.push(`“${p.name}” looks like two names. Is one of them a substitute? Use the name of the person playing.`);
  }
  const firstOnly = new Map(players.filter((p) => !/\s/.test(p.name)).map((p) => [p.name.toLowerCase(), p]));
  for (const p of players) {
    const m = p.name.match(/^(\S+)\s+([A-Z]\.?\s*){1,2}$/);
    const short = m && firstOnly.get(m[1].toLowerCase());
    if (short) out.push(`“${short.name}” and “${p.name}” both appear. The same person written two ways, or two people?`);
  }
}

/** Reads an .xlsx/.xls/.csv file and parses the first sheet that has court columns. */
export async function readScheduleFile(file: File): Promise<Parsed> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  let rows: Cell[][] | null = null;
  for (const n of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, raw: false, defval: null, blankrows: false });
    if (impFindHeader(r) >= 0) { rows = r; break; }
  }
  if (!rows) throw new Error("Couldn't find a sheet with court columns (like “Court 1”, “Court 2”).");
  const p = parseSchedule(rows);
  if (!p.sched.length) throw new Error("No games found in this file.");
  return p;
}
