"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useApp, set, ls } from "@/lib/store";
import { CAT_SHORT, brList, divById, divName, done, isAdminView, live, me, myTeamIn, pName, podium, reactionsOf } from "@/lib/model";
import { blinkTitle, buzz, chime, notifyBackground, stopBlink } from "@/lib/alerts";
import { Icon } from "./ui";

type Cele = { big: ReactNode; title: string; text: ReactNode; go?: { tab: "bracket" | "results"; label: string }; confetti: { left: number; delay: number; color: string }[] };

function UpNext() {
  const S = useApp(), u = S.upnext, m = me(S);
  useEffect(() => {
    if (!u || !m) return;
    chime();
    buzz();
    blinkTitle(`🔔 Court ${u.match.court} · You're up!`);
    if (!u.test) notifyBackground(`You're up on Court ${u.match.court}!`, `Head to Court ${u.match.court} now.`, "up-" + u.match.id);
  }, [u]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!u || !m) return null;
  const match = u.match;
  const mine = match.teamA.includes(m.id) ? match.teamA : match.teamB, opp = match.teamA.includes(m.id) ? match.teamB : match.teamA;
  const partner = mine.find((x) => x !== m.id), d = match.sched ? divById(S, match.sched.div) : null;
  const what = match.sched ? `${d ? divName(d) + " · " : ""}${match.sched.label}` : match.playoff ? `Playoffs · ${match.playoff.label}` : `${CAT_SHORT[match.category] || ""} · Round ${match.round}`;
  const ok = () => {
    if (!u.test) {
      const key = "up." + S.eventId + "." + m.id, seen = ls.get<string[]>(key, []);
      if (!seen.includes(match.id)) seen.push(match.id);
      ls.set(key, seen.slice(-50));
    }
    stopBlink();
    buzz(0);
    set({ upnext: null, ...(u.test ? {} : { tab: "courts" as const }) });
    if (!u.test) window.scrollTo(0, 0);
  };
  return (
    <div className="upnext" role="alertdialog" aria-modal="true" aria-labelledby="upTitle">
      <div className="up-inner">
        <span className="up-eyebrow">{u.test ? "Test alert" : "You're up!"}</span>
        <div className="up-court"><small>Court</small><b>{match.court}</b></div>
        <h1 id="upTitle">Head to Court {match.court}</h1>
        <p className="up-what">{what}</p>
        <p>With <b>{pName(S, partner)}</b><br />vs <b>{opp.map((id) => pName(S, id)).join(" & ")}</b></p>
        <button className="btn dark block" onClick={ok} autoFocus>On my way!</button>
      </div>
    </div>
  );
}

export function Overlays() {
  const S = useApp();
  const [cele, setCele] = useState<Cele | null>(null);

  useEffect(() => {
    const m = me(S);
    if (!m || isAdminView(S) || !S.eventId || !S.loaded.matches) return;
    // You're up: a live game with a court that includes me and hasn't been acknowledged
    if (!S.upnext) {
      const seenUp = ls.get<string[]>("up." + S.eventId + "." + m.id, []);
      const mineLive = live(S).filter((x) => x.court && [...x.teamA, ...x.teamB].includes(m.id) && !seenUp.includes(x.id));
      if (mineLive.length) { set({ upnext: { match: mineLive[0], test: false } }); return; }
    } else return;
    // Celebrations: new wins, medals, or reactions since last look
    if (cele || !S.loaded.kudos || !S.loaded.brackets) return;
    const key = "seen." + S.eventId + "." + m.id;
    const wins = done(S).filter((x) => x.winner && (x.winner === "A" ? x.teamA : x.teamB).includes(m.id));
    const kd = S.kudos.filter((k) => k.to === m.id);
    const medals: { k: string; pl: number; name: string; partner?: string }[] = [];
    for (const br of brList(S)) {
      const ti = myTeamIn(br, m.id);
      if (ti < 0) continue;
      const p = podium(br);
      if (!p) continue;
      const pl = p.gold === ti ? 1 : p.silver === ti ? 2 : p.bronze === ti ? 3 : 0;
      if (pl) medals.push({ k: br.id + ":" + pl, pl, name: br.name, partner: br.teams[ti].find((id) => id !== m.id) });
    }
    const seen = ls.get<{ m: string[]; k: string[]; p?: string[] } | null>(key, null);
    ls.set(key, { m: wins.map((x) => x.id), k: kd.map((k) => k.id), p: medals.map((x) => x.k) });
    if (!seen) return;
    const newP = medals.filter((x) => !(seen.p || []).includes(x.k));
    const newW = wins.filter((x) => !seen.m.includes(x.id)), newK = kd.filter((k) => !seen.k.includes(k.id));
    if (!newP.length && !newW.length && !newK.length) return;
    let c: Omit<Cele, "confetti"> | null = null;
    if (newP.length) {
      const x = newP[0];
      c = { big: ["", "🥇", "🥈", "🥉"][x.pl], title: ["", "Champions!", "Runner-up!", "Bronze medal!"][x.pl], text: `${x.name} · with ${pName(S, x.partner)}`, go: { tab: "bracket", label: "See the bracket" } };
    } else if (newW.length) {
      const w = newW[0], team = w.winner === "A" ? w.teamA : w.teamB, partner = team.find((x) => x !== m.id);
      const sc = w.scoreA != null && w.scoreB != null ? ` · ${Math.max(w.scoreA, w.scoreB)}–${Math.min(w.scoreA, w.scoreB)}` : "";
      c = { big: <Icon n="trophy" />, title: w.court ? `You won on Court ${w.court}!` : `You won ${w.playoff?.label || "your match"}!`, text: `With ${pName(S, partner)}${sc}`, go: { tab: "results", label: "See results" } };
    } else {
      const byId = Object.fromEntries(reactionsOf(S).map((r) => [r.id, r]));
      const valid = newK.filter((k) => byId[k.r]);
      if (!valid.length) return;
      if (valid.length === 1) {
        const k = valid[0], r = byId[k.r];
        c = { big: r.emoji, title: r.label + "!", text: `${pName(S, k.from)} just gave you ${r.emoji}` };
      } else {
        c = { big: byId[valid[0].r].emoji, title: `${valid.length} new reactions`,
          text: <><span className="emojis">{valid.map((k) => byId[k.r].emoji).join(" ")}</span><br />from {[...new Set(valid.map((k) => pName(S, k.from).split(" ")[0]))].slice(0, 3).join(", ")}</> };
      }
    }
    if (!c) return;
    const colors = ["#121212", "#ffffff", "#f6b90a", "#121212", "#ffffff"];
    buzz(120);
    setCele({ ...c, confetti: Array.from({ length: 28 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.6, color: colors[i % 5] })) });
  });

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setCele(null); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);

  return (
    <>
      <UpNext />
      {cele && !S.upnext ? (
        <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="celeTitle">
          <div className="confetti" aria-hidden="true">{cele.confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay.toFixed(2)}s` }} />)}</div>
          <div className="inner">
            <div className="big" aria-hidden="true">{cele.big}</div>
            <h1 id="celeTitle">{cele.title}</h1><p>{cele.text}</p>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn dark" onClick={() => setCele(null)} autoFocus>Nice!</button>
              {cele.go ? <button className="btn" onClick={() => { setCele(null); set({ tab: cele.go!.tab }); window.scrollTo(0, 0); }}>{cele.go.label}</button> : null}
            </div>
          </div>
        </div>
      ) : null}
      {S.toast ? <div className="toast" role="status">{S.toast}</div> : null}
    </>
  );
}
