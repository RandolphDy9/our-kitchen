export type Cat = "mens" | "womens" | "mixed";
export type Gender = "M" | "F" | "";
export type Level = "low" | "high" | "any";

export type EventDoc = {
  id: string; name: string; venue?: string; date: string; start: string; end: string; courts: number;
  createdAt?: string; reactions?: Reaction[]; courtNames?: Record<string, string>;
  /** IANA time zone the date and times are in (the organizer's, set on create). */
  tz?: string;
  /** The club running it. Events from before clubs existed belong to the first club ("main"). */
  clubId?: string;
  /** Check-in code in its QR link and printed under it. Separate from the id, which isn't secret. Older events use their id. */
  code?: string;
};
export type Player = {
  id: string; name: string; gender?: Gender; level: Level; checkedIn?: boolean; checkedInAt?: string | null;
  uid?: string | null; demo?: boolean; imported?: boolean; createdAt?: string;
};
export type Match = {
  id: string; teamA: string[]; teamB: string[]; category: Cat; level: Level; court: number | null; round: number;
  status: "live" | "done" | "void"; winner?: "A" | "B" | null; scoreA?: number | null; scoreB?: number | null;
  createdAt?: string; endedAt?: string | null;
  playoff?: { b: string; m: string; label: string }; sched?: { s: string; label: string; div: string };
};
export type Reaction = { id: string; emoji: string; label: string };
export type Kudos = { id: string; from: string; to: string; r: string; uid?: string | null; at?: string };
export type Photo = { id: string; url?: string; assetId?: string; ref?: string; playerId: string; uploaderUid?: string | null; createdAt?: string };
export type Heart = { id: string; photo: string; from: string; uid?: string | null; at?: string };
export type Comment = { id: string; photo: string; from: string; uid?: string | null; text: string; at?: string };
export type Checkin = { id: string; at?: string; uid?: string | null; by?: string };
/** A group that runs its own events. Events carry its id as clubId. */
export type Club = { id: string; name: string; createdAt?: string };
/** members/{clubId}/{id}: id is "e:{email}" for people who sign in with email, or a phone's guest uid for helpers. */
export type Member = { id: string; role: "owner" | "admin"; name?: string; email?: string; playerId?: string; eventId?: string; at?: string };

/* Brackets */
export type Ref = { seed?: number; w?: string; l?: string; team?: number; ph?: string };
export type PlanItem = { id: string; r: string; short: string; a: Ref; b: Ref; sid?: string; time?: string; court?: number };
export type Res = { w: "a" | "b"; sa: number | null; sb: number | null; at?: string; match?: string };
export type LiveRef = { court: number; match: string };
export type Bracket = {
  id: string; name: string; category?: Cat; level?: Level; size: number; teams: string[][];
  res: Record<string, Res>; live: Record<string, LiveRef>; createdAt?: string;
  plan?: PlanItem[]; virtual?: boolean; div?: Div; pools?: (string | null)[];
};

/* Imported schedule */
export type SRef = { t?: string; pool?: string; rank?: number; w?: string; l?: string };
export type Team = { id: string; players: string[]; pool: string | null; a?: string; b?: string; label?: string };
export type Div = { id: string; cat: Cat; level: string; pools: string[]; teams: Team[]; order?: number };
export type Sched = {
  id: string; div: string; stage: "pool" | "qf" | "sf" | "gold" | "bronze"; key: string | null; pool: string | null;
  slot: number; time: string; end: string; court: number; a: SRef; b: SRef; label: string;
  res: Res | null; live: LiveRef | null;
};
