"use client";
import { loadBackend, backend } from "./backend";
import { ownerEmail } from "./backend/types";
import { localOwnerEmail } from "./backend/local";
import { get, initialEventState, ls, set, type AppState } from "./store";
import { clubEvents, clubOf, normBr, normDiv, paths, todayISO } from "./model";
import type { Checkin, Club, Member, Player } from "./types";

let unsubs: (() => void)[] = [];
const memberSubs = new Map<string, () => void>();
let booted = false;

function mergePlayers(roster: Player[], checkins: Checkin[]) {
  const ci = Object.fromEntries(checkins.map((c) => [c.id, c]));
  return roster.map((p) => {
    const c = ci[p.id];
    return c ? { ...p, checkedIn: true, checkedInAt: c.at || p.checkedInAt, uid: c.uid || p.uid } : p;
  });
}

/* Platform owner = signed in with NEXT_PUBLIC_OWNER_EMAIL (every club). Club owners sign in with an email on
   their club's member list ("e:{email}"); helpers are on it by the guest uid of the phone they checked in with. */
export function recomputeRole() {
  const S = get(), was = S.unlocked;
  const email = S.user && !S.user.anonymous ? S.user.email : null;
  const owner = S.mode === "local" ? localOwnerEmail() : ownerEmail();
  const isOwner = !!email && !!owner && email === owner;
  const myClubs: Record<string, Member["role"]> = {};
  for (const [club, list] of Object.entries(S.members)) {
    const mine = list.filter((m) => (S.uid && m.id === S.uid) || (email && m.id === "e:" + email));
    if (mine.length) myClubs[club] = mine.some((m) => m.role === "owner") ? "owner" : "admin";
  }
  const canRun = (c: string | null) => !!c && (isOwner || !!myClubs[c]);
  // The platform owner runs every club, including one whose club record is missing but still has events.
  const runs = isOwner ? [...new Set([...S.clubs.map((c) => c.id), ...S.events.map(clubOf)])] : Object.keys(myClubs);
  // The club on screen: the open event's, else the one picked, else the first they run.
  const e = S.events.find((x) => x.id === S.eventId);
  let clubId = e ? clubOf(e) : canRun(S.clubId) ? S.clubId : runs[0] || null;
  // Reopened on another club's event (not from its QR code): go back to a club they run.
  let jump: string | null | undefined;
  if (e && !canRun(clubId) && !S.fromQR && runs.length) {
    clubId = runs[0];
    jump = S.events.find((x) => clubOf(x) === clubId)?.id || null;
  }
  const unlocked = isOwner || canRun(clubId);
  const patch: Partial<AppState> = { isOwner, myClubs, clubId, unlocked };
  if (unlocked && !was && S.fromQR) patch.preview = true;
  if (!unlocked) Object.assign(patch, { preview: false, team: false, creating: false });
  set(patch);
  if (jump !== undefined) selectEvent(jump);
  // Signed in with nothing open: open their newest event. Clubs and events load separately after sign-in,
  // so this runs again as each arrives, not just on the first unlock.
  else if (unlocked && !S.eventId && !S.creating) {
    // A club they picked with no events stays empty (to create one); otherwise any club they run will do.
    const first = clubEvents(get())[0] || (canRun(S.clubId) ? undefined : S.events.find((x) => runs.includes(clubOf(x))));
    if (first) selectEvent(first.id);
  }
}

/** Each club's member list, kept live, so roles update the moment someone is added or removed. */
function watchMembers(clubs: Club[]) {
  const b = backend(), ids = new Set(clubs.map((c) => c.id));
  for (const [id, off] of memberSubs) if (!ids.has(id)) { off(); memberSubs.delete(id); }
  for (const id of ids) {
    if (memberSubs.has(id)) continue;
    memberSubs.set(id, b.subscribe("members/" + id, (docs) => {
      set({ members: { ...get().members, [id]: docs as Member[] } });
      recomputeRole();
    }, () => {}));
  }
}

export async function boot() {
  if (booted) return;
  booted = true;
  // Check-in links are /in/{code}; QR codes printed before that use /#in-{code}.
  const h = location.hash.slice(1), path = location.pathname.match(/^\/in\/([a-z0-9]+)\/?$/i);
  if (path) set({ eventId: path[1].toLowerCase(), fromQR: true });
  else if (h.startsWith("in-")) set({ eventId: h.slice(3), fromQR: true });
  let b;
  try {
    b = await loadBackend();
  } catch {
    set({ ready: true, offline: true });
    return;
  }
  set({ mode: b.kind });
  b.onAuth((u) => {
    set({ user: u, uid: u?.uid || null });
    recomputeRole();
  });
  try {
    await b.ensureGuest();
  } catch {
    set({ ready: true, offline: true });
    return;
  }
  if (!get().eventId) set({ eventId: ls.get<string | null>("lastEvent", null) });
  // Join first, so the event is readable by the time its data loads. A QR link carries the check-in code;
  // a remembered event is an id (already joined, so it's readable either way).
  const start = get().eventId;
  if (start) {
    const id = await b.join(start).catch(() => null);
    if (id && id !== start) set({ eventId: id });
  }
  b.subscribe("clubs", (docs) => {
    const clubs = (docs as Club[]).sort((a, c) => (a.name || "").localeCompare(c.name || ""));
    set({ clubs });
    watchMembers(clubs);
    recomputeRole();
  }, () => {});
  b.subscribe("events", (docs) => {
    const events = (docs as AppState["events"]).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const S = get();
    set({ events, ready: true });
    let next = events.some((e) => e.id === S.eventId) ? S.eventId : null;
    // A player reopening the app on a later day starts at Scan, not on last week's event ("Back to" it is offered there).
    if (next && !S.unlocked && !S.fromQR && (events.find((e) => e.id === next)!.date || "") < todayISO()) next = null;
    if (!next && S.unlocked && !S.fromQR) next = events.find((e) => clubOf(e) === S.clubId)?.id || null;
    // A Home Screen app opens at "/" with its own storage. With exactly one event today, open it;
    // with more (several clubs playing), players use their event's QR code or link.
    if (!next && !S.unlocked) {
      const today = events.filter((e) => e.date === todayISO());
      if (today.length === 1) next = today[0].id;
    }
    if (next !== S.eventId || !unsubs.length) selectEvent(next);
    else recomputeRole();
  }, () => set({ ready: true, offline: !get().events.length }));

  setInterval(refreshPhotoUrls, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshPhotoUrls(); });
  window.addEventListener("hashchange", async () => {
    const h = location.hash.slice(1);
    if (h.startsWith("in-")) {
      const id = (await backend().join(h.slice(3)).catch(() => null)) || h.slice(3);
      set({ fromQR: true, team: false, preview: !!get().unlocked });
      selectEvent(id);
    }
  });
}

export function selectEvent(id: string | null) {
  unsubs.forEach((u) => u());
  unsubs = [];
  set({ eventId: id, ...initialEventState, loaded: {} });
  if (id) ls.set("lastEvent", id);
  if (!id) return recomputeRole();
  const b = backend();
  const sub = (path: string, key: keyof AppState) =>
    unsubs.push(b.subscribe(path, (docs) => {
      const S = get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = { [key]: docs, loaded: { ...S.loaded, [key]: true } };
      if (key === "brackets") patch.brackets = docs.map(normBr);
      if (key === "divs") patch.divs = docs.map(normDiv).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (key === "photos") queueMicrotask(refreshPhotoUrls);
      if (key === "roster" || key === "checkins") {
        patch.players = mergePlayers(key === "roster" ? (docs as Player[]) : S.roster, key === "checkins" ? (docs as Checkin[]) : S.checkins);
      }
      set(patch);
    }, () => {}));
  sub(paths.roster(id), "roster");
  sub(paths.checkins(id), "checkins");
  sub(paths.matches(id), "matches");
  sub(paths.gallery(id), "photos");
  sub(paths.kudos(id), "kudos");
  sub(paths.hearts(id), "hearts");
  sub(paths.comments(id), "comments");
  sub(paths.playoffs(id), "brackets");
  sub(paths.sched(id), "sched");
  sub(paths.divs(id), "divs");
  // Last, since it may switch to another event itself (e.g. back to a club this person runs).
  recomputeRole();
}

/** Opens an event from the check-in code printed under its QR code. False if no event has that code. */
export async function joinByCode(raw: string) {
  const code = raw.trim().toLowerCase().replace(/^event\s+/, "").replace(/[^a-z0-9]/g, "");
  if (!code) return false;
  const id = await backend().join(code).catch(() => null);
  if (!id || !get().events.some((e) => e.id === id)) return false;
  set({ fromQR: true, team: false, preview: !!get().unlocked });
  selectEvent(id);
  return true;
}

/** Reopen an event this phone already joined (the "Back to" link on the Scan screen). */
export function openEvent(id: string) {
  set({ fromQR: true, team: false });
  selectEvent(id);
}

/** Switch the admin screens to another club the person runs, opening its newest event (or none yet). */
export function switchClub(id: string) {
  set({ clubId: id, fromQR: false, team: false, creating: false });
  selectEvent(get().events.find((e) => clubOf(e) === id)?.id || null);
}

/* Private photos are shown through signed links that last 6 hours. Sign any photo without a fresh link (none yet,
   or older than 5 hours), in batches; runs when the gallery changes, when the app comes back, and every 30 minutes. */
const RESIGN_AFTER = 5 * 3600 * 1000;
let signing = false;
export async function refreshPhotoUrls() {
  const S = get();
  if (S.mode !== "supabase" || signing) return;
  const now = Date.now();
  const need = [...new Set(S.photos.map((p) => p.ref).filter((r): r is string => !!r && !(now - (S.photoUrls[r]?.at || 0) < RESIGN_AFTER)))];
  if (!need.length) return;
  signing = true;
  try {
    for (let i = 0; i < need.length; i += 100) {
      const urls = await backend().signPhotos(need.slice(i, i + 100));
      const at = Date.now();
      set({ photoUrls: { ...get().photoUrls, ...Object.fromEntries(Object.entries(urls).map(([r, url]) => [r, { url, at }])) } });
    }
  } catch {
    // Offline or not allowed: keep the links we have and try again next time.
  } finally {
    signing = false;
  }
}
