# OurKitchen

A mobile-first PWA for running pickleball tournaments: QR check-in, imported Excel schedules, live courts, pools, playoff brackets, "You're up!" alerts, reactions and an event photo gallery. Built with Next.js 16 (App Router), React 19, Zustand and Supabase. Ported from the original single-file `OurKitchen.html`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

With no Supabase config, the app runs in **demo mode**: data lives in this browser's localStorage and syncs between tabs on the same device. Tap **Organizer sign in** to become the super admin, create an event, then use **Try a sample schedule** on the Event tab to load a sample tournament.

The service worker only registers in production builds:

```bash
npm run build && npm start
```

## Going live with Supabase (free tier, no card)

1. Create a free project at [supabase.com](https://supabase.com). Pick the Canada (Central) region if your events are in Ontario.
2. **SQL Editor:** paste `supabase/schema.sql` and run it. It creates the `docs` table, the security policies, live updates and the `photos` bucket. If you change the super admin, edit the email in it and run it again.
3. **Authentication → Sign In / Providers:** turn on **Allow anonymous sign-ins** (for players). Keep the **Email** provider on with **Confirm email** on, so nobody can sign up with someone else's address.
   Organizers sign in with email + password. Create your own account (the super admin email) under **Authentication → Users → Add user → Create new user**, with **Auto Confirm User** checked. That's the only password login. Admins don't get one: on the app's **Admins** screen you pick players from the open event, and admin access goes to the phone they checked in with.
4. **Authentication → URL Configuration:** set the Site URL to your live domain, and add `http://localhost:3000/**` and your live domain to the redirect URLs.
5. Copy `.env.example` to `.env.local`. Fill in the project URL, the publishable (anon) key, `NEXT_PUBLIC_OWNER_EMAIL` and `NEXT_PUBLIC_OWNER_NAME`.
6. Deploy on Vercel's free Hobby plan with the same env variables.

Free-tier note: Supabase pauses a free project after 7 days without any activity. Data is kept; click **Restore** in the dashboard before your next event (it takes a few minutes), or keep it awake with a weekly ping.

## Changes from the original artifact

| Original (claude.ai runtime) | Now |
|---|---|
| `window.claude.use("db")` | `lib/backend`: Supabase (a `docs` table with live updates), or the localStorage demo backend |
| claude.ai identity, owner and "Can edit" sharing | Supabase Auth (anonymous for players, email + password for organizers) and a `roles/{uid}` collection |
| Admin search across shared people | Pick admins from the event's checked-in players |
| `assets` uploads | Supabase Storage (data URLs in demo mode) |
| `downloads.save` | The share sheet on phones (saves to the camera roll), a normal download elsewhere |
| CDN qrcodejs and SheetJS | `qrcode` and `xlsx` npm packages (SheetJS 0.20.3, loaded only when needed) |
| In-app alerts only | Also a system notification when the app is in the background (opt-in) |

The data layout is the same as before (see `lib/backend/types.ts`).

## Layout

```
app/              layout (fonts, viewport, metadata), page, manifest, global CSS
components/       App shell, overlays, shared widgets, pages/*
lib/              store, session (boot + subscriptions), actions (writes), model (derived data),
                  schedule (Excel parser), alerts, sample data, backend/*
public/           sw.js, offline.html, icons
scripts/          make-icons.mjs (npm run icons)
```
