# Qsina

*Pronounced koo-SEE-nah.*

## Why Qsina?

- **Q is for queue.** The app lines up every game and calls players to their court when it's their turn.
- **Sina is for the players.** In Filipino, *sina* comes before a group of names, as in *sina Joy at Ana*. "Q sina Joy at Ana" means "queue up Joy and Ana."
- **Say it out loud.** Qsina sounds like *kusina*, Filipino for kitchen: the no-volley zone every pickleball player knows, and the room where everyone gathers.

## What it does

A mobile-first PWA for running pickleball tournaments: QR check-in, imported Excel schedules, live courts, pools, playoff brackets, "You're up!" alerts, reactions and an event photo gallery. Built with Next.js 16 (App Router), React 19, Zustand and Supabase. Ported from the original single-file `OurKitchen.html` (the app's earlier name).

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
2. **SQL Editor:** paste `supabase/schema.sql` and run it. It creates the `docs` table, the security policies, live updates and the private `photos` bucket. If you change the super admin, edit the email in it and run it again.
3. **Authentication → Sign In / Providers:** turn on **Allow anonymous sign-ins** (for players). Keep the **Email** provider on with **Confirm email** on, so nobody can sign up with someone else's address.
   Organizers sign in with email + password. Create your own account (the super admin email) under **Authentication → Users → Add user → Create new user**, with **Auto Confirm User** checked. That's the only password login. Admins don't get one: on the app's **Admins** screen you pick players from the open event, and admin access goes to the phone they checked in with.
4. **Authentication → URL Configuration:** set the Site URL to your live domain, and add `http://localhost:3000/**` and your live domain to the redirect URLs.
5. Copy `.env.example` to `.env.local`. Fill in the project URL, the publishable (anon) key, `NEXT_PUBLIC_OWNER_EMAIL` and `NEXT_PUBLIC_OWNER_NAME`.
6. Deploy on Netlify (`npx netlify-cli deploy --build --prod`), with the same env variables set under Site configuration → Environment variables.

Free-tier note: Supabase pauses a free project after 7 days without any activity. Data is kept; click **Restore** in the dashboard before your next event (it takes a few minutes), or keep it awake with a weekly ping.

## Clubs

Qsina runs any number of clubs from one site. Each club only sees and manages its own events.

| Who | How they get in | What they can do |
|---|---|---|
| **Platform owner** | Signs in with `NEXT_PUBLIC_OWNER_EMAIL` | Everything, in every club. Creates clubs and names their owners (**Club → All clubs**). |
| **Club owner** | Signs in with the email the platform owner added | Their club: events, schedules, scores, and picking or removing admins. Can rename the club. |
| **Club admin** | Picked from checked-in players by a club owner | Run that club's events from the phone they checked in with. |
| **Player** | Scans the event's QR code | Check in, courts, results, reactions, photos. |

Adding a club owner takes two steps:
1. In the app: **Club → All clubs → New club** (or **Add an owner** on an existing club), with their name and sign-in email.
2. In Supabase: **Authentication → Users → Add user → Create new user**, with the same email and **Auto Confirm User** ticked. Send them the password; they use **Organizer sign in**.

Running `supabase/schema.sql` moves events made before clubs existed into the first club ("My club"), and their admins with them.

**Privacy:** each club only sees its own clubs, members and events. A player's phone can only read an event after opening its QR code or link, or typing the check-in code printed under the QR code. The check-in code is separate from the event's id on purpose: ids appear in realtime delete notices, so an id alone never opens an event (events from before codes use their id, so printed posters keep working). Adding the app to the Home Screen from an event page opens the app on that event (`/m/{code}` serves that page's manifest). Photos live in a private bucket: the app shows them through signed links that expire after 6 hours and are only issued to people who can see the event.

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
