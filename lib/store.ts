"use client";
import { create } from "zustand";
import type { AuthUser } from "./backend";
import type {
  Bracket, Checkin, Club, Comment, Div, EventDoc, Heart, Kudos, Match, Member, Photo, Player, Sched,
} from "./types";

export type Tab = "event" | "players" | "courts" | "bracket" | "results" | "photos" | "people";
export type CView = "schedule" | "pools" | "board";

export type AppState = {
  // connection + identity
  ready: boolean; offline: boolean; mode: "supabase" | "local" | null;
  /** isOwner: the platform owner (every club). myClubs: this person's role in each club they help run.
      unlocked: they can run the club of what's on screen (clubId). */
  user: AuthUser | null; uid: string | null; isOwner: boolean; myClubs: Record<string, Member["role"]>; unlocked: boolean; preview: boolean;
  clubs: Club[]; members: Record<string, Member[]>; clubId: string | null;
  // data
  events: EventDoc[]; eventId: string | null; fromQR: boolean;
  roster: Player[]; checkins: Checkin[]; players: Player[]; matches: Match[]; photos: Photo[];
  kudos: Kudos[]; hearts: Heart[]; comments: Comment[]; brackets: Bracket[]; sched: Sched[]; divs: Div[];
  /** Signed links for private photos, by storage path, and when they were made. */
  photoUrls: Record<string, { url: string; at: number }>;
  loaded: Record<string, boolean>;
  // view state shared across screens
  tab: Tab | null; team: boolean; creating: boolean; signingIn: boolean; ciJustDone: boolean;
  /** Progress while a new event is created and its schedule imported (survives the switch to the new event). */
  createMsg: string | null;
  scoring: string | null; cview: CView | null; sdiv: string; sScoring: string | null; bkId: string | null;
  viewPhoto: string | null; toast: string | null; flashImport: boolean;
  upnext: { match: Match; test: boolean } | null;
};

export const initialEventState = {
  roster: [], checkins: [], players: [], matches: [], photos: [], kudos: [], hearts: [], comments: [],
  brackets: [], sched: [], divs: [], loaded: {}, tab: null, scoring: null, cview: null, sdiv: "all",
  sScoring: null, bkId: null, viewPhoto: null,
} satisfies Partial<AppState>;

export const useApp = create<AppState>(() => ({
  ready: false, offline: false, mode: null,
  user: null, uid: null, isOwner: false, myClubs: {}, unlocked: false, preview: false,
  clubs: [], members: {}, clubId: null, photoUrls: {},
  events: [], eventId: null, fromQR: false,
  ...initialEventState,
  team: false, creating: false, signingIn: false, ciJustDone: false, createMsg: null, toast: null, flashImport: false, upnext: null,
}));

export const set = useApp.setState;
export const get = useApp.getState;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(m: string) {
  set({ toast: m });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: null }), 2600);
}

/* Small localStorage wrapper. Same "rallyday." prefix as the original so nothing is lost. */
export const ls = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem("rallyday." + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem("rallyday." + k, JSON.stringify(v));
    } catch {}
  },
};
