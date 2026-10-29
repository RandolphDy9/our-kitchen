"use client";
/* Every write the app makes. Ported from the original artifact; error copy kept as-is. */
import { backend } from "./backend";
import { get, ls, set, toast } from "./store";
import {
  CATS, LEVELS, bMatch, canUndo, clubOf, photoSrc, checkinOpen, checkinOpensAt, curBracket, ev, fmtClock, live, lvlKey, me, pById, pName, paths, schedLocked, schedSides, uid,
} from "./model";
import { nameKey, type Parsed } from "./schedule";
import { selectEvent } from "./session";
import type { Bracket, Cat, Level, Match, Player } from "./types";

const E = () => get().eventId!;
const now = () => new Date().toISOString();
const col = {
  matches: () => paths.matches(E()), roster: () => paths.roster(E()), checkins: () => paths.checkins(E()),
  gallery: () => paths.gallery(E()), kudos: () => paths.kudos(E()), hearts: () => paths.hearts(E()),
  comments: () => paths.comments(E()), playoffs: () => paths.playoffs(E()), sched: () => paths.sched(E()), divs: () => paths.divs(E()),
};
const db = () => backend();

/* ---------- reactions ---------- */
export async function toggleReaction(to: string, r: string) {
  const S = get(), m = me(S);
  if (!m) return toast("Check in first to react.");
  if (m.id === to) return;
  const docId = `${m.id}_${to}_${r}`, has = S.kudos.some((k) => k.id === docId);
  try {
    if (has) await db().remove(`${col.kudos()}/${docId}`);
    else await db().set(`${col.kudos()}/${docId}`, { from: m.id, to, r, uid: S.uid || null, at: now() });
  } catch {
    toast("Couldn't save that reaction.");
  }
}
export async function saveReactions(list: { id: string; emoji: string; label: string }[]) {
  try {
    await db().update(paths.event(E()), { reactions: list });
    toast("Reactions saved");
    return true;
  } catch {
    toast("Only admins can change reactions.");
    return false;
  }
}

/* ---------- players ---------- */
export async function toggleIn(id: string) {
  const S = get(), p = pById(S, id);
  if (!p) return;
  try {
    if (p.checkedIn) {
      if (S.checkins.some((c) => c.id === id)) await db().remove(`${col.checkins()}/${id}`);
      await db().update(`${col.roster()}/${id}`, { checkedIn: false, checkedInAt: null, uid: null });
    } else await db().set(`${col.checkins()}/${id}`, { at: now(), by: "admin" });
  } catch {
    toast("Couldn't update check-in.");
  }
}
export async function delPlayer(id: string) {
  try {
    await db().remove(`${col.roster()}/${id}`);
    toast("Player removed");
  } catch {
    toast("Couldn't remove that player.");
  }
}
export async function setGender(id: string, g: "M" | "F") {
  try {
    await db().update(`${col.roster()}/${id}`, { gender: g });
  } catch {
    toast("Couldn't update that player.");
  }
}
export async function clearDemo() {
  for (const p of get().players.filter((p) => p.demo)) {
    try { await db().remove(`${col.roster()}/${p.id}`); } catch {}
  }
  toast("Demo players removed");
}
export async function claim(id: string) {
  const S = get(), p = pById(S, id);
  if (!p) return;
  if (p.uid && S.uid && p.uid !== S.uid) return toast("That name is already checked in on another account. Ask the organizer.");
  const e = ev(S);
  if (!checkinOpen(e)) return toast(`Check-in opens at ${fmtClock(checkinOpensAt(e)!.toISOString())}.`);
  try {
    await db().set(`${col.checkins()}/${id}`, { at: p.checkedInAt || now(), uid: S.uid || null });
    ls.set("me." + S.eventId, id);
    set({ ciJustDone: true });
  } catch {
    toast("Couldn't check you in. Check your connection and try again.");
  }
}

/* ---------- moving a check-in ----------
   A Home Screen app on iPhone (or another browser or phone) doesn't share storage with Safari, so the player
   is a stranger there. The device holding the check-in shows a short code; the server checks it and moves it. */
export async function showMoveCode(): Promise<string | null> {
  const m = me(get());
  if (!m) return null;
  try {
    return await db().moveCode(`${col.checkins()}/${m.id}`);
  } catch {
    toast("Couldn't make a code. Check your connection and try again.");
    return null;
  }
}
export async function moveIn(id: string, code: string): Promise<boolean> {
  try {
    if (!(await db().moveCheckin(`${col.checkins()}/${id}`, code))) return false;
    ls.set("me." + get().eventId, id);
    set({ ciJustDone: true });
    return true;
  } catch {
    toast("Couldn't move your check-in. Check your connection and try again.");
    return false;
  }
}

/* ---------- courts + results ---------- */
export async function saveResult(id: string, w: "A" | "B", sa: number | null, sb: number | null) {
  if (sa != null && sb != null && ((w === "A" && sa < sb) || (w === "B" && sb < sa))) {
    toast("That score says the other team won. Check the numbers.");
    return false;
  }
  const pm = get().matches.find((x) => x.id === id);
  if (pm?.sched) {
    if (await recordSched(pm.sched.s, w === "A" ? "a" : "b", sa, sb)) { set({ scoring: null }); toast("Result saved. Court is open."); return true; }
    return false;
  }
  if (pm?.playoff) {
    if (await recordPlayoff(pm.playoff.b, pm.playoff.m, w === "A" ? "a" : "b", sa, sb)) { set({ scoring: null }); toast("Result saved. The winner moves on in the bracket."); return true; }
    return false;
  }
  try {
    await db().update(`${col.matches()}/${id}`, { status: "done", winner: w, scoreA: sa, scoreB: sb, endedAt: now() });
    set({ scoring: null });
    toast("Result saved. Court is open.");
    return true;
  } catch {
    toast("Couldn't save. Only admins can record scores.");
    return false;
  }
}
export async function reopen(id: string) {
  const S = get(), m = S.matches.find((x) => x.id === id);
  if (!m) return;
  if (m.playoff) return toast("Undo playoff results from the Playoffs tab.");
  if (m.sched) return toast("Undo tournament results from Courts › Schedule.");
  if (live(S).some((x) => x.court === m.court)) return toast(`Court ${m.court} is in use. Finish that game first.`);
  try {
    await db().update(`${col.matches()}/${id}`, { status: "live", winner: null, scoreA: null, scoreB: null, endedAt: null });
    toast("Result undone. Game is back on court.");
  } catch {
    toast("Couldn't undo.");
  }
}

/* ---------- admin-built playoffs ---------- */
async function saveBr(br: Bracket, patch: Partial<Bracket>) {
  const { id, ...rest } = { ...br, ...patch };
  await db().set(`${col.playoffs()}/${id}`, { ...rest, teams: rest.teams.map(([a, b]) => ({ a, b })) });
}
export async function bkStart(d: { cat: Cat; lvl: Level; size: number; teams: string[][] }) {
  const ids = d.teams.flat();
  if (ids.some((x) => !x)) { toast("Pick a player for every slot."); return null; }
  if (new Set(ids).size !== ids.length) { toast("Each player can only be on one team."); return null; }
  const id = uid(), name = `${CATS[d.cat].replace(" doubles", "")} · ${LEVELS[d.lvl]}`;
  try {
    await db().set(`${col.playoffs()}/${id}`, { name, category: d.cat, level: d.lvl, size: d.size, teams: d.teams.map(([a, b]) => ({ a, b })), res: {}, live: {}, createdAt: now() });
    set({ bkId: id });
    toast("Playoffs started. Good luck, everyone!");
    return id;
  } catch {
    toast("Couldn't start the playoffs. Only admins can.");
    return null;
  }
}
export async function bkSendCourt(id: string, court: number) {
  const S = get(), br = curBracket(S);
  if (!br) return;
  const m = bMatch(br, id);
  if (!court || m.a == null || m.b == null) return;
  if (live(S).some((x) => x.court === court)) return toast(`Court ${court} is in use.`);
  const mid = uid();
  try {
    await db().set(`${col.matches()}/${mid}`, { teamA: br.teams[m.a], teamB: br.teams[m.b], category: br.category, level: br.level, court, round: 0, status: "live", createdAt: now(), playoff: { b: br.id, m: id, label: m.short } });
    await saveBr(br, { live: { ...br.live, [id]: { court, match: mid } } });
    toast(`${m.short} is on Court ${court}. The players just got an alert.`);
  } catch {
    toast("Couldn't send that match to a court.");
  }
}
export async function recordPlayoff(brId: string, id: string, w: "a" | "b", sa: number | null, sb: number | null) {
  const br = get().brackets.find((b) => b.id === brId);
  if (!br) return false;
  const m = bMatch(br, id);
  if (m.a == null || m.b == null || m.res) return false;
  if (sa != null && sb != null && ((w === "a" && sa < sb) || (w === "b" && sb < sa))) { toast("That score says the other team won. Check the numbers."); return false; }
  const t = now(), W = w === "a" ? "A" : "B";
  let mid = m.live?.match;
  try {
    if (mid) await db().update(`${col.matches()}/${mid}`, { status: "done", winner: W, scoreA: sa, scoreB: sb, endedAt: t });
    else {
      mid = uid();
      await db().set(`${col.matches()}/${mid}`, { teamA: br.teams[m.a], teamB: br.teams[m.b], category: br.category, level: br.level, court: null, round: 0, status: "done", winner: W, scoreA: sa, scoreB: sb, createdAt: t, endedAt: t, playoff: { b: br.id, m: id, label: m.short } });
    }
    const lv = { ...br.live };
    delete lv[id];
    await saveBr(br, { res: { ...br.res, [id]: { w, sa, sb, at: t, match: mid } }, live: lv });
    return true;
  } catch {
    toast("Couldn't save the result. Only admins can.");
    return false;
  }
}
export async function bkUndo(id: string) {
  const br = curBracket(get());
  if (!br || !canUndo(br, id)) return;
  const r = br.res[id], res = { ...br.res };
  delete res[id];
  try {
    if (r?.match) await db().update(`${col.matches()}/${r.match}`, { status: "void" }).catch(() => {});
    await saveBr(br, { res });
    toast("Result undone");
  } catch {
    toast("Couldn't undo that result.");
  }
}
export async function bkDelete() {
  const br = curBracket(get());
  if (!br) return;
  try {
    for (const l of Object.values(br.live || {})) if (l.match) await db().update(`${col.matches()}/${l.match}`, { status: "void" }).catch(() => {});
    await db().remove(`${col.playoffs()}/${br.id}`);
    set({ bkId: null });
    toast("Playoff deleted");
  } catch {
    toast("Couldn't delete the playoff.");
  }
}

/* ---------- imported schedule ---------- */
export async function startSched(sid: string, courtIn?: number | string) {
  const S = get(), x = S.sched.find((s) => s.id === sid);
  if (!x) return;
  const { d, A, B } = schedSides(S, x);
  if (!d || !A || !B) return toast("Both teams aren't decided yet.");
  const court = +(courtIn || 0) || x.court;
  if (live(S).some((m) => m.court === court)) return toast(`Court ${court} is in use. Record that game first.`);
  const mid = uid();
  try {
    await db().set(`${col.matches()}/${mid}`, { teamA: A.players, teamB: B.players, category: d.cat, level: lvlKey(d.level), court, round: 0, status: "live", createdAt: now(), sched: { s: sid, label: x.label, div: d.id } });
    await db().update(`${col.sched()}/${sid}`, { live: { court, match: mid } });
    toast(`${x.label} is on Court ${court}. The players just got an alert.`);
  } catch {
    toast("Couldn't start that game. Only admins can.");
  }
}
export async function recordSched(sid: string, w: "a" | "b", sa: number | null, sb: number | null) {
  const S = get(), x = S.sched.find((s) => s.id === sid);
  if (!x || x.res) return false;
  const { d, A, B } = schedSides(S, x);
  if (!d || !A || !B) { toast("Both teams aren't decided yet."); return false; }
  if (sa != null && sb != null && ((w === "a" && sa < sb) || (w === "b" && sb < sa))) { toast("That score says the other team won. Check the numbers."); return false; }
  const t = now(), W = w === "a" ? "A" : "B";
  let mid = x.live?.match;
  try {
    if (mid) await db().update(`${col.matches()}/${mid}`, { status: "done", winner: W, scoreA: sa, scoreB: sb, endedAt: t });
    else {
      mid = uid();
      await db().set(`${col.matches()}/${mid}`, { teamA: A.players, teamB: B.players, category: d.cat, level: lvlKey(d.level), court: x.court, round: 0, status: "done", winner: W, scoreA: sa, scoreB: sb, createdAt: t, endedAt: t, sched: { s: sid, label: x.label, div: d.id } });
    }
    await db().update(`${col.sched()}/${sid}`, { res: { w, sa, sb, at: t, match: mid }, live: null });
    return true;
  } catch {
    toast("Couldn't save the result. Only admins can.");
    return false;
  }
}
export async function undoSched(sid: string) {
  const S = get(), x = S.sched.find((s) => s.id === sid);
  if (!x?.res) return;
  if (schedLocked(S, x)) return toast("Later games already depend on this result, so it's locked.");
  try {
    if (x.res.match) await db().update(`${col.matches()}/${x.res.match}`, { status: "void" }).catch(() => {});
    await db().update(`${col.sched()}/${sid}`, { res: null });
    toast("Result undone");
  } catch {
    toast("Couldn't undo that result.");
  }
}
async function runChunks(tasks: (() => Promise<unknown>)[], label: string, progress: (m: string) => void) {
  for (let i = 0; i < tasks.length; i += 8) {
    await Promise.all(tasks.slice(i, i + 8).map((f) => f()));
    progress(`${label} ${Math.min(tasks.length, i + 8)} of ${tasks.length}…`);
  }
}
function clearSchedTasks() {
  const S = get(), del: (() => Promise<unknown>)[] = [];
  S.sched.forEach((x) => {
    del.push(() => db().remove(`${col.sched()}/${x.id}`));
    if (x.live?.match) del.push(() => db().update(`${col.matches()}/${x.live!.match}`, { status: "void" }).catch(() => {}));
  });
  S.divs.forEach((d) => del.push(() => db().remove(`${col.divs()}/${d.id}`)));
  return del;
}
export async function impRun(p: Parsed, opts: { updateEvent: boolean; replace: boolean }, title: string, progress: (m: string) => void) {
  const t = now(), pre = uid(4) + "-";
  if (opts.replace && get().sched.length) await runChunks(clearSchedTasks(), "Clearing old schedule", progress);
  const S = get(), byKey: Record<string, string> = {};
  S.roster.forEach((r) => { byKey[nameKey(r.name)] = r.id; });
  const addP: (() => Promise<unknown>)[] = [];
  for (const x of p.players) {
    if (byKey[x.key]) {
      const r = S.roster.find((r) => r.id === byKey[x.key]);
      if (r && !r.gender && x.gender) addP.push(() => db().update(`${col.roster()}/${r.id}`, { gender: x.gender }));
      continue;
    }
    const id = uid();
    byKey[x.key] = id;
    const d = p.divs.find((d) => d.teams.some((t) => t.players.includes(x.key)));
    addP.push(() => db().set(`${col.roster()}/${id}`, { name: x.name, gender: x.gender, level: lvlKey(d?.level), checkedIn: false, imported: true, createdAt: t }));
  }
  await runChunks(addP, "Adding players", progress);
  await runChunks(p.divs.map((d, i) => () => db().set(`${col.divs()}/${pre + d.id}`, {
    cat: d.cat, level: d.level, pools: d.pools, order: i, createdAt: t,
    teams: d.teams.map((tm) => ({ id: pre + tm.id, a: byKey[tm.players[0]], b: byKey[tm.players[1]], pool: tm.pool || null })),
  })), "Saving divisions", progress);
  const mapRef = (r: { t?: string }) => (r.t ? { t: pre + r.t } : r);
  await runChunks(p.sched.map((x) => () => db().set(`${col.sched()}/${pre + x.id}`, {
    div: pre + x.div, stage: x.stage, key: x.key || null, pool: x.pool || null, slot: x.slot, time: x.time, end: x.end, court: x.court,
    a: mapRef(x.a), b: mapRef(x.b), label: x.label, res: null, live: null,
  })), "Saving games", progress);
  if (opts.updateEvent) {
    const e = ev(get())!;
    await db().update(paths.event(E()), { name: title || e.name, courts: Math.max(p.courts, 1), start: p.start || e.start, end: p.end || e.end, courtNames: p.courtNames || {} });
  }
  set({ cview: "schedule", tab: "courts" });
  toast(`Imported ${p.sched.length} games and ${p.players.length} players`);
}
/** What removing the schedule leaves behind if it only deleted the games: the sheet's players and started games. */
export function schedLeftovers(S = get()) {
  return {
    players: S.roster.filter((p) => p.imported && !S.checkins.some((c) => c.id === p.id) && !p.checkedIn),
    matches: S.matches.filter((m) => m.sched),
  };
}
export async function impDelete(progress: (m: string) => void) {
  // Snapshot first: clearing voids the live matches, and the lists update as rows go.
  const { players, matches } = schedLeftovers();
  try {
    await runChunks(clearSchedTasks(), "Removing games", progress);
    await runChunks(matches.map((m) => () => db().remove(`${col.matches()}/${m.id}`)), "Removing started games", progress);
    await runChunks(players.map((p) => () => db().remove(`${col.roster()}/${p.id}`)), "Removing players", progress);
    const kept = get().roster.filter((p) => p.imported).length;
    toast(kept ? `Schedule removed. ${kept} checked-in player${kept === 1 ? "" : "s"} kept.` : "Schedule and its players removed.");
  } catch {
    toast("Couldn't remove everything. Try again.");
  }
}

/* ---------- events + admins ---------- */
export type EventDraft = { name: string; venue: string; date: string; start: string; end: string; courts: number; next: "import" | "event" };
/** With a parsed schedule, the event is created and the schedule imported in one go (impRun opens Courts). */
export async function createEvent(d: EventDraft, parsed?: Parsed, progress: (m: string) => void = () => {}) {
  const nid = uid();
  await db().set(paths.event(nid), {
    name: d.name, venue: d.venue, date: d.date, start: d.start, end: d.end, courts: d.courts, clubId: get().clubId || "main", code: uid(),
    courtNames: parsed?.courtNames || {}, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, createdAt: now(),
  });
  selectEvent(nid);
  if (parsed) {
    try {
      await impRun(parsed, { updateEvent: false, replace: false }, "", progress);
    } catch {
      set({ creating: false, tab: "event", flashImport: true });
      toast("Event created, but the import stopped partway. Upload the schedule again here.");
      return;
    }
    set({ creating: false });
    return;
  }
  set({ creating: false, tab: "event", flashImport: d.next === "import" });
  if (d.next === "import") toast("Event created. Now upload your schedule.");
  else toast(`“${d.name}” created`);
}
/** Deletes the open event and everything stored under it (the lists below are all loaded for it). */
export async function deleteEvent(progress: (m: string) => void) {
  const S = get(), id = E(), name = ev(S)?.name || "Event";
  const rm = (path: string, ids: { id: string }[]) => ids.map((x) => () => db().remove(`${path}/${x.id}`));
  try {
    await runChunks(S.photos.filter((p) => p.ref).map((p) => () => db().removeFile(p.ref!).catch(() => {})), "Removing photo files", progress);
    await runChunks([
      ...rm(col.gallery(), S.photos), ...rm(col.kudos(), S.kudos), ...rm(col.hearts(), S.hearts), ...rm(col.comments(), S.comments),
      ...rm(col.checkins(), S.checkins), ...rm(col.matches(), S.matches), ...rm(col.playoffs(), S.brackets.filter((b) => !b.virtual)),
      ...rm(col.sched(), S.sched), ...rm(col.divs(), S.divs), ...rm(col.roster(), S.roster),
    ], "Removing event data", progress);
    await db().remove(paths.event(id));
    // The events subscription then opens the next event, or the "create your first event" screen.
    selectEvent(get().events.find((x) => x.id !== id && clubOf(x) === get().clubId)?.id || null);
    toast(`“${name}” deleted`);
    return true;
  } catch {
    toast("Couldn't delete everything. Try again.");
    return false;
  }
}
/* ---------- clubs ----------
   The platform owner creates clubs and names their owners (by sign-in email). Club owners pick helpers from their
   players; a helper's access goes to the guest identity on the phone they checked in with, keyed by that uid. */
const club = () => get().clubId!;
export const memberKey = (email: string) => "e:" + email.trim().toLowerCase();

export async function createClub(name: string, ownerEmail: string, ownerName: string): Promise<string | null> {
  const id = uid();
  try {
    await db().set(`clubs/${id}`, { name: name.trim(), createdAt: now() });
    if (ownerEmail.trim()) await db().set(`members/${id}/${memberKey(ownerEmail)}`, { role: "owner", email: ownerEmail.trim().toLowerCase(), name: ownerName.trim(), at: now() });
    set({ clubId: id });
    selectEvent(null);
    toast(`“${name.trim()}” created`);
    return id;
  } catch {
    toast("Only the platform owner can create clubs.");
    return null;
  }
}
export async function renameClub(name: string) {
  try {
    // A club can have events but no club record (e.g. after clearing data): naming it creates the record.
    if (get().clubs.some((c) => c.id === club())) await db().update(`clubs/${club()}`, { name: name.trim() });
    else await db().set(`clubs/${club()}`, { name: name.trim() });
    toast("Club renamed");
    return true;
  } catch {
    toast("Only the club owner can rename the club.");
    return false;
  }
}
export async function addOwner(email: string, name: string) {
  try {
    await db().set(`members/${club()}/${memberKey(email)}`, { role: "owner", email: email.trim().toLowerCase(), name: name.trim(), at: now() });
    toast(`${name.trim() || email.trim()} is now a club owner`);
    return true;
  } catch {
    toast("Only the platform owner can add club owners.");
    return false;
  }
}
export async function addAdmin(p: Player) {
  if (!p.uid) return toast(`${p.name} needs to check in on their phone first.`);
  try {
    await db().set(`members/${club()}/${p.uid}`, { role: "admin", name: p.name, playerId: p.id, eventId: E(), at: now() });
    toast(`${p.name} is now an admin`);
  } catch {
    toast("Only the club owner can add admins.");
  }
}
export async function removeMember(id: string) {
  try {
    await db().remove(`members/${club()}/${id}`);
    toast("Removed");
  } catch {
    toast("Only the club owner can remove admins.");
  }
}
export async function organizerSignIn() {
  // Supabase asks for an email and password first; demo mode signs straight in.
  if (get().mode !== "local") {
    set({ signingIn: true, team: false, creating: false });
    window.scrollTo(0, 0);
    return;
  }
  try {
    await db().signInOrganizer();
  } catch {
    toast("Couldn't sign in. Try again.");
  }
}
/** Returns an error message, or null once signed in as an admin. */
export async function organizerPasswordSignIn(email: string, password: string): Promise<string | null> {
  try {
    await db().signInOrganizer(email, password);
  } catch (e) {
    const code = (e as { code?: string }).code || "";
    return code === "invalid_credentials" ? "Wrong email or password." : "Couldn't sign in. Check your connection and try again.";
  }
  // Club roles load just after sign-in; give them a few seconds.
  for (let i = 0; i < 40 && !get().unlocked; i++) await new Promise((r) => setTimeout(r, 100));
  if (!get().unlocked) {
    // Signed in, but not a club owner: go back to being a guest.
    await db().signOut().catch(() => {});
    return "This email isn't a club owner yet. Ask the Qsina team to add it.";
  }
  set({ signingIn: false });
  toast("Signed in");
  return null;
}
export async function organizerSignOut() {
  try {
    await db().signOut();
    set({ preview: false, team: false, creating: false });
    toast("Signed out");
  } catch {
    toast("Couldn't sign out.");
  }
}

/* ---------- photos ---------- */
async function shrink(file: File, max: number, q: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), "image/jpeg", q));
  } catch {
    return file;
  }
}
export async function uploadPhotos(who: string, files: FileList | File[], msg: (m: string) => void) {
  if (!who) return msg("Pick a player first.");
  const S = get(), left = 5 - S.photos.filter((p) => p.playerId === who).length;
  const take = [...files].filter((f) => f.type.startsWith("image/")).slice(0, left);
  if (!take.length) return msg(left <= 0 ? "All 5 photos are used." : "Those files aren't images.");
  // Demo mode keeps photos inside localStorage, so they're stored smaller.
  const [max, q] = db().kind === "local" ? [1000, 0.72] : [1600, 0.85];
  let ok = 0;
  for (const f of take) {
    msg(`Uploading ${ok + 1} of ${take.length}…`);
    try {
      const id = uid();
      const r = await db().upload(`${E()}/${id}.jpg`, await shrink(f, max, q));
      await db().set(`${col.gallery()}/${id}`, { url: r.url, ref: r.ref, playerId: who, uploaderUid: S.uid || null, createdAt: now() });
      ok++;
    } catch (err) {
      // The server only takes photos from admins, or players checked in on this device, 5 each.
      const e = err as { code?: string; message?: string; statusCode?: string };
      const denied = e?.code === "42501" || e?.statusCode === "403" || /row-level security|unauthorized/i.test(e?.message || "");
      return msg(denied ? `Photo ${ok + 1} wasn't allowed. Only players checked in on this phone can add photos, up to 5 each.`
        : `Photo ${ok + 1} didn't upload (${e?.code || "error"}). Try a smaller image.`);
    }
  }
  msg(`Added ${ok} ${ok === 1 ? "photo" : "photos"}.` + (files.length > left ? ` Only ${left} ${left === 1 ? "slot was" : "slots were"} left.` : ""));
}
export async function toggleHeart(pid: string, actor: string | null) {
  if (!actor) return toast("Check in first to heart photos.");
  const S = get(), docId = `${pid}_${actor}`, has = S.hearts.some((h) => h.id === docId);
  try {
    if (has) await db().remove(`${col.hearts()}/${docId}`);
    else await db().set(`${col.hearts()}/${docId}`, { photo: pid, from: actor, uid: S.uid || null, at: now() });
  } catch {
    toast("Couldn't save your heart.");
  }
}
export async function postComment(photo: string, actor: string, text: string) {
  try {
    await db().set(`${col.comments()}/${uid()}`, { photo, from: actor, uid: get().uid || null, text: text.slice(0, 280), at: now() });
    return true;
  } catch {
    toast("Couldn't post your comment.");
    return false;
  }
}
export async function delComment(id: string) {
  try { await db().remove(`${col.comments()}/${id}`); } catch { toast("Couldn't delete that comment."); }
}
export async function delPhoto(id: string) {
  const p = get().photos.find((x) => x.id === id);
  try {
    await db().remove(`${col.gallery()}/${id}`);
    if (p?.ref) db().removeFile(p.ref).catch(() => {});
    set({ viewPhoto: null });
    toast("Photo deleted");
  } catch {
    toast("Couldn't delete that photo.");
  }
}

/** Saves a file: the share sheet on phones (so photos land in the camera roll), a download elsewhere. */
export async function saveBlob(filename: string, blob: Blob) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (matchMedia("(pointer:coarse)").matches && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function downloadPhoto(pid: string) {
  const S = get(), p = S.photos.find((x) => x.id === pid);
  const src = p ? photoSrc(S, p) : "";
  if (!p || !src) return;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error("fetch");
    const blob = await res.blob(), ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const who = (pName(S, p.playerId).split(" ")[0] || "photo").toLowerCase().replace(/[^a-z0-9]/g, "");
    await saveBlob(`qsina-${who}-${p.id}.${ext}`, blob);
  } catch {
    toast("Couldn't download that photo. Try again in a moment.");
  }
}

/* ---------- saving many photos ---------- */
export type PhotoFile = { id: string; file: File };
/** Phones save through the share sheet ("Save Images" lands in the camera roll); everything else gets a .zip. */
export const canShareFiles = () => {
  if (typeof window === "undefined" || !matchMedia("(pointer:coarse)").matches) return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return !!nav.canShare?.({ files: [new File([new Blob(["x"], { type: "image/jpeg" })], "x.jpg", { type: "image/jpeg" })] });
};

/** "qsina-mark-1.jpg", numbered per player across the whole list, so batches never repeat a name. */
export function photoNames(list: { id: string; playerId: string }[]) {
  const S = get(), seen: Record<string, number> = {}, names: Record<string, string> = {};
  for (const p of list) {
    const who = (pName(S, p.playerId).split(" ")[0] || "photo").toLowerCase().replace(/[^a-z0-9]/g, "") || "photo";
    seen[who] = (seen[who] || 0) + 1;
    names[p.id] = `qsina-${who}-${seen[who]}`;
  }
  return names;
}

/** Downloads photos four at a time, in their original order. Ones that fail are skipped and counted. */
export async function fetchPhotoFiles(list: { id: string; url?: string; ref?: string }[], names: Record<string, string>, progress: (done: number) => void) {
  const out: (PhotoFile | null)[] = new Array(list.length).fill(null);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++, p = list[i];
      try {
        const src = photoSrc(get(), p);
        if (!src) throw new Error("no link yet");
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch");
        const blob = await res.blob(), ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        out[i] = { id: p.id, file: new File([blob], `${names[p.id] || p.id}.${ext}`, { type: blob.type || "image/jpeg" }) };
      } catch {}
      progress(++done);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const files = out.filter((x): x is PhotoFile => !!x);
  return { files, failed: list.length - files.length };
}

/** Opens the share sheet with the photos. False if the person closed it without saving. */
export async function sharePhotoFiles(files: PhotoFile[]) {
  try {
    await navigator.share({ files: files.map((f) => f.file) });
    return true;
  } catch (e) {
    if ((e as DOMException).name !== "AbortError") toast("Couldn't open the share sheet. Try fewer photos.");
    return false;
  }
}

/** One .zip download. JPEGs are already compressed, so they're stored as they are. */
export async function zipPhotoFiles(files: PhotoFile[], zipName: string) {
  const { zipSync } = await import("fflate");
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.file.name] = [new Uint8Array(await f.file.arrayBuffer()), { level: 0 }];
  const zip = zipSync(entries);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** Photos this device already saved, so "only new" can skip them next time. */
export const savedPhotos = () => new Set(ls.get<string[]>("saved." + get().eventId, []));
export const markSaved = (ids: string[]) => {
  const all = savedPhotos();
  ids.forEach((id) => all.add(id));
  ls.set("saved." + get().eventId, [...all]);
};

/* ---------- test alert ---------- */
export function testAlert() {
  const S = get(), m = me(S);
  if (!m) return;
  const anyone = S.players.filter((p) => p.id !== m.id);
  const match: Match = { id: "", court: 3, teamA: [m.id, anyone[0]?.id || m.id], teamB: [anyone[1]?.id || m.id, anyone[2]?.id || m.id], category: "mixed", level: "any", round: 1, status: "live" };
  set({ upnext: { match, test: true } });
}
