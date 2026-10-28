"use client";
import type { Backend } from "./types";

export const supabaseConfigured = () =>
  !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_KEY);

let current: Backend | null = null;
let loading: Promise<Backend> | null = null;

/** Supabase when it's configured, otherwise the in-browser demo backend. Supabase is code-split. */
export function loadBackend(): Promise<Backend> {
  if (current) return Promise.resolve(current);
  loading ||= (supabaseConfigured()
    ? import("./supabase").then((m) => m.createSupabaseBackend())
    : import("./local").then((m) => m.createLocalBackend())
  ).then((b) => (current = b));
  return loading;
}

export function backend(): Backend {
  if (!current) throw new Error("Backend not ready");
  return current;
}

export type { Backend, Doc, AuthUser } from "./types";
