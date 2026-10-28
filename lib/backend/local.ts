"use client";
import { ownerEmail, type AuthUser, type Backend, type Data, type Doc } from "./types";

/* Demo backend: everything lives in this browser's localStorage. Other tabs on the same
   device stay in sync through BroadcastChannel, which is enough to try the admin and
   player views side by side. Use Supabase for a real event. */

type Store = Record<string, Record<string, Data>>;
const KEY = "ourkitchen.localdb";
const UKEY = "ourkitchen.localuser";

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
  };
}

export const localOwnerEmail = () => ownerEmail() || "organizer@demo.local";
