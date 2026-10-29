"use client";
import type { ReactNode } from "react";
import { CAT_SHORT, LEVELS, hue, initials, reactionsOf, tally } from "@/lib/model";
import { useApp } from "@/lib/store";
import type { Match } from "@/lib/types";

/* Static, trusted SVG fragments (same set as the original). */
const ICON = {
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  logout: '<path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9"/>',
  bracket: '<path d="M3 4h5v6H3M3 14h5v6H3M8 7h3v10H8M11 12h4M15 9h6v6h-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18M3 12h18"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.5 6.6 4.5c2.2 0 3.6 1.3 5.4 3.3 1.8-2 3.2-3.3 5.4-3.3 3.6 0 5.4 3.7 3.8 6.9C19 15.6 12 20 12 20z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  paddle: '<rect x="3.5" y="3" width="11" height="13" rx="5" transform="rotate(-35 9 9.5)"/><path d="m13.2 15.4 4.3 5.1" stroke-width="3.2"/><circle cx="19.5" cy="5.5" r="2.3"/>',
  ball: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="10" r="1"/><circle cx="11" cy="15" r="1"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/>',
} as const;
export type IconName = keyof typeof ICON;

export const Icon = ({ n, cls = "" }: { n: IconName; cls?: string }) => (
  <svg className={`i ${cls}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[n] }} />
);

export const Av = ({ p, style }: { p?: { id?: string; name?: string } | null; style?: React.CSSProperties }) => (
  <span className={`av c${hue(p?.id || p?.name)}`} aria-hidden="true" style={style}>{initials(p?.name)}</span>
);

export const Stat = ({ icon, label, val, unit }: { icon: IconName; label: string; val: ReactNode; unit?: string }) => (
  <div className="stat"><span className="ico"><Icon n={icon} /></span><span className="label">{label}</span><b>{val}{unit ? <small>{unit}</small> : null}</b></div>
);

export const LvlChip = ({ l }: { l?: string }) => (
  <span className={`chip ${l === "high" ? "high" : l === "low" ? "low" : "open"}`}><Icon n="flag" />{LEVELS[l || ""] || l}</span>
);
export const CatTag = ({ m }: { m: Pick<Match, "category" | "level"> }) => <span className={`tag ${m.category}`}>{CAT_SHORT[m.category]} · {LEVELS[m.level]}</span>;
export const CatOnly = ({ cat }: { cat: string }) => <span className={`tag ${cat}`}>{CAT_SHORT[cat]}</span>;

export function Tally({ pid }: { pid: string }) {
  const S = useApp();
  const t = tally(S, pid);
  const parts = reactionsOf(S).filter((r) => t[r.id]);
  if (!parts.length) return null;
  return <span className="kudos">{parts.map((r) => <span key={r.id} title={r.label}>{t[r.id]}{r.emoji}</span>)}</span>;
}

/** Why the app is called Qsina. Shown where players first meet the app. */
export const NameStory = () => (
  <details className="card story" open>
    <summary><span>Why Qsina?<small>koo-SEE-nah</small></span></summary>
    <ol>
      <li><b>Q</b><p><strong>Q is for queue</strong>Qsina lines up every game and calls you to your court when it&apos;s your turn, so nobody has to crowd around a printed sheet.</p></li>
      <li><b>sina</b><p><strong>Sina is for the players</strong>In Filipino, <em>sina</em> comes before a group of names, as in <em>sina Joy at Ana</em>. So <em>Q sina Joy at Ana</em> means &ldquo;queue up Joy and Ana.&rdquo;</p></li>
      <li><b>Kusina</b><p><strong>Say it out loud</strong>Qsina sounds like <em>kusina</em>, Filipino for kitchen: the no-volley zone every pickleball player knows, and the room where everyone gathers.</p></li>
    </ol>
  </details>
);


export const ArtPaddle = () => (
  <svg className="boost-art" viewBox="0 0 160 160" aria-hidden="true"><g transform="rotate(-28 80 80)"><ellipse cx="78" cy="62" rx="42" ry="50" fill="#121212" /><ellipse cx="78" cy="62" rx="30" ry="37" fill="none" stroke="#f6b90a" strokeWidth="1.5" strokeDasharray="3 6" /><rect x="70" y="108" width="16" height="46" rx="6" fill="#ffffff" stroke="#121212" strokeWidth="2.5" /></g><circle cx="122" cy="118" r="24" fill="#ffffff" stroke="#121212" strokeWidth="2.5" /><g fill="#121212"><circle cx="113" cy="110" r="3" /><circle cx="126" cy="106" r="3" /><circle cx="120" cy="121" r="3" /><circle cx="133" cy="124" r="3" /><circle cx="112" cy="128" r="3" /></g></svg>
);
export const ArtCourt = () => (
  <svg className="boost-art" viewBox="0 0 120 150" aria-hidden="true"><rect x="8" y="6" width="104" height="138" rx="6" fill="#ffffff" stroke="#121212" strokeWidth="2.5" /><path d="M8 75h104" stroke="#121212" strokeWidth="3" /><path d="M8 56h104M8 94h104M60 6v50M60 94v50" stroke="#121212" strokeWidth="1.5" /><circle cx="36" cy="30" r="9" fill="#121212" /><circle cx="84" cy="34" r="9" fill="#121212" /><circle cx="36" cy="118" r="9" fill="#f6b90a" stroke="#121212" strokeWidth="2" /><circle cx="84" cy="114" r="9" fill="#f6b90a" stroke="#121212" strokeWidth="2" /></svg>
);
const BARS = [0, 4, 6, 10, 12, 13, 17, 20, 22, 25, 27, 28, 32, 35];
export const SplashArt = () => (
  <svg className="art" viewBox="0 0 360 330" preserveAspectRatio="xMinYMin slice" aria-hidden="true">
    <path d="M0 34h360M100 34v296" stroke="#121212" strokeWidth="1.5" />
    <g fill="#121212"><rect x="14" y="12" width="8" height="8" /><rect x="22" y="20" width="8" height="8" /><rect x="30" y="12" width="8" height="8" />
      <rect x="318" y="12" width="8" height="8" /><rect x="326" y="20" width="8" height="8" /><rect x="334" y="12" width="8" height="8" /><rect x="342" y="20" width="8" height="8" />
      {BARS.map((x) => <rect key={x} x={158 + x * 2} y="11" width={x % 3 ? 1.5 : 3} height="18" />)}</g>
    <rect x="22" y="58" width="58" height="206" rx="29" fill="none" stroke="#121212" strokeWidth="1.5" />
    <path d="M51 66a22 22 0 0 1 0 44z" fill="#121212" /><circle cx="51" cy="88" r="22" fill="none" stroke="#121212" strokeWidth="1.5" />
    <path d="M51 110v96" stroke="#121212" strokeWidth="1.5" />
    <circle cx="51" cy="236" r="22" fill="#121212" />
    <g fill="#f6b90a"><circle cx="44" cy="230" r="2.6" /><circle cx="56" cy="228" r="2.6" /><circle cx="51" cy="240" r="2.6" /><circle cx="60" cy="243" r="2.6" /><circle cx="42" cy="244" r="2.6" /></g>
    <path d="M100 286h260" stroke="#121212" strokeWidth="1.5" />
    <g fill="#121212"><rect x="14" y="300" width="9" height="9" /><rect x="23" y="309" width="9" height="9" /><rect x="32" y="300" width="9" height="9" /><rect x="41" y="309" width="9" height="9" /></g>
    <path d="M290 330v-40M330 330v-24" stroke="#121212" strokeWidth="1.5" />
    <ellipse cx="290" cy="290" rx="24" ry="11" transform="rotate(-18 290 290)" fill="#121212" /><ellipse cx="330" cy="304" rx="20" ry="9" transform="rotate(-18 330 304)" fill="#121212" />
    <path d="M282 291l14-4M323 305l12-3" stroke="#f6b90a" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
export const TrophyArt = () => (
  <svg viewBox="0 0 64 80" aria-hidden="true"><circle cx="32" cy="12" r="9" fill="#f6b90a" stroke="#111" strokeWidth="2.5" /><g fill="#111"><circle cx="29" cy="9" r="1.6" /><circle cx="35" cy="10" r="1.6" /><circle cx="31" cy="15" r="1.6" /></g><path d="M16 22h32v14a16 16 0 0 1-32 0z" fill="#f6b90a" stroke="#111" strokeWidth="3" /><path d="M16 26H7v4a10 10 0 0 0 11 10M48 26h9v4a10 10 0 0 1-11 10" fill="none" stroke="#111" strokeWidth="3" /><path d="M28 51h8v11h-8z" fill="#111" /><rect x="18" y="62" width="28" height="7" fill="#f6b90a" stroke="#111" strokeWidth="3" /><rect x="13" y="69" width="38" height="9" fill="#111" /></svg>
);

/** Numeric score input value → number | null */
export const numOrNull = (v: string) => (v === "" ? null : +v);
