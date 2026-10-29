"use client";
import { useState } from "react";
import { useApp, set, get } from "@/lib/store";
import { clubName, clubOf, hue, initials, isClubOwner, todayISO } from "@/lib/model";
import { switchClub } from "@/lib/session";
import type { Member } from "@/lib/types";
import { parseSchedule, readScheduleFile, type Parsed } from "@/lib/schedule";
import { sampleRows } from "@/lib/sample";
import { addAdmin, addOwner, createClub, createEvent, organizerPasswordSignIn, organizerSignOut, removeMember, renameClub, type EventDraft } from "@/lib/actions";
import { Av } from "../ui";

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = () => set({ signingIn: false });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pw) return setErr("Enter your email and password.");
    setBusy(true);
    setErr(null);
    const msg = await organizerPasswordSignIn(email, pw);
    setBusy(false);
    if (msg) setErr(msg);
  };
  return (
    <div className="view team">
      <button className="iconpill" onClick={cancel} style={{ justifySelf: "start" }}>← Back</button>
      <div className="greet"><h1>Organizer sign in</h1><p>For club owners. Admins who help at events get access on the phone they checked in with.</p></div>
      <form className="card" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="si-email">Email</label>
          <input id="si-email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="si-pw">Password</label>
          <input id="si-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err ? <div className="notice" role="alert">{err}</div> : null}
        <button className="btn dark block" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="small muted">Forgot your password? Reset it in Supabase under Authentication → Users.</p>
      </form>
    </div>
  );
}

/* New event, upload-first: the sheet fills in the name, times and courts; the admin adds the date and venue.
   `first` is the landing screen when there are no events yet (nothing to go back to). */
export function CreateEventPage({ first = false }: { first?: boolean }) {
  const S = useApp();
  const [d, setD] = useState<EventDraft>({ name: "", venue: "", date: todayISO(), start: "10:00", end: "14:00", courts: 4, next: "import" });
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [manual, setManual] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const up = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const cancel = () => set({ creating: false });
  const use = (p: Parsed, file: string, title: string) => {
    setParsed(p);
    setFileName(file);
    setD((x) => ({ ...x, name: title || x.name, start: p.start || x.start, end: p.end || x.end, courts: Math.max(p.courts, 1) }));
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    setErr(null);
    setBusy("Reading the file…");
    try {
      use(await readScheduleFile(file), file.name, file.name.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[_-]+/g, " ")
        .replace(/\b(tournament\s+schedule|final|schedule)\b/gi, "").replace(/\s+/g, " ").trim());
    } catch (e) {
      setErr((e as Error).message || "Couldn't read that file.");
    }
    setBusy(null);
  };
  const onSample = () => {
    try { use(parseSchedule(sampleRows()), "Sample tournament (demo)", "Sample Tournament"); } catch (e) { setErr((e as Error).message); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const x = { ...d, name: d.name.trim(), venue: d.venue.trim() };
    const msg = !x.name ? "Give the event a name." : !x.date ? "Pick a date." : !x.start || !x.end ? "Set a start and end time."
      : x.end <= x.start ? "The end time has to be after the start time." : !(x.courts >= 1 && x.courts <= 40) ? "Courts must be between 1 and 40." : null;
    if (msg) return setErr(msg);
    setErr(null);
    // Selecting the new event remounts this page, so progress lives in the store.
    set({ creating: true, createMsg: "Creating the event…" });
    try {
      await createEvent(x, parsed || undefined, (m) => set({ createMsg: m }));
      window.scrollTo(0, 0);
    } catch {
      setErr("Couldn't create the event. Only admins can.");
    }
    set({ createMsg: null });
  };
  const pick = (label: string, dark: boolean) => (
    <>
      <label className={`btn block${dark ? " dark" : ""}`} htmlFor="ceFile">{label}</label>
      <input type="file" id="ceFile" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );

  if (S.createMsg) return (
    <div className="view team">
      <div className="greet"><h1>Setting up your event</h1><p>Keep this screen open until it&apos;s done.</p></div>
      <section className="card"><p className="small"><b>{S.createMsg}</b></p></section>
    </div>
  );
  const head = (
    <>
      {first ? null : <button className="iconpill" onClick={cancel} style={{ justifySelf: "start" }}>← Back</button>}
      <div className="greet"><h1>{first ? "Set up your first event" : "New event"}</h1>
        <p>{parsed || manual ? "Check the details, then create the event." : "Upload your tournament schedule. We'll set up the players, divisions, pools and court times from it."}</p></div>
    </>
  );
  if (busy && !parsed && !manual) return <div className="view team">{head}<section className="card"><p className="small"><b>{busy}</b></p></section></div>;
  if (!parsed && !manual) return (
    <div className="view team">
      {head}
      <section className="card">
        <div className="sec-head"><h2>Tournament schedule</h2><span className="pill">Excel</span></div>
        <p className="small muted">A time column plus Court 1, Court 2… columns, with cells like “Men&apos;s Doubles - Pool A / Alvin/RC vs Chicco/John”.</p>
        {err ? <div className="notice" role="alert">{err}</div> : null}
        {pick("Upload schedule (.xlsx)", true)}
        {S.mode === "local" ? <button className="btn ghost block" onClick={onSample}>Try a sample schedule</button> : null}
      </section>
      <button className="btn ghost" style={{ justifySelf: "start" }} onClick={() => setManual(true)}>Set up without a schedule</button>
    </div>
  );

  const pool = parsed ? parsed.sched.filter((x) => x.stage === "pool").length : 0;
  return (
    <div className="view team">
      {head}
      {parsed ? (
        <section className="card">
          <p className="small"><b>{fileName}</b></p>
          <div className="impstats">
            <div><b>{parsed.players.length}</b><span>Players</span></div>
            <div><b>{parsed.divs.length}</b><span>Divisions</span></div>
            <div><b>{parsed.sched.length}</b><span>Games · {parsed.sched.length - pool} playoff</span></div>
          </div>
          {parsed.warnings.length ? <details><summary>{parsed.warnings.length} note{parsed.warnings.length > 1 ? "s" : ""} from the file</summary><ul className="small">{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details> : null}
          {pick("Choose a different file", false)}
        </section>
      ) : null}
      <form className="card" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="ce-name">Event name</label><input id="ce-name" type="text" required maxLength={80} autoFocus={!parsed} placeholder="e.g. McGregor Pickleball Tournament 2026" value={d.name} onChange={(e) => up("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="ce-venue">Venue</label><input id="ce-venue" type="text" maxLength={80} placeholder="e.g. Picktopia Scarborough" value={d.venue} onChange={(e) => up("venue", e.target.value)} /></div>
        <div className="row">
          <div className="field"><label htmlFor="ce-date">Date</label><input id="ce-date" type="date" required autoFocus={!!parsed} value={d.date} onChange={(e) => up("date", e.target.value)} /></div>
          <div className="field" style={{ flex: "0 1 110px" }}><label htmlFor="ce-courts">Courts</label><input id="ce-courts" type="number" min={1} max={40} inputMode="numeric" value={Number.isNaN(d.courts) ? "" : d.courts} onChange={(e) => up("courts", parseInt(e.target.value, 10))} /></div>
        </div>
        <div className="row">
          <div className="field"><label htmlFor="ce-start">Starts</label><input id="ce-start" type="time" required value={d.start} onChange={(e) => up("start", e.target.value)} /></div>
          <div className="field"><label htmlFor="ce-end">Ends</label><input id="ce-end" type="time" required value={d.end} onChange={(e) => up("end", e.target.value)} /></div>
        </div>
        {parsed ? <p className="small muted">Players can check in from an hour before the start time.</p> : (
          <fieldset className="ce-next"><legend className="lbl">After creating</legend>
            <label className="check"><input type="radio" name="ce-next" checked={d.next !== "event"} onChange={() => up("next", "import")} /> Import the schedule (.xlsx) next</label>
            <label className="check"><input type="radio" name="ce-next" checked={d.next === "event"} onChange={() => up("next", "event")} /> Just open the event</label>
          </fieldset>
        )}
        {err ? <div className="notice" role="alert">{err}</div> : null}
        <button className="btn dark block" type="submit">{parsed ? "Create event and import schedule" : "Create event"}</button>
        <button className="btn ghost block" type="button" onClick={() => { setManual(false); setParsed(null); setErr(null); }}>{parsed ? "Start over" : "Back to upload"}</button>
      </form>
    </div>
  );
}

/** The club on screen: its name, owners and admins. The platform owner also gets every club and "New club". */
export function TeamPage() {
  const S = useApp(), cid = S.clubId || "";
  const owner = isClubOwner(S);
  const [q, setQ] = useState("");
  const [rmAsk, setRmAsk] = useState<string | null>(null);
  const list = S.members[cid] || [];
  const owners = list.filter((m) => m.role === "owner"), admins = list.filter((m) => m.role === "admin");
  const ql = q.trim().toLowerCase();
  const isAdmin = (uid?: string | null) => !!uid && list.some((m) => m.id === uid);
  const pickable = S.players.filter((p) => !isAdmin(p.uid) && (!ql || p.name.toLowerCase().includes(ql)))
    .sort((a, b) => Number(!!b.uid) - Number(!!a.uid) || a.name.localeCompare(b.name)).slice(0, 30);
  const removeBtn = (m: Member, label: string) => rmAsk === m.id
    ? <span className="row" style={{ gap: 6 }}><button className="btn sm danger" onClick={() => { setRmAsk(null); removeMember(m.id); }}>Remove</button><button className="btn sm ghost" onClick={() => setRmAsk(null)}>Keep</button></span>
    : <button className="btn sm ghost" onClick={() => setRmAsk(m.id)} aria-label={`Remove ${label}`}>Remove</button>;
  return (
    <div className="view team">
      <button className="iconpill" onClick={() => set({ team: false })} style={{ justifySelf: "start" }}>← Back</button>
      <div className="greet"><h1>{clubName(S, cid)}</h1>
        <p>{S.isOwner ? "You run Qsina, so you can manage every club." : "You own this club. Pick who helps run its events."}</p></div>
      {owner ? <ClubName key={cid} /> : null}
      <section className="card"><div className="sec-head"><h2>Owners</h2><span className="seeall">{owners.length}</span></div>
        <p className="small muted">Owners sign in with their email and password, and can add or remove admins.</p>
        {owners.length ? <div className="lboard">{owners.map((m) => (
          <div className="lrow" key={m.id} style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
            <span className={`av c${hue(m.id)}`}>{initials(m.name || m.email || "?")}</span>
            <div style={{ minWidth: 0 }}><div className="name">{m.name || m.email}{S.user?.email && m.email === S.user.email ? " (you)" : ""}</div><div className="sub">{m.email}</div></div>
            {S.isOwner ? removeBtn(m, m.name || m.email || "owner") : <span />}
          </div>
        ))}</div> : <p className="small muted">No owner yet.</p>}
        {S.isOwner ? <AddOwner key={cid} /> : null}
      </section>
      <section className="card"><div className="sec-head"><h2>Admins</h2><span className="seeall">{admins.length}</span></div>
        {admins.length ? <div className="lboard">{admins.map((m) => (
          <div className="lrow" key={m.id} style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
            <span className={`av c${hue(m.id)}`}>{initials(m.name || "?")}</span>
            <div style={{ minWidth: 0 }}><div className="name" style={{ overflowWrap: "anywhere" }}>{m.name || "Unnamed admin"}</div></div>
            {owner ? removeBtn(m, m.name || "admin") : <span />}
          </div>
        ))}</div> : <p className="small muted">No admins yet. Pick someone below.</p>}
      </section>
      {owner ? <section className="card"><h2>Make someone an admin</h2>
        {S.eventId ? <>
          <div className="field"><label htmlFor="teamq">Find a player</label>
            <input id="teamq" type="search" placeholder="Start typing a name" autoComplete="off" autoCapitalize="words" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="pick">{pickable.length ? pickable.map((p) => (
            <button key={p.id} disabled={!p.uid} onClick={() => addAdmin(p)} style={p.uid ? undefined : { opacity: 0.55, cursor: "default" }}>
              <Av p={p} /><span className="grow">{p.name}</span>
              <span className="small muted">{p.uid ? "Make admin" : "Not checked in"}</span>
            </button>
          )) : <p className="small muted">{S.players.length ? `No one named “${q}”.` : "This event has no players yet. Import the schedule first."}</p>}</div>
          <p className="small muted">Admin access goes to the phone they checked in with. Ask them to scan the check-in QR code first. If they switch phones, they can use Move my check-in, or you can make them admin again.</p>
        </> : <p className="small muted">Open one of this club&apos;s events first. You pick admins from its players.</p>}
      </section> : null}
      {S.isOwner ? <AllClubs /> : null}
      <button className="btn ghost" style={{ justifySelf: "start" }} onClick={organizerSignOut}>Sign out</button>
    </div>
  );
}

function ClubName() {
  const S = useApp();
  const [name, setName] = useState(clubName(S, S.clubId));
  const changed = name.trim() && name.trim() !== clubName(S, S.clubId);
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); if (changed) renameClub(name); }}>
      <div className="field"><label htmlFor="club-name">Club name</label>
        <input id="club-name" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
      {changed ? <button className="btn sm dark" type="submit" style={{ justifySelf: "start" }}>Save name</button> : null}
    </form>
  );
}

const loginHelp = "Then create their login in Supabase: Authentication → Users → Add user, with the same email and Auto Confirm User ticked. Send them the password; they sign in with Organizer sign in.";

function AddOwner() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  if (!open) return <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>Add an owner</button>;
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  return (
    <form className="grid-form" onSubmit={async (e) => { e.preventDefault(); if (ok && (await addOwner(email, name))) { setOpen(false); setEmail(""); setName(""); } }}>
      <div className="field"><label htmlFor="ow-name">Name</label><input id="ow-name" type="text" maxLength={60} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="ow-email">Sign-in email</label><input id="ow-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <p className="small muted">{loginHelp}</p>
      <div className="row"><button className="btn sm dark" type="submit" disabled={!ok}>Add owner</button><button className="btn sm ghost" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

/** Platform owner only: every club, switching between them, and creating a new one. */
function AllClubs() {
  const S = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [owner, setOwner] = useState("");
  const ok = name.trim() && (!email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));
  return (
    <section className="card"><div className="sec-head"><h2>All clubs</h2><span className="seeall">{S.clubs.length}</span></div>
      <div className="pick">{S.clubs.map((c) => {
        const n = S.events.filter((e) => clubOf(e) === c.id).length;
        return (
          <button key={c.id} onClick={() => switchClub(c.id)} aria-current={c.id === S.clubId ? "true" : undefined}>
            <span className="grow">{c.name}</span>
            <span className="small muted">{c.id === S.clubId ? "Open now" : `${n} ${n === 1 ? "event" : "events"}`}</span>
          </button>
        );
      })}</div>
      {open ? (
        <form className="grid-form" onSubmit={async (e) => { e.preventDefault(); if (ok && (await createClub(name, email, owner))) { setOpen(false); setName(""); setEmail(""); setOwner(""); } }}>
          <div className="field"><label htmlFor="nc-name">Club name</label><input id="nc-name" type="text" maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="nc-owner">Owner&apos;s name</label><input id="nc-owner" type="text" maxLength={60} autoComplete="off" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
          <div className="field"><label htmlFor="nc-email">Owner&apos;s sign-in email</label><input id="nc-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <p className="small muted">{loginHelp} You can also add the owner later.</p>
          <div className="row"><button className="btn sm dark" type="submit" disabled={!ok}>Create club</button><button className="btn sm ghost" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      ) : <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>New club</button>}
    </section>
  );
}
