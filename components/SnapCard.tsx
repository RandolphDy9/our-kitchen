"use client";
import { useState } from "react";
import { useApp, set } from "@/lib/store";
import { me, pName, photoSrc, wonBy } from "@/lib/model";
import { uploadPhotos } from "@/lib/actions";
import { Icon } from "./ui";

const MAX = 5;

/* Player home nudge to add photos to the event album. The copy follows the player's day:
   congrats after a win, "good game" after a loss, a warm-up prompt before the first game. */
export function SnapCard() {
  const S = useApp(), m = me(S);
  const [msg, setMsg] = useState("");
  if (!m) return null;
  const mineAll = S.matches.filter((x) => [...x.teamA, ...x.teamB].includes(m.id));
  // While they're on court, "You're up" is the only thing that matters.
  if (mineAll.some((x) => x.status === "live")) return null;
  const last = mineAll.filter((x) => x.status === "done").sort((a, b) => (a.endedAt || "").localeCompare(b.endedAt || "")).at(-1);
  const partner = last ? (last.teamA.includes(m.id) ? last.teamA : last.teamB).find((id) => id !== m.id) : undefined;
  const used = S.photos.filter((p) => p.playerId === m.id).length, full = used >= MAX;
  const recent = [...S.photos].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).filter((p) => photoSrc(S, p)).slice(0, 4);

  const with_ = partner ? pName(S, partner) : "your partner";
  const [eyebrow, title, line] = full
    ? ["Event album", "Your 5 photos are in", "Thanks for adding to the album! Heart and comment on everyone else's."]
    : last && wonBy(last, m.id)
      ? ["Congrats on the win!", `Snap it with ${with_}`, "Take a photo with your partner and add it to the event album."]
      : last
        ? ["Good game!", `Snap a pic with ${with_}`, "Win or lose, it's a great day on the court. Add your photo to the event album."]
        : ["Event album", "Make today one to remember", "Snap your warm-up, your partner or the crowd, and add it to the album everyone sees."];

  return (
    <section className="card snap">
      <span className="snap-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p className="small">{line}</p>
      {recent.length ? (
        <div className="snap-thumbs">
          {recent.map((p) => (
            <button key={p.id} onClick={() => set({ viewPhoto: p.id })} aria-label={`Photo by ${pName(S, p.playerId)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(S, p)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="row">
        {full ? null : <>
          <label className="btn dark" htmlFor="snap-file"><Icon n="camera" />Add a photo</label>
          <input id="snap-file" type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) uploadPhotos(m.id, [...e.target.files], setMsg); e.target.value = ""; }} />
        </>}
        <button className="btn ghost" onClick={() => set({ tab: "photos" })}>See the album{S.photos.length ? ` (${S.photos.length})` : ""}</button>
      </div>
      {msg ? <p className="small" role="status">{msg}</p> : full ? null : <p className="small muted">{used}/{MAX} of your photos used</p>}
    </section>
  );
}
