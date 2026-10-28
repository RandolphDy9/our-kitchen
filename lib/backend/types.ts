/* Data layout (same as the original artifact)
   events/{eventId}                       admin only
   events/{eventId}/matches/{matchId}     admin only (matchups + scores)
   roster/{eventId}/players/{playerId}    admin (imported from the schedule)
   checkins/{eventId}/in/{playerId}       players check themselves in
   gallery/{eventId}/photos/{photoId}     players add their photos
   photolikes/{eventId}/h/{id}            hearts
   photocomments/{eventId}/c/{id}         comments
   kudos/{eventId}/given/{id}             reactions between players
   playoffs/{eventId}/b/{bracketId}       admin-built brackets
   sched/{eventId}/m/{id}, sched/{eventId}/d/{id}   imported schedule + divisions
   roles/{uid}                            admins picked by the super admin (the guest uid that checked them in)
   On Supabase each collection path is the `col` of a row in the `docs` table. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = { id: string } & Record<string, any>;
export type Data = Record<string, unknown>;

export type AuthUser = {
  uid: string;
  email: string | null;
  name: string | null;
  anonymous: boolean;
};

export interface Backend {
  kind: "supabase" | "local";
  subscribe(collectionPath: string, cb: (docs: Doc[]) => void, onErr?: (e: unknown) => void): () => void;
  set(docPath: string, data: Data): Promise<void>;
  update(docPath: string, data: Data): Promise<void>;
  remove(docPath: string): Promise<void>;
  onAuth(cb: (u: AuthUser | null) => void): () => void;
  /** Players get a silent guest identity so check-ins and reactions are attributable. */
  ensureGuest(): Promise<void>;
  /** Supabase: email + password of an account made in the dashboard. Demo mode ignores them. */
  signInOrganizer(email?: string, password?: string): Promise<void>;
  signOut(): Promise<void>;
  upload(path: string, blob: Blob): Promise<{ url: string; ref: string }>;
  removeFile(ref: string): Promise<void>;
}

export const ownerEmail = () => (process.env.NEXT_PUBLIC_OWNER_EMAIL || "").trim().toLowerCase();
export const ownerName = () => (process.env.NEXT_PUBLIC_OWNER_NAME || "").trim() || "Super admin";
