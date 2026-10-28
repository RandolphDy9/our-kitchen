/* Tournament schedule import: parser (pure functions). Reads rows from the admins' Excel
   schedule: a time column plus Court 1, Court 2… columns. */
import type { Cat, SRef } from "./types";

type Cell = string | number | null | undefined;
type DivInfo = { cat: Cat | null; level: string };
type Slot = { start: string; end: string };
type PoolCell = { kind: "pool"; div: DivInfo; pool: string | null; A: string[]; B: string[] };
type PoCell = { kind: "po"; div: DivInfo; stage: "gold" | "bronze" | "sf" | "qf"; qf: number | null; toks: string[]; top: [number, number] | null };
type ParsedCell = PoolCell | PoCell | { kind: "unknown" };

export type ParsedPlayer = { key: string; name: string; gender: "M" | "F" | "" };
export type ParsedTeam = { id: string; players: string[]; pool: string | null; label: string };
export type ParsedDiv = { id: string; cat: Cat; level: string; pools: string[]; teams: ParsedTeam[] };
export type ParsedSched = {
  id: string; div: string; stage: "pool" | "qf" | "sf" | "gold" | "bronze"; key: string | null; pool?: string | null;
  slot: number; time: string; end: string; court: number; a: SRef; b: SRef; label: string;
};
export type Parsed = {
  players: ParsedPlayer[]; divs: ParsedDiv[]; sched: ParsedSched[]; warnings: string[]; courts: number;
  courtNames: Record<number, string>; start: string | null; end: string | null; slots: number;
};

const IMP_SKIP = /open\s*(for\s*)?play|warm\s*-?\s*up|^break$|^lunch$|^reserved$/i;
export const nameKey = (n: unknown) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
export function impTime(v: Cell): Slot | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const t = [...s.matchAll(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/gi)];
  if (!t.length) return null;
  const fix = (m: RegExpMatchArray) => {
    let h = +m[1];
    const ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (!ap && h < 7) h += 12;
    return String(h).padStart(2, "0") + ":" + m[2];
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
function impDiv(t: string): DivInfo {
  const s = " " + String(t || "").replace(/\s+/g, " ") + " ";
  const cat: Cat | null = /wom[ae]n|\bWD\b|ladies|\bWDs?\b/i.test(s) ? "womens" : /mix/i.test(s) ? "mixed" : /\bmen|\bMD\b|\bmens\b/i.test(s) ? "mens" : null;
  const level = /high\s*interm/i.test(s) ? "High Intermediate" : /low\s*interm/i.test(s) ? "Low Intermediate" : /interm/i.test(s) ? "Intermediate"
    : /novice|beginner/i.test(s) ? "Novice" : /advanced/i.test(s) ? "Advanced" : "Open";
  return { cat, level };
}
const impNames = (s: string) => String(s || "").split("/").map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);
function impCell(txt: string): ParsedCell {
  const lines = String(txt).split(/\r?\n+/).map((x) => x.trim()).filter(Boolean);
  const isVs = (l: string) => /\/.*\s+vs\.?\s+.*\//i.test(l);
  const vsLine = [...lines].reverse().find(isVs);
  if (vsLine) {
    const head = lines.filter((l) => l !== vsLine).join(" ");
    const [A, B] = vsLine.split(/\s+vs\.?\s+/i);
    return { kind: "pool", div: impDiv(head || vsLine), pool: ((head.match(/pool\s+([A-H])\b/i) || [])[1] || "").toUpperCase() || null, A: impNames(A), B: impNames(B) };
  }
  const all = lines.join(" ");
  const stage = /gold/i.test(all) ? "gold" : /bronze/i.test(all) ? "bronze" : /\bsemi/i.test(all) ? "sf" : /\bQF\s*\d/i.test(all) ? "qf" : /\bfinal/i.test(all) ? "gold" : null;
  if (!stage) return { kind: "unknown" };
  let qf: number | null = null, body = all;
  if (stage === "qf") {
    const m = all.match(/\bQF\s*(\d)\s*:?/i);
    qf = m ? +m[1] : null;
    body = m ? all.slice(m.index! + m[0].length) : all;
  }
  const toks = [...body.matchAll(/\b(QF\s*\d|[A-H][1-4])\b/gi)].map((m) => m[1].replace(/\s+/g, "").toUpperCase());
  const top = all.match(/top\s*(\d)\s*(?:&|and|,|vs)\s*(\d)/i);
  return { kind: "po", div: impDiv(all), stage, qf, toks, top: top ? [+top[1], +top[2]] : null };
}
export const impFindHeader = (rows: Cell[][]) => rows.findIndex((r) => Array.isArray(r) && r.filter((c) => /court/i.test(String(c ?? ""))).length >= 2);

type PTeam = { key: string; players: string[]; label: string; pool: string | null; count: number; mergedInto?: string };
type PDiv = { key: string; cat: Cat | null; level: string; teams: Map<string, PTeam>; pools: Set<string>; games: { slot: number; time: string; end: string; court: number; pool: string | null; ta: string; tb: string }[]; po: (PoCell & { slot: number; time: string; end: string; court: number })[] };
type PPlayer = { key: string; variants: Record<string, number>; g: { M?: number; F?: number } };

export function parseSchedule(rows: Cell[][]): Parsed {
  const warnings: string[] = [], hi = impFindHeader(rows);
  if (hi < 0) throw new Error("Couldn't find a header row with court columns (like “Court 1”, “Court 2”).");
  const head = rows[hi], cols: { ci: number; court: number }[] = [], courtNames: Record<number, string> = {};
  head.forEach((h, ci) => {
    const m = String(h ?? "").match(/court\s*#?\s*(\d+)/i);
    if (m) {
      cols.push({ ci, court: +m[1] });
      const extra = String(h).replace(/court\s*#?\s*\d+/i, "").trim();
      if (extra) courtNames[+m[1]] = extra;
    }
  });
  let tc = head.findIndex((h) => /time/i.test(String(h ?? "")));
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
      const txt = String(v).trim();
      if (!txt || (IMP_SKIP.test(txt.split(/\n/)[0].trim()) && !/\bvs\b/i.test(txt))) continue;
      const c = impCell(txt), at = { slot, time: tm.start, end: tm.end, court };
      const short = txt.replace(/\s+/g, " ").slice(0, 60);
      if (c.kind === "unknown") { warnings.push(`Skipped ${tm.start} Court ${court}: “${short}”`); continue; }
      if (!c.div.cat) { warnings.push(`Couldn't tell the division for ${tm.start} Court ${court}: “${short}”`); continue; }
      const dv = getDiv(c.div);
      if (c.kind === "pool") {
        if (c.A.length !== 2 || c.B.length !== 2) { warnings.push(`${tm.start} Court ${court}: expected two players per team in “${short}”`); continue; }
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
  const lvlOrder = ["Novice", "Low Intermediate", "Intermediate", "High Intermediate", "Advanced", "Open"];
  const outDivs: ParsedDiv[] = [], outSched: ParsedSched[] = [];
  let di = 0;
  const sorted = [...divs.values()].sort((a, b) => (order[a.cat!] - order[b.cat!]) || (lvlOrder.indexOf(a.level) - lvlOrder.indexOf(b.level)));
  for (const dv of sorted) {
    const id = "d" + (++di);
    const teams = [...dv.teams.values()].map((t, i) => ({ id: id + "t" + (i + 1), key: t.key, players: t.players, pool: t.pool, label: t.label }));
    const tid = (k: string) => teams.find((t) => t.key === k)!.id;
    if (!teams.length) { warnings.push(`${dv.level} ${dv.cat}: playoff games found but no teams, skipped.`); continue; }
    const pools = [...dv.pools].sort();
    outDivs.push({ id, cat: dv.cat!, level: dv.level, pools, teams: teams.map(({ key: _k, ...t }) => t) });
    dv.games.forEach((g, i) => outSched.push({ id: id + "g" + (i + 1), div: id, stage: "pool", key: null, pool: g.pool, slot: g.slot, time: g.time, end: g.end, court: g.court, a: { t: tid(g.ta) }, b: { t: tid(g.tb) }, label: g.pool ? `Pool ${g.pool}` : "Round robin" }));
    const po = dv.po, hasQF = po.some((p) => p.stage === "qf"), sfs = po.filter((p) => p.stage === "sf");
    const pref = (tok: string): SRef => (/^QF/.test(tok) ? { w: "q" + tok.slice(2) } : { pool: tok[0], rank: +tok[1] });
    po.filter((p) => p.stage === "qf").forEach((p) => {
      const k = "q" + (p.qf || 1);
      if (p.toks.length < 2) { warnings.push(`${p.time} Court ${p.court}: couldn't read the quarterfinal matchup.`); return; }
      outSched.push({ id: id + k, div: id, stage: "qf", key: k, slot: p.slot, time: p.time, end: p.end, court: p.court, a: pref(p.toks[0]), b: pref(p.toks[1]), label: "QF" + (p.qf || 1) });
    });
    const sfSorted = [...sfs].sort((x, y) => (x.toks.some((t) => t === "QF1" || t === "A1") ? -1 : 0) - (y.toks.some((t) => t === "QF1" || t === "A1") ? -1 : 0));
    sfSorted.slice(0, 2).forEach((p, i) => {
      const k = "s" + (i + 1);
      if (p.toks.length < 2) { warnings.push(`${p.time} Court ${p.court}: couldn't read the semifinal matchup.`); return; }
      outSched.push({ id: id + k, div: id, stage: "sf", key: k, slot: p.slot, time: p.time, end: p.end, court: p.court, a: pref(p.toks[0]), b: pref(p.toks[1]), label: "SF" + (i + 1) });
    });
    const hasSF = sfSorted.length >= 2;
    po.filter((p) => p.stage === "gold").slice(0, 1).forEach((p) => outSched.push({ id: id + "f", div: id, stage: "gold", key: "f", slot: p.slot, time: p.time, end: p.end, court: p.court,
      a: hasSF ? { w: "s1" } : { rank: p.top ? p.top[0] : 1 }, b: hasSF ? { w: "s2" } : { rank: p.top ? p.top[1] : 2 }, label: "Gold" }));
    po.filter((p) => p.stage === "bronze").slice(0, 1).forEach((p) => outSched.push({ id: id + "b", div: id, stage: "bronze", key: "b", slot: p.slot, time: p.time, end: p.end, court: p.court,
      a: hasSF ? { l: "s1" } : { rank: p.top ? p.top[0] : 3 }, b: hasSF ? { l: "s2" } : { rank: p.top ? p.top[1] : 4 }, label: "Bronze" }));
    if (hasQF && sfs.length < 2) warnings.push(`${dv.level} ${dv.cat}: has quarterfinals but not two semifinals.`);
  }
  const courts = Math.max(0, ...cols.map((c) => c.court));
  return { players: outPlayers, divs: outDivs, sched: outSched, warnings, courts, courtNames, start: slots[0]?.start || null, end: slots.at(-1)?.end || null, slots: slots.length };
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
