"use client";
import { useApp } from "@/lib/store";
import { done, isAdminView } from "@/lib/model";
import { ActivityFeed, Fans, Leaders, PulseCard, RCards, ResultsList } from "../widgets";
import { Pools } from "./CourtsPage";

export function ResultsPage() {
  const S = useApp(), admin = isAdminView(S);
  return (
    <div className="view">
      <div className="sec-head"><h2>Recent winners</h2><span className="seeall">{done(S).length} games</span></div>
      <div className="hscroll"><RCards /></div>
      {admin ? (
        <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <section className="card"><div className="sec-head"><h2>Top winners</h2><span className="seeall">Wins</span></div><Leaders /></section>
          <section className="card"><div className="sec-head"><h2>Crowd favourites</h2><span className="seeall">Reactions</span></div><Fans /></section>
        </div>
      ) : <>
        {S.divs.length ? <><div className="sec-head"><h2>Pool standings</h2></div><Pools /></> : null}
        <section className="card"><div className="sec-head"><h2>Top winners</h2><span className="seeall">Wins</span></div><Leaders /></section>
      </>}
      <section className="card"><div className="sec-head"><h2>Activity</h2></div><div className="feed"><ActivityFeed limit={12} /></div></section>
      <PulseCard />
      {admin ? <>
        <div className="sec-head"><h2>All results</h2><span className="small muted">Undo a result if it was entered by mistake</span></div>
        <div className="list"><ResultsList /></div>
      </> : null}
    </div>
  );
}
