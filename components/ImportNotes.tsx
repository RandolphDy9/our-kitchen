import type { Parsed } from "@/lib/schedule";

export const TEMPLATE_URL = "/qsina-schedule-template.xlsx";

/** What the import preview says about the file: games it couldn't read (which won't be imported, so the
    organizer has to say so before going ahead), then the softer notes. */
export function ImportNotes({ p, ok, setOk }: { p: Parsed; ok: boolean; setOk: (v: boolean) => void }) {
  const n = p.skipped.length;
  return (
    <>
      {n ? (
        <div className="notice imp-skipped" role="alert">
          <b>{n} {n === 1 ? "game" : "games"} in this file couldn&apos;t be read and won&apos;t be imported.</b>
          <ul className="small">{p.skipped.map((w, i) => <li key={i}>{w}</li>)}</ul>
          <p className="small">Fix {n === 1 ? "it" : "them"} in the file and choose it again, or import without {n === 1 ? "it" : "them"}. The <a href={TEMPLATE_URL} download>Qsina template</a> shows the format.</p>
          <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Import without {n === 1 ? "this game" : `these ${n} games`}</label>
        </div>
      ) : null}
      {p.warnings.length ? <details><summary>{p.warnings.length} note{p.warnings.length > 1 ? "s" : ""} from the file</summary><ul className="small">{p.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details> : null}
    </>
  );
}

/** Ready to import: nothing was skipped, or the organizer agreed to go without it. */
export const importReady = (p: Parsed | null | undefined, ok: boolean) => !p || !p.skipped.length || ok;
