"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useApp, set, get, toast } from "@/lib/store";
import { MAX_REACTIONS, adminClubs, checkinLink, clubEvents, eventCode, divName, done, fmtDate, fmtTime, live, reactionsOf, uid } from "@/lib/model";
import { deleteEvent, impDelete, impRun, saveBlob, saveReactions, schedLeftovers } from "@/lib/actions";
import { selectEvent, switchClub } from "@/lib/session";
import { nameKey, parseSchedule, readScheduleFile, type Parsed } from "@/lib/schedule";
import { sampleRows } from "@/lib/sample";
import type { EventDoc, Reaction } from "@/lib/types";
import { Hero, ActivityFeed, PulseCard } from "../widgets";
import { Icon, Stat } from "../ui";
import { Select } from "../Select";
import { ImportNotes, TEMPLATE_URL, importReady } from "../ImportNotes";

export function Tiles() {
  const S = useApp();
  const P = S.players, i = P.filter((p) => p.checkedIn).length, e = S.events.find((x) => x.id === S.eventId);
  return (
    <div className="statgrid">
      <Stat icon="users" label="Checked in" val={i} unit={"/" + P.length} />
      <Stat icon="grid" label="Courts live" val={live(S).length} unit={"/" + (e?.courts || 0)} />
      <Stat icon="trophy" label="Games done" val={done(S).length} />
    </div>
  );
}

function Cats() {
  const S = useApp(), P = S.players;
  if (!P.length) return <p className="muted">No players yet. Import the tournament schedule above to add them.</p>;
  const cell = (g: string, l: string) => {
    const all = P.filter((p) => p.gender === g && p.level === l), i = all.filter((p) => p.checkedIn).length;
    return <td><span className="num">{i}/{all.length}</span><div className="bar"><i style={{ width: `${all.length ? i / all.length * 100 : 0}%` }} /></div></td>;
  };
  const mix = (l: string) => Math.min(P.filter((p) => p.gender === "M" && p.level === l && p.checkedIn).length, P.filter((p) => p.gender === "F" && p.level === l && p.checkedIn).length);
  return (
    <div className="tbl-wrap"><table><thead><tr><th></th><th>Low</th><th>High</th></tr></thead><tbody>
      <tr><td>Men</td>{cell("M", "low")}{cell("M", "high")}</tr>
      <tr><td>Women</td>{cell("F", "low")}{cell("F", "high")}</tr>
      <tr><td>Mixed pairs</td><td className="num">{mix("low")}</td><td className="num">{mix("high")}</td></tr>
    </tbody></table></div>
  );
}

const fontVar = (v: string, fallback: string) => {
  const f = getComputedStyle(document.body).getPropertyValue(v).trim();
  return f ? `${f}, ${fallback}` : fallback;
};
async function saveQR(e: EventDoc, src: HTMLCanvasElement) {
  const W = 1200, H = 1600, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!, osw = fontVar("--font-oswald", "Oswald, sans-serif");
  await document.fonts?.ready;
  x.fillStyle = "#f5f5ef"; x.fillRect(0, 0, W, H);
  const rr = (X: number, Y: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
  rr(60, 60, W - 120, 420, "#f6b90a");
  x.fillStyle = "#18181d"; x.textBaseline = "top";
  let s = 84;
  const T = e.name.toUpperCase();
  x.font = `700 ${s}px ${osw}`;
  while (x.measureText(T).width > W - 260 && s > 40) { s -= 4; x.font = `700 ${s}px ${osw}`; }
  x.fillText(T, 120, 130);
  x.font = `500 40px ${osw}`; x.fillStyle = "#4a4a55";
  x.fillText([e.venue, fmtDate(e.date)].filter(Boolean).join("  ·  "), 120, 130 + s + 30);
  rr(120, 330, W - 240, 110, "#111111");
  x.fillStyle = "#f6b90a"; x.font = `700 44px ${osw}`; x.textBaseline = "middle";
  x.fillText(`${fmtTime(e.start)} – ${fmtTime(e.end)}`, 160, 385);
  x.textAlign = "right"; x.font = `600 36px ${osw}`; x.fillText(`${e.courts} courts`, W - 160, 385); x.textAlign = "center";
  rr(160, 540, W - 320, 880, "#ffffff");
  x.fillStyle = "#18181d"; x.font = `700 76px ${osw}`; x.fillText("SCAN TO CHECK IN", W / 2, 630);
  x.imageSmoothingEnabled = false; x.drawImage(src, 300, 700, 600, 600);
  x.fillStyle = "#848995"; x.font = `600 30px ${osw}`; x.fillText("EVENT " + eventCode(e).toUpperCase(), W / 2, 1360);
  x.font = `500 34px ${osw}`; x.fillText("Open your phone camera and point it at the code", W / 2, 1500);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (blob) await saveBlob("checkin-qr-" + e.id + ".png", blob);
}

const QR_OPTS = { width: 400, margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } } as const;

function QRCard({ e }: { e: EventDoc }) {
  const [src, setSrc] = useState("");
  const link = checkinLink(e);
  // An <img> scales to its box; QRCode.toCanvas pins the canvas to 400px inline, which the box cropped.
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, QR_OPTS).then((u) => live && setSrc(u)).catch(() => {});
    return () => { live = false; };
  }, [link]);
  const poster = async () => {
    try {
      const c = document.createElement("canvas");
      await QRCode.toCanvas(c, link, QR_OPTS);
      await saveQR(e, c);
    } catch { toast("Couldn't make the poster."); }
  };
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && matchMedia("(pointer:coarse)").matches) {
      try { await nav.share({ title: e.name, text: `Check in to ${e.name}`, url: link }); return; } catch (err) { if ((err as DOMException).name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(link); toast("Check-in link copied"); } catch { toast(link); }
  };
  return (
    <section className="card" style={{ justifyItems: "stretch" }}>
      <div className="sec-head"><h2>Check-in QR</h2></div>
      <div className="qr-box"><b>Scan to check in</b>
        <div id="qr">{src ? <img src={src} alt="Check-in QR code" width={400} height={400} /> : null}</div>
        <span className="code">EVENT {eventCode(e).toUpperCase()}</span>
      </div>
      <button className="btn dark block" onClick={poster}><Icon n="qr" />Save QR poster</button>
      <button className="btn soft block" onClick={share}>Share check-in link</button>
    </section>
  );
}

type Imp = { busy?: boolean; msg?: string; error?: string; parsed?: Parsed; skipOk?: boolean; fileName?: string; title?: string; opts?: { updateEvent: boolean; replace: boolean } };
function ImportCard() {
  const S = useApp();
  const [I, setI] = useState<Imp>({});
  const [delAsk, setDelAsk] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const has = S.sched.length;
  const left = schedLeftovers(S), leftN = left.players.length + left.matches.length;
  useEffect(() => {
    if (!S.flashImport || !cardRef.current) return;
    set({ flashImport: false });
    const el = cardRef.current;
    setTimeout(() => { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("imp-flash"); }, 250);
  }, [S.flashImport]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setI({ busy: true, msg: "Reading the file…" });
    try {
      const parsed = await readScheduleFile(file);
      const title = file.name.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[_-]+/g, " ").replace(/\b(tournament\s+schedule|final|schedule)\b/gi, "").replace(/\s+/g, " ").trim();
      setI({ parsed, fileName: file.name, title, opts: { updateEvent: true, replace: true } });
    } catch (e) {
      setI({ error: (e as Error).message || "Couldn't read that file." });
    }
  };
  const onSample = () => {
    try {
      setI({ parsed: parseSchedule(sampleRows()), fileName: "Sample tournament (demo)", title: "", opts: { updateEvent: true, replace: true } });
    } catch (e) {
      setI({ error: (e as Error).message });
    }
  };
  const run = async () => {
    if (!I.parsed || !I.opts) return;
    const keep = I;
    setI({ ...I, busy: true, msg: "Getting ready…" });
    try {
      await impRun(keep.parsed!, keep.opts!, keep.title || "", (msg) => setI((x) => ({ ...x, msg })));
      setI({});
      window.scrollTo(0, 0);
    } catch {
      setI({ ...keep, busy: false, error: "The import stopped partway. Only admins can import. Try again, and keep “Replace” ticked." });
    }
  };
  const del = async () => {
    setI({ busy: true, msg: "Removing…" });
    await impDelete((msg) => setI({ busy: true, msg }));
    setI({});
    setDelAsk(false);
  };

  const pick = (
    <>
      <label className={`btn ${I.parsed ? "" : "dark"}`} htmlFor="impFile">{I.parsed ? "Choose a different file" : "Upload schedule (.xlsx)"}</label>
      <input type="file" id="impFile" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
  let body;
  if (I.busy) body = <p className="small"><b>{I.msg || "Working…"}</b></p>;
  else if (I.parsed && I.opts) {
    const p = I.parsed, known = new Set(S.roster.map((r) => nameKey(r.name))), newN = p.players.filter((x) => !known.has(x.key)).length;
    const pool = p.sched.filter((x) => x.stage === "pool").length, po = p.sched.length - pool, unk = p.players.filter((x) => !x.gender);
    const flow = (id: string) => {
      const ks = p.sched.filter((x) => x.div === id).map((x) => x.key);
      return ks.includes("q1") ? "QF → SF → Final" : ks.includes("s1") ? "Semis → Final" : ks.includes("f") ? "Gold & bronze games" : "Pool play only";
    };
    const opts = I.opts;
    body = (
      <>
        {I.error ? <div className="notice">{I.error}</div> : null}
        <p className="small"><b>{I.fileName}</b></p>
        <div className="impstats">
          <div><b>{p.players.length}</b><span>Players · {newN} new</span></div>
          <div><b>{p.divs.length}</b><span>Divisions</span></div>
          <div><b>{p.sched.length}</b><span>Games · {po} playoff</span></div>
          <div><b>{p.courts}</b><span>Courts</span></div>
          <div><b>{fmtTime(p.start)}</b><span>to {fmtTime(p.end)}</span></div>
        </div>
        <div className="tbl-wrap"><table><thead><tr><th>Division</th><th>Teams</th><th>Pools</th><th>Playoffs</th></tr></thead><tbody>
          {p.divs.map((d) => <tr key={d.id}><td>{divName(d)}</td><td>{d.teams.length}</td><td>{d.pools.length ? d.pools.join(", ") : "Round robin"}</td><td>{flow(d.id)}</td></tr>)}
        </tbody></table></div>
        {unk.length ? <div className="notice">We couldn&apos;t tell if these players are men or women: <b>{unk.map((x) => x.name).join(", ")}</b>. Set them in Players after importing.</div> : null}
        <ImportNotes p={p} ok={!!I.skipOk} setOk={(v) => setI({ ...I, skipOk: v })} />
        <label className="check"><input type="checkbox" checked={opts.updateEvent} onChange={(e) => setI({ ...I, opts: { ...opts, updateEvent: e.target.checked } })} /> Update event name, times and courts{I.title ? ` (“${I.title}”)` : ""}</label>
        {has ? <label className="check"><input type="checkbox" checked={opts.replace} onChange={(e) => setI({ ...I, opts: { ...opts, replace: e.target.checked } })} /> Replace the schedule already in this event</label> : null}
        <button className="btn dark block" onClick={run} disabled={!importReady(p, !!I.skipOk)}>Import into this event</button>
        {pick}
      </>
    );
  } else if (I.error) body = <><div className="notice">{I.error}</div>{pick}</>;
  else if (has) body = (
    <>
      <p className="small">This event has <b>{S.sched.length} scheduled games</b> in <b>{S.divs.length} divisions</b>.</p>
      {delAsk ? <p className="small">Removing also deletes the <b>{left.players.length} players</b> it added who haven&apos;t checked in. Checked-in players stay.</p> : null}
      <div className="row">{pick}{delAsk
        ? <><button className="btn sm danger" onClick={del}>Yes, remove the schedule</button><button className="btn sm ghost" onClick={() => setDelAsk(false)}>Keep it</button></>
        : <button className="btn sm ghost" onClick={() => setDelAsk(true)}>Remove schedule</button>}</div>
    </>
  );
  else if (leftN) body = (
    <>
      <p className="small">An earlier schedule left <b>{left.players.length} imported players</b>{left.matches.length ? <> and <b>{left.matches.length} started games</b></> : null} in this event.</p>
      <div className="row">{pick}{delAsk
        ? <><button className="btn sm danger" onClick={del}>Yes, remove them</button><button className="btn sm ghost" onClick={() => setDelAsk(false)}>Keep them</button></>
        : <button className="btn sm ghost" onClick={() => setDelAsk(true)}>Remove leftovers</button>}</div>
    </>
  );
  else body = <>{pick}{S.mode === "local" ? <button className="btn ghost block" onClick={onSample}>Try a sample schedule</button> : null}</>;

  return (
    <section className="card" ref={cardRef} style={{ scrollMarginTop: 84 }}>
      <div className="sec-head"><h2>Import tournament schedule</h2><span className="pill">Excel</span></div>
      <p className="small muted">Upload the schedule your admins built: a time column plus Court 1, Court 2… columns, with cells like “Men&apos;s Doubles - Pool A / Alvin/RC vs Chicco/John”. Qsina creates the players, divisions, pools, playoff games and court times for this event.</p>
      <p className="small"><a href={TEMPLATE_URL} download>Download the Qsina template (.xlsx)</a> to see the format.</p>
      {body}
    </section>
  );
}

function RxEditor() {
  const S = useApp();
  const saved = reactionsOf(S);
  const [d, setD] = useState<Reaction[] | null>(null);
  const list = d || saved.map((r) => ({ ...r }));
  const upd = (i: number, k: "emoji" | "label", v: string) => setD(list.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const clean = list.map((r) => ({ ...r, emoji: r.emoji.trim(), label: r.label.trim() })).filter((r) => r.emoji && r.label).slice(0, MAX_REACTIONS);
    if (!clean.length) return toast("Keep at least one reaction.");
    (document.activeElement as HTMLElement | null)?.blur();
    if (await saveReactions(clean)) setD(null);
  };
  return (
    <form className="card" onSubmit={submit}>
      <div className="sec-head"><h2>Player reactions</h2><span className="small muted num">{list.length} of {MAX_REACTIONS}</span></div>
      <p className="small muted">Players give these to each other. Totals show on the leaderboards.</p>
      <div style={{ display: "grid", gap: 8 }}>{list.map((r, i) => (
        <div className="rx-row" key={r.id}>
          <input type="text" maxLength={8} value={r.emoji} aria-label={`Emoji ${i + 1}`} onChange={(e) => upd(i, "emoji", e.target.value)} />
          <input type="text" maxLength={24} value={r.label} aria-label={`Name ${i + 1}`} onChange={(e) => upd(i, "label", e.target.value)} />
          <button className="btn sm ghost" type="button" disabled={list.length <= 1} onClick={() => setD(list.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}</div>
      <div className="row">
        {list.length < MAX_REACTIONS
          ? <button className="btn sm" type="button" onClick={() => setD([...list, { id: "r" + uid(5), emoji: "⭐", label: "New reaction" }])}><Icon n="plus" />Add reaction</button>
          : <span className="small muted">Maximum of {MAX_REACTIONS} reached</span>}
        <button className="btn dark" type="submit">Save reactions</button>
      </div>
    </form>
  );
}

function DeleteEventCard({ e }: { e: EventDoc }) {
  const S = useApp();
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  // Typing the word is the deliberate step; any capitalization counts, since phones capitalize the first letter.
  const ok = typed.trim().toLowerCase() === "confirm";
  const keep = () => { setAsk(false); setTyped(""); };
  const go = async (x: React.FormEvent) => {
    x.preventDefault();
    if (!ok) return;
    setMsg("Deleting…");
    if (!(await deleteEvent(setMsg))) { setMsg(null); keep(); }
  };
  return (
    <section className="card"><h2>Delete event</h2>
      {msg ? <p className="small">{msg}</p> : ask ? (
        <form className="del-form" onSubmit={go}>
          <p className="small">This permanently deletes <b>{e.name}</b> with its {S.roster.length} players, check-ins, games, playoffs and {S.photos.length} photos. It can&apos;t be undone.</p>
          <div className="field"><label htmlFor="del-confirm">To confirm, type <b>Confirm</b></label>
            <input id="del-confirm" type="text" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" autoFocus
              value={typed} onChange={(x) => setTyped(x.target.value)} /></div>
          <div className="row"><button type="submit" className="btn sm danger" disabled={!ok}>Delete this event</button><button type="button" className="btn sm ghost" onClick={keep}>Keep it</button></div>
        </form>
      ) : <button className="btn sm ghost" style={{ justifySelf: "start" }} onClick={() => setAsk(true)}>Delete event…</button>}
    </section>
  );
}

export function EventPage({ e }: { e: EventDoc }) {
  const S = useApp();
  return (
    <div className="view">
      <div className="row">
        {adminClubs(S).length > 1 ? <div className="field" style={{ flex: "1 1 160px" }}><label htmlFor="clubSel">Club</label>
          <Select id="clubSel" value={S.clubId || ""} onChange={switchClub} options={adminClubs(S).map((c) => [c.id, c.name] as const)} />
        </div> : null}
        <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor="evSel">Event</label>
          <Select id="evSel" value={S.eventId || ""} onChange={selectEvent} options={clubEvents(S).map((x) => [x.id, `${x.name} · ${fmtDate(x.date)}`] as const)} />
        </div>
      </div>
      <Hero e={e} />
      <Tiles />
      <div className="split">
        <QRCard e={e} />
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ImportCard />
          <section className="card"><div className="sec-head"><h2>Activity</h2><button className="link" onClick={() => set({ tab: "results" })}>See all</button></div><div className="feed"><ActivityFeed limit={6} /></div></section>
          <PulseCard />
          <section className="card"><div className="sec-head"><h2>Arrivals by category</h2><button className="link" onClick={() => set({ tab: "players" })}>See all</button></div><Cats /></section>
          <RxEditor key={get().eventId || ""} />
          <DeleteEventCard key={"del-" + e.id} e={e} />
        </div>
      </div>
    </div>
  );
}
