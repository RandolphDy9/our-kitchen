"use client";
import { createClient, type RealtimeChannel, type User } from "@supabase/supabase-js";
import type { AuthUser, Backend, Data, Doc } from "./types";

/* Supabase keeps the same document model as before: one `docs` table keyed by
   (col, id) with a jsonb `data` column (see supabase/schema.sql). A collection path like
   "events/abc/matches" is the `col`; the last segment of a doc path is the `id`.
   One realtime channel streams every change the user may read; rows are routed by col. */

type Row = { col: string; id: string; data: Data };
type Sub = { docs: Map<string, Doc>; cbs: Set<(d: Doc[]) => void>; errs: Set<(e: unknown) => void> };

const BUCKET = "photos";
/** Signed photo links last 6 hours; the app renews them after 5 (see refreshPhotoUrls). */
const PHOTO_LINK_SECONDS = 6 * 3600;
const CACHE = "ourkitchen.cache.";
const split = (docPath: string) => {
  const i = docPath.lastIndexOf("/");
  return [docPath.slice(0, i), docPath.slice(i + 1)] as const;
};
const toUser = (u?: User | null): AuthUser | null =>
  u ? { uid: u.id, email: u.email?.toLowerCase() || null, name: u.user_metadata?.full_name || u.user_metadata?.name || null, anonymous: !!u.is_anonymous } : null;
const fail = (e: { message: string; code?: string } | null) => {
  if (e) throw Object.assign(new Error(e.message), { code: e.code });
};

export function createSupabaseBackend(): Backend {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  const subs = new Map<string, Sub>();
  let channel: RealtimeChannel | null = null;

  const emit = (col: string) => {
    const s = subs.get(col);
    if (!s) return;
    const list = [...s.docs.values()];
    s.cbs.forEach((cb) => cb(list));
    // Last-known data, so the app still opens at a venue with no signal.
    try { localStorage.setItem(CACHE + col, JSON.stringify(list)); } catch {}
  };
  const load = async (col: string) => {
    const { data, error } = await sb.from("docs").select("id,data").eq("col", col);
    const s = subs.get(col);
    if (!s) return;
    if (error) return s.errs.forEach((f) => f(error));
    s.docs = new Map((data as Row[]).map((r) => [r.id, { id: r.id, ...r.data }]));
    emit(col);
  };
  const refetchAll = () => subs.forEach((_s, col) => load(col));

  const ensureChannel = () => {
    if (channel) return;
    channel = sb.channel("docs")
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as Partial<Row>;
        const s = row.col ? subs.get(row.col) : undefined;
        // Just made a club admin or owner: the club itself only becomes readable now.
        if (!s && row.col?.startsWith("members/") && p.eventType === "INSERT") load("clubs");
        if (!s || !row.id) return;
        if (p.eventType === "DELETE") s.docs.delete(row.id);
        else s.docs.set(row.id, { id: row.id, ...(row.data || {}) });
        emit(row.col!);
      })
      // (Re)subscribed: catch up on anything missed while the socket was down.
      .subscribe((status) => { if (status === "SUBSCRIBED") refetchAll(); });
    // Phones suspend sockets in the background; refresh when the app comes back.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refetchAll(); });
    window.addEventListener("online", refetchAll);
  };

  return {
    kind: "supabase",
    subscribe(col, cb, onErr) {
      let s = subs.get(col);
      const fresh = !s;
      if (!s) {
        s = { docs: new Map(), cbs: new Set(), errs: new Set() };
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE + col) || "null") as Doc[] | null;
          if (cached) s.docs = new Map(cached.map((d) => [d.id, d]));
        } catch {}
        subs.set(col, s);
      }
      s.cbs.add(cb);
      if (onErr) s.errs.add(onErr);
      if (s.docs.size) queueMicrotask(() => cb([...s!.docs.values()]));
      ensureChannel();
      if (fresh) load(col);
      return () => {
        s!.cbs.delete(cb);
        if (onErr) s!.errs.delete(onErr);
        if (!s!.cbs.size) subs.delete(col);
      };
    },
    async set(path, data) {
      const [col, id] = split(path);
      const { error } = await sb.from("docs").upsert({ col, id, data: JSON.parse(JSON.stringify(data)) });
      fail(error);
    },
    async update(path, data) {
      const [col, id] = split(path);
      const { error } = await sb.rpc("doc_merge", { p_col: col, p_id: id, p_data: JSON.parse(JSON.stringify(data)) });
      fail(error);
    },
    async remove(path) {
      const [col, id] = split(path);
      const { error } = await sb.from("docs").delete().eq("col", col).eq("id", id);
      fail(error);
    },
    onAuth(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => {
        cb(toUser(session?.user));
        // Re-read with the new identity's permissions (e.g. after organizer sign-in).
        if (_e === "SIGNED_IN" || _e === "SIGNED_OUT") refetchAll();
      });
      return () => data.subscription.unsubscribe();
    },
    async ensureGuest() {
      const { data } = await sb.auth.getSession();
      if (data.session) return;
      const { error } = await sb.auth.signInAnonymously();
      fail(error);
    },
    async signInOrganizer(email = "", password = "") {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      fail(error);
    },
    async signOut() {
      await sb.auth.signOut();
      const { error } = await sb.auth.signInAnonymously();
      fail(error);
    },
    async upload(path, blob) {
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      fail(error);
      // The bucket is private: photos are shown through signed links (signPhotos), so there's no lasting url.
      return { url: "", ref: path };
    },
    async signPhotos(refs) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(refs, PHOTO_LINK_SECONDS);
      fail(error);
      return Object.fromEntries((data || []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl]] : [])));
    },
    async removeFile(path) {
      if (!path) return;
      const { error } = await sb.storage.from(BUCKET).remove([path]);
      fail(error);
    },
    async join(code) {
      const { data, error } = await sb.rpc("ok_join", { p_code: code });
      fail(error);
      // Everything about the event is readable now.
      if (data) await Promise.all([...subs.keys()].map(load));
      return (data as string | null) || null;
    },
    async moveCode(path) {
      const [col, id] = split(path);
      const { data, error } = await sb.rpc("ok_move_code", { p_col: col, p_id: id });
      fail(error);
      return String(data);
    },
    async moveCheckin(path, code) {
      const [col, id] = split(path);
      const { data, error } = await sb.rpc("ok_move_checkin", { p_col: col, p_id: id, p_code: code });
      fail(error);
      return data === true;
    },
  };
}
