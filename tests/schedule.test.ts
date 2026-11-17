/* Schedule import regression tests. Run with `npm test`.
   Each club writes matchups its own way; every format we learn to read gets a test here so the next one
   doesn't break it. fixtures/flex-club-schedule.json is a real club's sheet with the player names replaced. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseSchedule, repairPlayoffs, seedOrder, type Parsed } from "../lib/schedule.ts";
import { sampleRows } from "../lib/sample.ts";

type Rows = (string | null)[][];
const fixture = (name: string): Rows => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const divOf = (p: Parsed, cat: string, level: string) => p.divs.find((d) => d.cat === cat && d.level === level)!;
const grid = (...cells: string[]): Rows => [["Time", ...cells.map((_, i) => `Court ${i + 1}`)], ["10:00 - 10:20", ...cells]];
const hasCheck = (p: Parsed, re: RegExp) => assert.ok(p.checks.some((c) => re.test(c)), `expected a check matching ${re}\n${p.checks.join("\n")}`);

test("club sheet with & / and partners, 'Advance' levels and seeded wildcards imports fully", () => {
  const p = parseSchedule(fixture("flex-club-schedule.json"));
  assert.deepEqual(p.skipped, []);
  assert.deepEqual(p.divs.map((d) => `${d.cat} ${d.level} ${d.teams.length}`), [
    "womens Novice 8", "womens Intermediate 8", "mens Intermediate 16", "mens Advanced 12",
    "mixed Novice 16", "mixed Intermediate 16", "mixed Advanced 8",
  ]);
  for (const d of p.divs) for (const pool of d.pools) assert.equal(d.teams.filter((t) => t.pool === pool).length, 4, `${d.cat} ${d.level} pool ${pool}`);
  assert.equal(p.sched.filter((x) => x.stage === "pool").length, 126);
  assert.equal(p.courts, 9);
  assert.equal(p.courtNames[4], "Championship");
  assert.ok(p.players.every((x) => !/[⁠​]/.test(x.name)), "invisible characters stripped from names");
  // "Mixed Doubles Advance A" (no word "Pool") still means Pool A
  assert.deepEqual(divOf(p, "mixed", "Advanced").pools, ["A", "B"]);
  // Men's Advanced: 3 pools, top 2 each plus 2 wildcards, seeded 1-8
  const qf = p.sched.filter((x) => x.div === divOf(p, "mens", "Advanced").id && x.stage === "qf").sort((a, b) => a.key!.localeCompare(b.key!));
  assert.deepEqual(qf.map((x) => [x.a.seed, x.b.seed, x.a.adv]), [[1, 8, 2], [2, 7, 2], [3, 6, 2], [4, 5, 2]]);
});

test("club sheet: the schedule checks catch the real problems in it", () => {
  const p = parseSchedule(fixture("flex-club-schedule.json"));
  hasCheck(p, /^Risa is on two courts at 16:00/);
  hasCheck(p, /^Mixed Novice: the sheet has no semifinals, so they were added at 18:00/);
  hasCheck(p, /^Men's Advanced: the semifinals now use the quarterfinal winners/);
  hasCheck(p, /^Mixed Advanced: there are no quarterfinals, so the semifinals now use the pool standings/);
  hasCheck(p, /“Lusa\/Cato” looks like two names/);
  hasCheck(p, /“Nene” is in Men's Intermediate and Men's Advanced/);
  hasCheck(p, /“Ioli” and “Ioli C\.” both appear/);
});

test("club sheet: broken playoff cells are repaired into a working bracket", () => {
  const p = parseSchedule(fixture("flex-club-schedule.json"));
  const po = (cat: string, level: string) => Object.fromEntries(p.sched.filter((x) => x.div === divOf(p, cat, level).id && x.key).map((x) => [x.key, [x.a, x.b]]));
  const menAdv = po("mens", "Advanced"), mixNov = po("mixed", "Novice"), mixAdv = po("mixed", "Advanced");
  assert.deepEqual(menAdv.s1, [{ w: "q1" }, { w: "q2" }]);
  assert.deepEqual(menAdv.s2, [{ w: "q3" }, { w: "q4" }]);
  assert.deepEqual(mixNov.s1, [{ w: "q1" }, { w: "q2" }]);
  assert.deepEqual(mixNov.f, [{ w: "s1" }, { w: "s2" }]);
  assert.deepEqual(mixNov.b, [{ l: "s1" }, { l: "s2" }]);
  assert.deepEqual(mixAdv.s1, [{ pool: "A", rank: 1 }, { pool: "B", rank: 2 }]);
  const slot18 = p.sched.filter((x) => x.time === "18:00").map((x) => x.court);
  assert.equal(new Set(slot18).size, slot18.length, "added semifinals take free courts");
});

test("games already played keep their teams", () => {
  const d = { id: "d", cat: "mens" as const, level: "Advanced", pools: ["A", "B"] };
  const g = (key: string, a: object, b: object, res: object | null = null) => ({ id: "d" + key, div: "d", stage: "sf" as const, key, slot: 1, time: "", end: "", court: 1, a, b, label: key, res, live: null });
  const sched = [g("q1", { seed: 1 }, { seed: 8 }), g("q2", { seed: 2 }, { seed: 7 }), g("q3", { seed: 3 }, { seed: 6 }), g("q4", { seed: 4 }, { seed: 5 }),
    g("s1", { pool: "A", rank: 1 }, { pool: "B", rank: 2 }, { w: "a" }), g("s2", { pool: "B", rank: 1 }, { pool: "A", rank: 2 })];
  const r = repairPlayoffs([d], sched);
  assert.deepEqual([r.sched[4].a, r.sched[5].a], [{ pool: "A", rank: 1 }, { w: "q3" }]);
});

test("the demo schedule and the Qsina template import cleanly with no checks", () => {
  const s = parseSchedule(sampleRows());
  assert.equal(s.sched.length, 31);
  assert.deepEqual([s.skipped, s.checks], [[], []]);
  const XLSX = createRequire(import.meta.url)("xlsx");
  const wb = XLSX.readFile(new URL("../public/qsina-schedule-template.xlsx", import.meta.url).pathname);
  const t = parseSchedule(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null, blankrows: false }));
  assert.equal(t.sched.length, 14);
  assert.deepEqual(t.skipped, []);
});

test("pool games written different ways", () => {
  const p = parseSchedule(grid(
    "Ladies Beginner Pool 2\nAna and Bea vs. Cara & Dee",
    "XD 3.5 A\nAl/Ana versus Ben/Bea",
    "Men's Adv: Al & Ben vs Carl & Dan",
    "MD Int Group C\nEd + Finn\nvs\nGus + Hal",
    "Mixed Low Int\nCharlie V & Mia vs Rafa & Lea",
  ));
  assert.deepEqual(p.skipped, []);
  const got = p.sched.map((x) => {
    const d = p.divs.find((d) => d.id === x.div)!, team = (id?: string) => d.teams.find((t) => t.id === id)!.label;
    return `${d.cat}|${d.level}|${x.pool}|${team(x.a.t)}|${team(x.b.t)}`;
  }).sort();
  assert.deepEqual(got, [
    "mens|Advanced|null|Al/Ben|Carl/Dan",
    "mens|Intermediate|C|Ed/Finn|Gus/Hal",
    "mixed|3.5|A|Al/Ana|Ben/Bea",
    "mixed|Low Intermediate|null|Charlie V/Mia|Rafa/Lea",
    "womens|Novice|B|Ana/Bea|Cara/Dee",
  ]);
});

test("playoff cells written different ways", () => {
  const rows: Rows = [["Time", "Court 1", "Court 2", "Court 3"]];
  const add = (...c: string[]) => rows.push([`${10 + rows.length}:00`, ...c]);
  add("MD Int Pool A\nAl/Ben vs Carl/Dan", "MD Int Pool B\nEd/Finn vs Gus/Hal");
  add("Quarterfinal 1: Pool A #1 vs Pool B #2 - Men's Int", "QF 2: B1 vs A2 Men's Int");
  add("SF1 Winner of QF1 vs Winner of QF2 Men's Int");
  add("Championship - Men's Int", "3rd place match Men's Int");
  const p = parseSchedule(rows);
  assert.deepEqual(p.skipped, []);
  const po = Object.fromEntries(p.sched.filter((x) => x.stage !== "pool").map((x) => [x.key, [x.a, x.b]]));
  assert.deepEqual(po, {
    q1: [{ pool: "A", rank: 1 }, { pool: "B", rank: 2 }],
    q2: [{ pool: "B", rank: 1 }, { pool: "A", rank: 2 }],
    s1: [{ w: "q1" }, { w: "q2" }],
    f: [{ rank: 1 }, { rank: 2 }],
    b: [{ rank: 3 }, { rank: 4 }],
  });
  hasCheck(p, /has 2 quarterfinals instead of 4/);
});

test("times with am/pm and without minutes", () => {
  const p = parseSchedule([["Time", "Ct 1", "Ct 2"], ["10am - 10:20am", "WD Nov\nAna & Bea vs Cara & Dee"], ["1:00 PM", "WD Nov\nAna & Bea vs Eve & Fay"]]);
  assert.deepEqual(p.sched.map((x) => [x.time, x.end]), [["10:00", "10:20"], ["13:00", "13:15"]]);
});

test("seedOrder puts every pool's qualifiers ahead of the wildcards", () => {
  // higher number = better record
  const order = seedOrder([[9, 5, 4, 1], [8, 7, 6, 2], [3, 2, 1, 0]], 2, (a, b) => b - a);
  assert.deepEqual(order.slice(0, 8), [9, 8, 7, 5, 3, 2, 6, 4]);
});
