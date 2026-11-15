import { ownerEmail } from "@/lib/backend/types";
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
      {p.checks.length ? (
        <div className="notice imp-checks">
          <b>{p.checks.length === 1 ? "1 thing" : `${p.checks.length} things`} to check in the schedule</b>
          <ul className="small">{p.checks.map((w, i) => <li key={i}>{w}</li>)}</ul>
          <p className="small">Best fixed in the file before game day. You can import now, but uploading a corrected file later replaces the schedule, including any scores already entered.</p>
        </div>
      ) : null}
      {p.warnings.length ? <details><summary>{p.warnings.length} note{p.warnings.length > 1 ? "s" : ""} from the file</summary><ul className="small">{p.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details> : null}
    </>
  );
}

/** Ready to import: nothing was skipped, or the organizer agreed to go without it. */
export const importReady = (p: Parsed | null | undefined, ok: boolean) => !p || !p.skipped.length || ok;

/** What club admins see instead of the upload button while only the Qsina team imports schedules. */
export function SendSchedule({ event }: { event?: string }) {
  const to = ownerEmail();
  const subject = encodeURIComponent(`Schedule for ${event || "our event"}`);
  return (
    <div className="notice send-sched">
      <b>The Qsina team imports schedules for now.</b>
      <p className="small">Email your spreadsheet{to ? <> to <a href={`mailto:${to}?subject=${subject}`}>{to}</a></> : null}{event ? <> and mention <b>{event}</b></> : null}. Your own format is fine. We&apos;ll check it with you and set up the players, pools, playoffs and court times. You&apos;ll still enter the scores on the day.</p>
    </div>
  );
}
