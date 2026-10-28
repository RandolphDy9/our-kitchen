"use client";
import { loadBackend, backend } from "./backend";
import { ownerEmail } from "./backend/types";
import { localOwnerEmail } from "./backend/local";
import { get, initialEventState, ls, set, type AppState } from "./store";
import { normBr, normDiv, paths } from "./model";
import type { Checkin, Player } from "./types";

let unsubs: (() => void)[] = [];
let booted = false;

function mergePlayers(roster: Player[], checkins: Checkin[]) {
  const ci = Object.fromEntries(checkins.map((c) => [c.id, c]));
  return roster.map((p) => {
    const c = ci[p.id];
    return c ? { ...p, checkedIn: true, checkedInAt: c.at || p.checkedInAt, uid: c.uid || p.uid } : p;
  });
}

/* Super admin = signed in with NEXT_PUBLIC_OWNER_EMAIL. Admins = guest uids the super admin picked. */
export function recomputeRole() {
  const S = get(), was = S.unlocked;
  const email = S.user && !S.user.anonymous ? S.user.email : null;
  const owner = S.mode === "local" ? localOwnerEmail() : ownerEmail();
  const isOwner = !!email && !!owner && email === owner;
  const assigned = !!S.uid && S.roles.some((r) => r.id === S.uid);
  const unlocked = isOwner || assigned;
  const patch: Partial<AppState> = { isOwner, assigned, unlocked };
  if (unlocked && !was && S.fromQR) patch.preview = true;
  if (!unlocked) Object.assign(patch, { preview: false, team: false, creating: false });
  set(patch);
  if (unlocked && !was && !S.eventId && S.events.length && !S.fromQR) selectEvent(S.events[0].id);
}

export async function boot() {
  if (booted) return;
  booted = true;
  const h = location.hash.slice(1);
  if (h.startsWith("in-")) set({ eventId: h.slice(3), fromQR: true });
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
  b.subscribe("roles", (docs) => { set({ roles: docs as AppState["roles"] }); recomputeRole(); }, () => {});
  b.subscribe("events", (docs) => {
    const events = (docs as AppState["events"]).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const S = get();
    set({ events, ready: true });
    let next = events.some((e) => e.id === S.eventId) ? S.eventId : null;
    if (!next && S.unlocked && !S.fromQR) next = events[0]?.id || null;
    if (next !== S.eventId || !unsubs.length) selectEvent(next);
  }, () => set({ ready: true, offline: !get().events.length }));

  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (h.startsWith("in-")) {
      set({ fromQR: true, team: false, preview: !!get().unlocked });
      selectEvent(h.slice(3));
    }
  });
}

export function selectEvent(id: string | null) {
  unsubs.forEach((u) => u());
  unsubs = [];
  set({ eventId: id, ...initialEventState, loaded: {} });
  if (id) ls.set("lastEvent", id);
  if (!id) return;
  const b = backend();
  const sub = (path: string, key: keyof AppState) =>
    unsubs.push(b.subscribe(path, (docs) => {
      const S = get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = { [key]: docs, loaded: { ...S.loaded, [key]: true } };
      if (key === "brackets") patch.brackets = docs.map(normBr);
      if (key === "divs") patch.divs = docs.map(normDiv).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
}
