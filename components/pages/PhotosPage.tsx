"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, set } from "@/lib/store";
import { actorId, actorName, anyP, ev, fmtClock, isAdminView, me, pById, pName, photoSrc } from "@/lib/model";
import {
  canShareFiles, delComment, delPhoto, downloadPhoto, fetchPhotoFiles, markSaved, photoNames, postComment, savedPhotos, sharePhotoFiles,
  toggleHeart, uploadPhotos, zipPhotoFiles, type PhotoFile,
} from "@/lib/actions";
import type { Photo } from "@/lib/types";
import { Av, Icon } from "../ui";
import { Select } from "../Select";

function PhMeta({ p }: { p: Photo }) {
  const S = useApp();
  const h = S.hearts.filter((x) => x.photo === p.id).length, c = S.comments.filter((x) => x.photo === p.id).length;
  if (!h && !c) return null;
  return <span className="ph-meta">{h ? <b><Icon n="heart" />{h}</b> : null}{c ? <b><Icon n="chat" />{c}</b> : null}</span>;
}

const BATCH = 20;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Save many photos at once. Phones: the share sheet in batches of 20 (a share has to follow a tap closely,
    and hundreds of photos at once can run a phone out of memory). Computers: one .zip. */
function SavePhotos() {
  const S = useApp();
  const [who, setWho] = useState("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"idle" | "fetching" | "ready" | "zipping">("idle");
  const [prog, setProg] = useState(0);
  const [ready, setReady] = useState<PhotoFile[]>([]);
  const [note, setNote] = useState("");
  const [phone] = useState(canShareFiles);
  const [saved, setSaved] = useState(savedPhotos);
  const all = [...S.photos].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .filter((p) => (who === "all" || p.playerId === who) && (!onlyNew || !saved.has(p.id)));
  const left = all.filter((p) => !doneIds.has(p.id)), batch = left.slice(0, BATCH);
  const names = photoNames(all);
  const counts = S.photos.reduce<Record<string, number>>((o, p) => ({ ...o, [p.playerId]: (o[p.playerId] || 0) + 1 }), {});
  const busy = phase === "fetching" || phase === "zipping";
  const reset = () => { setDoneIds(new Set()); setReady([]); setPhase("idle"); setNote(""); setSaved(savedPhotos()); };

  const getBatch = async (list = batch, lead = "") => {
    setPhase("fetching");
    setProg(0);
    const { files, failed } = await fetchPhotoFiles(list, names, setProg);
    setReady(files);
    setPhase(files.length ? "ready" : "idle");
    setNote(lead + (failed ? `${plural(failed, "photo")} couldn't be downloaded and ${failed === 1 ? "was" : "were"} skipped.` : ""));
  };
  const saveBatch = async () => {
    if (!(await sharePhotoFiles(ready))) return;
    const ids = ready.map((f) => f.id), next = new Set([...doneIds, ...ids]);
    markSaved(ids);
    setDoneIds(next);
    setReady([]);
    const rest = all.filter((p) => !next.has(p.id));
    if (!rest.length) { setPhase("idle"); setNote(`All ${plural(all.length, "photo")} saved.`); return; }
    const lead = `Saved ${next.size} of ${all.length}. `;
    setNote(lead + "Getting the next ones…");
    getBatch(rest.slice(0, BATCH), lead);
  };
  const zipAll = async () => {
    setPhase("fetching");
    setProg(0);
    const { files, failed } = await fetchPhotoFiles(left, names, setProg);
    if (!files.length) { setPhase("idle"); setNote("Couldn't download the photos. Try again in a moment."); return; }
    setPhase("zipping");
    const tag = who === "all" ? "photos" : (names[left[0].id] || "photos").replace(/^qsina-|-\d+$/g, "");
    await zipPhotoFiles(files, `qsina-${tag}.zip`);
    markSaved(files.map((f) => f.id));
    setPhase("idle");
    setNote(`Downloaded ${plural(files.length, "photo")}.` + (failed ? ` ${failed} couldn't be downloaded.` : ""));
  };

  const from = all.length - left.length + 1, to = from + batch.length - 1;
  let action;
  if (!left.length) action = null;
  else if (!phone) action = <button className="btn dark block" disabled={busy} onClick={zipAll}>{phase === "zipping" ? "Making the .zip…" : phase === "fetching" ? `Getting ${prog} of ${left.length}…` : `Download ${plural(left.length, "photo")} (.zip)`}</button>;
  else if (phase === "ready") action = <>
    <button className="btn dark block" onClick={saveBatch}>Save {plural(ready.length, "photo")}</button>
    <p className="small muted">On iPhone, tap <b>Save {ready.length} Images</b>. On Android, tap <b>Save</b> or <b>Photos</b>.</p>
  </>;
  else action = <button className="btn dark block" disabled={busy} onClick={() => getBatch()}>
    {phase === "fetching" ? `Getting ${prog} of ${batch.length}…` : all.length > BATCH ? `Get photos ${from}–${to} of ${all.length}` : `Get ${plural(batch.length, "photo")}`}</button>;

  return (
    <section className="card saveall">
      <div className="field"><label htmlFor="sv-who">Photos of</label>
        <Select id="sv-who" value={who} onChange={(v) => { setWho(v); reset(); }} options={[
          ["all", `Everyone (${S.photos.length})`],
          ...S.players.filter((p) => counts[p.id]).sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, `${p.name} (${counts[p.id]})`] as const)]} />
      </div>
      <label className="check"><input type="checkbox" checked={onlyNew} onChange={(x) => { setOnlyNew(x.target.checked); reset(); }} /> Only photos I haven&apos;t saved yet</label>
      {all.length ? null : <p className="small muted">{onlyNew ? "You've saved all of these already." : "No photos here yet."}</p>}
      {action}
      {note ? <p className="small" role="status">{note}</p> : null}
    </section>
  );
}

export function PhotosPage() {
  const S = useApp();
  const m = me(S), admin = isAdminView(S);
  const [who, setWho] = useState(admin ? "" : m?.id || "");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const n = who ? S.photos.filter((p) => p.playerId === who).length : 0, off = !who || n >= 5;
  const ph = [...S.photos].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return (
    <div className="view">
      <section className="card lav">
        <div className="sec-head"><h2>Your photos</h2><span className="small" style={{ opacity: 0.75 }}>Up to 5 each</span></div>
        {admin ? (
          <div className="field"><label htmlFor="ph-who">Uploading for</label>
            <Select id="ph-who" value={who} onChange={setWho} placeholder="Pick a player"
              options={[...S.players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, p.name] as const)} />
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="slots">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={`slot ${i < n ? "used" : ""}`} />)}<span className="small num" style={{ alignSelf: "center", marginLeft: 4 }}>{n}/5</span></div>
          <label className="btn dark" htmlFor="ph-file" style={{ opacity: off ? 0.45 : 1, pointerEvents: off ? "none" : undefined }}><Icon n="plus" />{n >= 5 ? "All 5 used" : "Add photos"}</label>
          <input id="ph-file" type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) uploadPhotos(who, [...e.target.files], setMsg); e.target.value = ""; }} />
        </div>
        <p className="small" role="status">{msg}</p>
        {S.mode === "local" ? <p className="small muted">Demo mode keeps photos on this device only.</p> : null}
      </section>
      <div className="sec-head"><h2>Event gallery</h2>
        {S.photos.length ? <button className="btn sm" aria-expanded={saving} onClick={() => setSaving(!saving)}><Icon n="download" />{saving ? "Close" : "Save photos"}</button>
          : <span className="small muted">0 photos</span>}</div>
      {saving && S.photos.length ? <SavePhotos /> : null}
      <div className="gallery">
        {ph.length ? ph.map((p) => (
          <button key={p.id} className="ph" onClick={() => set({ viewPhoto: p.id })} aria-label={`Photo by ${pName(S, p.playerId)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photoSrc(S, p) ? <img src={photoSrc(S, p)} alt="" loading="lazy" /> : null}<span>{pName(S, p.playerId)}</span><PhMeta p={p} />
          </button>
        )) : <div className="empty" style={{ gridColumn: "1/-1" }}><span className="sq"><Icon n="image" /></span><p>No photos yet. Everyone&apos;s shots from today land here. Tap any photo to heart it, comment or download it.</p></div>}
      </div>
    </div>
  );
}

export function Lightbox() {
  const S = useApp();
  const p = S.photos.find((x) => x.id === S.viewPhoto);
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const cs = p ? S.comments.filter((c) => c.photo === p.id).sort((x, y) => (x.at || "").localeCompare(y.at || "")) : [];
  useEffect(() => { setConfirm(false); setText(""); }, [S.viewPhoto]);
  useEffect(() => {
    const C = listRef.current;
    if (C && C.scrollHeight - C.scrollTop - C.clientHeight < 80) C.scrollTop = C.scrollHeight;
  }, [cs.length]);
  useEffect(() => {
    if (!p) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") set({ viewPhoto: null }); };
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [p]);
  if (!p) return null;
  const a = actorId(S), owner = pById(S, p.playerId) || { id: p.playerId, name: "Player" };
  const hs = S.hearts.filter((h) => h.photo === p.id), mine = !!a && hs.some((h) => h.from === a);
  const canDel = S.unlocked || (!!S.uid && p.uploaderUid === S.uid);
  const close = () => set({ viewPhoto: null });
  return (
    <div className="lightbox" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="viewer" role="dialog" aria-modal="true" aria-label={`Photo by ${owner.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="viewer-img">{photoSrc(S, p) ? <img src={photoSrc(S, p)} alt={`Photo by ${owner.name}`} /> : null}</div>
        <div className="viewer-side">
          <div className="vhead"><Av p={owner} /><div className="who"><b>{owner.name}</b><span>{fmtClock(p.createdAt)} · {ev(S)?.name || ""}</span></div><button className="close-x" onClick={close} aria-label="Close">✕</button></div>
          <div className="vacts">
            <button className="btn sm heart-btn" aria-pressed={mine} disabled={!a} onClick={() => toggleHeart(p.id, a)}><Icon n="heart" />{hs.length || ""} {hs.length === 1 ? "Heart" : "Hearts"}</button>
            <button className="btn sm" onClick={() => downloadPhoto(p.id)}><Icon n="download" />Save</button>
            {canDel ? (confirm
              ? <><button className="btn sm danger" onClick={() => delPhoto(p.id)}>Confirm delete</button><button className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button></>
              : <button className="btn sm ghost" onClick={() => setConfirm(true)}>Delete</button>) : null}
          </div>
          <div className="comments" ref={listRef}>
            {!cs.length ? <p className="small muted" style={{ padding: "8px 0" }}>No comments yet. Say something nice.</p> : cs.map((c) => (
              <div className="cmt-row" key={c.id}>
                {c.from === "admin" ? <span className="av c0">ORG</span> : <Av p={anyP(S, c.from)} />}
                <div><b>{actorName(S, c.from)}<span>{fmtClock(c.at)}</span></b><p>{c.text}</p></div>
                {(a && c.from === a) || S.unlocked ? <button className="x" onClick={() => delComment(c.id)} aria-label="Delete comment">Delete</button> : <span />}
              </div>
            ))}
          </div>
          {a ? (
            <form className="cmt" onSubmit={async (e) => {
              e.preventDefault();
              const t = text.trim();
              if (!t) return;
              setText("");
              if (!(await postComment(p.id, a, t))) setText(t);
            }}>
              <input aria-label="Add a comment" type="text" maxLength={280} placeholder="Add a comment…" autoComplete="off" enterKeyHint="send" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn sm dark" type="submit">Post</button>
            </form>
          ) : <p className="small muted">Check in to heart and comment.</p>}
        </div>
      </div>
    </div>
  );
}
