/* Builds spreadsheet-shaped rows for a small sample tournament so the import flow can be
   tried without an Excel file. Same cell format admins use: "Division - Pool A\nA/B vs C/D". */
const MEN = ["Marco Reyes", "Paolo Dizon", "Jun Tan", "Carlo Mendoza", "Rico Santos", "Ben Aquino", "Nico Villanueva", "Leo Garcia",
  "Miguel Flores", "Tony Cruz", "Dan Bautista", "Ramon Lim", "Jojo Pascual", "Andre Kho", "Vince Ocampo", "Gab Herrera"];
const WOMEN = ["Joy Santos", "Ana Lopez", "Bea Manalo", "Cris Ramos", "Liza Torres", "Mae Dela Cruz", "Pia Gomez", "Rose Valdez"];

type Game = { head: string; a: string; b: string };
const rr = <T,>(teams: T[]) => {
  const out: [T, T][] = [];
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) out.push([teams[i], teams[j]]);
  return out;
};

export function sampleRows(): (string | null)[][] {
  const mixed = WOMEN.map((w, i) => `${MEN[i].split(" ")[0]}/${w.split(" ")[0]}`);
  const mens = [0, 1, 2, 3].map((i) => `${MEN[8 + i * 2].split(" ")[0]}/${MEN[9 + i * 2].split(" ")[0]}`);
  const womens = [0, 2, 4, 6].map((i) => `${WOMEN[i].split(" ")[0]}/${WOMEN[i + 1].split(" ")[0]}`);
  const games: Game[] = [
    ...rr(womens).map(([a, b]) => ({ head: "Women's Doubles Novice", a, b })),
    ...rr(mixed.slice(0, 4)).map(([a, b]) => ({ head: "Mixed Doubles Low Intermediate - Pool A", a, b })),
    ...rr(mixed.slice(4)).map(([a, b]) => ({ head: "Mixed Doubles Low Intermediate - Pool B", a, b })),
    ...rr(mens).map(([a, b]) => ({ head: "Men's Doubles Intermediate", a, b })),
  ];
  const COURTS = 4, rows: (string | null)[][] = [["Time", "Court 1", "Court 2", "Court 3", "Court 4"]];
  let mins = 10 * 60;
  const t = () => {
    const f = (m: number) => `${Math.floor(m / 60) > 12 ? Math.floor(m / 60) - 12 : Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
    const s = `${f(mins)} - ${f(mins + 15)}`;
    mins += 15;
    return s;
  };
  const left = [...games];
  while (left.length) {
    const row: (string | null)[] = [t()], used = new Set<string>();
    for (let c = 0; c < COURTS; c++) {
      const i = left.findIndex((g) => !used.has(g.a) && !used.has(g.b));
      if (i < 0) { row.push(null); continue; }
      const [g] = left.splice(i, 1);
      used.add(g.a); used.add(g.b);
      row.push(`${g.head}\n${g.a} vs ${g.b}`);
    }
    rows.push(row);
  }
  rows.push([t(), "Mixed Low Intermediate Semifinal\nA1 vs B2", "Mixed Low Intermediate Semifinal\nB1 vs A2", "Men's Intermediate Gold\nTop 1 & 2", "Men's Intermediate Bronze\nTop 3 & 4"]);
  rows.push([t(), "Mixed Low Intermediate Gold", "Mixed Low Intermediate Bronze", "Women's Novice Gold\nTop 1 & 2", "Open play"]);
  return rows;
}
