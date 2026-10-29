"use client";
import { ownerEmail, type AuthUser, type Backend, type Data, type Doc } from "./types";

/* Demo backend: everything lives in this browser's localStorage. Other tabs on the same
   device stay in sync through BroadcastChannel, which is enough to try the admin and
   player views side by side. Use Supabase for a real event. */

type Store = Record<string, Record<string, Data>>;
type Move = { uid: string; code: string; tries: number; expires: number };
const KEY = "ourkitchen.localdb";
const UKEY = "ourkitchen.localuser";
const MOVES = "_moves";

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    throw Object.assign(new Error("This device's storage is full."), { code: "quota" });
  }
}
const split = (docPath: string) => {
  const i = docPath.lastIndexOf("/");
  return [docPath.slice(0, i), docPath.slice(i + 1)] as const;
};
const clean = (d: Data) => JSON.parse(JSON.stringify(d)) as Data;

export function createLocalBackend(): Backend {
  const subs = new Map<string, Set<(docs: Doc[]) => void>>();
  const authSubs = new Set<(u: AuthUser | null) => void>();
  const chan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ourkitchen-db") : null;

  const docsOf = (s: Store, col: string): Doc[] => Object.entries(s[col] || {}).map(([id, d]) => ({ id, ...d }));
  const emit = (cols: string[]) => {
    const s = read();
    for (const c of cols) subs.get(c)?.forEach((cb) => cb(docsOf(s, c)));
  };
  const changed = (col: string) => {
    emit([col]);
    chan?.postMessage({ t: "db", col });
  };
  chan?.addEventListener("message", (e) => {
    if (e.data?.t === "db") emit([e.data.col]);
    if (e.data?.t === "auth") authSubs.forEach((cb) => cb(getUser()));
  });

  const getUser = (): AuthUser | null => {
    try {
      return JSON.parse(localStorage.getItem(UKEY) || "null");
    } catch {
      return null;
    }
  };
  const setUser = (u: AuthUser | null) => {
    if (u) localStorage.setItem(UKEY, JSON.stringify(u));
    else localStorage.removeItem(UKEY);
    authSubs.forEach((cb) => cb(u));
    chan?.postMessage({ t: "auth" });
  };
  const rid = () => Math.random().toString(36).slice(2, 12);

  return {
    kind: "local",
    subscribe(col, cb) {
      if (!subs.has(col)) subs.set(col, new Set());
      subs.get(col)!.add(cb);
      queueMicrotask(() => cb(docsOf(read(), col)));
      return () => subs.get(col)?.delete(cb);
    },
    async set(path, data) {
      const [col, id] = split(path);
      const s = read();
      s[col] = { ...(s[col] || {}), [id]: clean(data) };
      write(s);
      changed(col);
    },
    async update(path, data) {
      const [col, id] = split(path);
      const s = read();
      if (!s[col]?.[id]) throw Object.assign(new Error("Not found"), { code: "not-found" });
      s[col][id] = { ...s[col][id], ...clean(data) };
      write(s);
      changed(col);
    },
    async remove(path) {
      const [col, id] = split(path);
      const s = read();
      if (s[col]) delete s[col][id];
      write(s);
      changed(col);
    },
    onAuth(cb) {
      authSubs.add(cb);
      queueMicrotask(() => cb(getUser()));
      return () => authSubs.delete(cb);
    },
    async ensureGuest() {
      if (!getUser()) setUser({ uid: "guest-" + rid(), email: null, name: null, anonymous: true });
    },
    async signInOrganizer() {
      // No real accounts in demo mode: the organizer sign-in makes this browser the super admin.
      const prev = getUser();
      // Demo data from before clubs: give it a first club.
      const s = read();
      if (!Object.keys(s.clubs || {}).length) { s.clubs = { main: { name: "My club", createdAt: new Date().toISOString() } }; write(s); changed("clubs"); }
      setUser({ uid: prev && !prev.anonymous ? prev.uid : "org-" + rid(), email: localOwnerEmail(), name: "Organizer", anonymous: false });
    },
    async signOut() {
      setUser({ uid: "guest-" + rid(), email: null, name: null, anonymous: true });
    },
    async upload(_path, blob) {
      const url = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsDataURL(blob);
      });
      return { url, ref: "" };
    },
    async removeFile() {},
    // Demo photos are data URLs kept with the gallery entry, so there's nothing to sign.
    async signPhotos() {
      return {};
    },
    // Demo data lives on this device, so there's nothing to unlock; just check the event exists.
    async join(code) {
      const c = code.trim().toLowerCase(), events = read().events || {};
      return Object.keys(events).find((id) => String(events[id].code || id).toLowerCase() === c) || null;
    },
    // Demo mode mirrors the Supabase functions, so the flow can be tried in two tabs.
    async moveCode(path) {
      const [col, id] = split(path), s = read(), u = getUser();
      if (!u || s[col]?.[id]?.uid !== u.uid) throw Object.assign(new Error("Not your check-in"), { code: "42501" });
      const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      s[MOVES] = { ...(s[MOVES] || {}), [path]: { uid: u.uid, code, tries: 0, expires: Date.now() + 10 * 60000 } };
      write(s);
      return code;
    },
    async moveCheckin(path, code) {
      const [col, id] = split(path), s = read(), u = getUser(), m = s[MOVES]?.[path] as Move | undefined;
      if (!u || !m || m.expires < Date.now()) return false;
      if (m.code !== code.trim()) {
        if (m.tries >= 4) delete s[MOVES][path]; else m.tries++;
        write(s);
        return false;
      }
      if (s[col]?.[id]?.uid === m.uid) s[col][id] = { ...s[col][id], uid: u.uid };
      // A club admin stays an admin on the new phone.
      const clubs: string[] = [];
      if (m.uid !== u.uid) for (const c of Object.keys(s).filter((k) => k.startsWith("members/") && s[k][m.uid])) {
        s[c][u.uid] = s[c][m.uid];
        delete s[c][m.uid];
        clubs.push(c);
      }
      delete s[MOVES][path];
      write(s);
      changed(col);
      clubs.forEach(changed);
      return true;
    },
  };
}

export const localOwnerEmail = () => ownerEmail() || "organizer@demo.local";
