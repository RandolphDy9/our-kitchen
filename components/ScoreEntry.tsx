"use client";
import { useState } from "react";
import { cleanScore, otherScore, scoreProblem } from "@/lib/score";

type Side = "a" | "b";

/** Score entry shared by every place admins record a game. Typing a losing score under 10 fills in 11 for the
    other team; impossible scores (ties, 11–10, 13–5, over 30) are flagged as you type and can't be saved.
    Leave both blank to just tap who won. */
export function ScoreEntry({ id, nameA, nameB, onSave, onCancel, hint, autoFocus }: {
  id: string; nameA: string; nameB: string;
  onSave: (w: Side, sa: number | null, sb: number | null) => Promise<boolean | void> | boolean | void;
  onCancel?: () => void; hint?: string; autoFocus?: boolean;
}) {
  const [v, setV] = useState({ a: "", b: "" }), [auto, setAuto] = useState<Side | null>(null), [busy, setBusy] = useState(false);
  const type = (s: Side, raw: string) => {
    const o: Side = s === "a" ? "b" : "a", val = cleanScore(raw), next = { ...v, [s]: val };
    if (v[o] === "" || auto === o) {
      const fill = val === "" ? null : otherScore(+val);
      next[o] = fill == null ? "" : String(fill);
      setAuto(fill == null ? null : o);
    } else if (auto === s) setAuto(null);
    setV(next);
  };
  const sa = v.a === "" ? null : +v.a, sb = v.b === "" ? null : +v.b;
  const blank = sa == null && sb == null, problem = scoreProblem(sa, sb), ready = !blank && !problem;
  const save = async (w: Side) => {
    if (busy) return;
    setBusy(true);
    try { await onSave(w, sa, sb); } finally { setBusy(false); }
  };
  const winner: Side | null = ready ? (sa! > sb! ? "a" : "b") : null;
  const hiLo = ready ? `${Math.max(sa!, sb!)}–${Math.min(sa!, sb!)}` : "";
  const row = (s: Side, name: string, ph: string) => (
    <div className="score-row"><label htmlFor={`${id}${s}`}>{name}</label>
      <input id={`${id}${s}`} className={auto === s ? "auto" : undefined} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} enterKeyHint="done"
        autoComplete="off" placeholder={ph} autoFocus={autoFocus && s === "a"} value={v[s]} aria-invalid={!!problem && !blank}
        onFocus={(e) => e.target.select()} onChange={(e) => type(s, e.target.value)} /></div>
  );
  return (
    <form className="score-entry" noValidate onSubmit={(e) => { e.preventDefault(); if (winner) save(winner); }}>
      {row("a", nameA, "11")}
      {row("b", nameB, "7")}
      {problem && !blank ? <p className="small score-msg" role="alert">{problem}</p>
        : <p className="small muted">{blank ? hint || "Enter the score, or just tap who won." : "Games go to 11, win by 2."}</p>}
      <div className="row">
        {blank ? <>
          <button className="btn sm dark" type="button" disabled={busy} onClick={() => save("a")}>{nameA} won</button>
          <button className="btn sm dark" type="button" disabled={busy} onClick={() => save("b")}>{nameB} won</button>
        </> : <button className="btn sm dark" type="submit" disabled={!ready || busy}>{winner ? `Save · ${winner === "a" ? nameA : nameB} won ${hiLo}` : "Save score"}</button>}
        {onCancel ? <button className="btn sm ghost" type="button" onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  );
}
