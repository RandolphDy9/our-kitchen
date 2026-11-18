"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./ui";

/* Venue field with place suggestions from Photon (photon.komoot.io): free, keyless OpenStreetMap search
   built for search-as-you-type. Free text still works — plenty of venues aren't on the map.
   Results lean toward where the admin is: their location if they've already allowed it (we never prompt),
   otherwise the last venue they picked on this device. */

type Hit = { label: string; sub: string; lat: number; lon: number };
type Feature = { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } };

const API = "https://photon.komoot.io/api/";
const NEAR_KEY = "ok.venueNear";
const cache = new Map<string, Hit[]>();

function toHit(f: Feature): Hit | null {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const road = [p.housenumber, p.street].filter(Boolean).join(" ");
  const town = p.district && p.city && p.district !== p.city ? p.district : p.city || p.town || p.village || p.county;
  const name = p.name || road;
  if (!name) return null;
  const label = [name, town].filter(Boolean).join(", ").slice(0, 80);
  const sub = [p.name ? road : "", p.city && p.city !== town ? p.city : "", p.state, p.country].filter(Boolean).join(", ");
  return { label, sub, lat, lon };
}

async function near(): Promise<{ lat: number; lon: number } | null> {
  try {
    const st = await navigator.permissions?.query({ name: "geolocation" });
    if (st?.state === "granted") {
      const pos = await new Promise<GeolocationPosition>((ok, no) =>
        navigator.geolocation.getCurrentPosition(ok, no, { maximumAge: 3_600_000, timeout: 3000 }));
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    }
  } catch { /* fall through */ }
  try {
    const v = JSON.parse(localStorage.getItem(NEAR_KEY) || "null");
    if (typeof v?.lat === "number" && typeof v?.lon === "number") return v;
  } catch { /* no storage */ }
  return null;
}

export function VenueInput({ id, value, onChange, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const uid = useId(), listId = `${uid}-list`;
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const bias = useRef<Promise<{ lat: number; lon: number } | null> | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits([]); setOpen(false); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        bias.current ??= near();
        const b = await bias.current;
        const url = `${API}?q=${encodeURIComponent(term)}&limit=6${b ? `&lat=${b.lat.toFixed(2)}&lon=${b.lon.toFixed(2)}` : ""}`;
        let list = cache.get(url);
        if (!list) {
          const res = await fetch(url, { signal: ctl.signal });
          if (!res.ok) return;
          const seen = new Set<string>();
          list = ((await res.json()).features as Feature[]).map(toHit)
            .filter((h): h is Hit => !!h && !seen.has(h.label) && !!seen.add(h.label)).slice(0, 5);
          cache.set(url, list);
        }
        setHits(list); setActive(-1); setOpen(list.length > 0);
      } catch { /* offline or aborted: the field still takes free text */ }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (h: Hit) => {
    onChange(h.label);
    setOpen(false); setHits([]);
    try { localStorage.setItem(NEAR_KEY, JSON.stringify({ lat: h.lat, lon: h.lon })); } catch { /* no storage */ }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(hits[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className={`sel venue${open ? " open" : ""}`} ref={wrap}>
      <input id={id} type="text" maxLength={80} placeholder={placeholder} value={value} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${uid}-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); setQ(e.target.value); }} onKeyDown={onKey} />
      {open ? (
        <ul id={listId} role="listbox" className="sel-list" aria-label="Suggested places">
          {hits.map((h, i) => (
            <li key={h.label} id={`${uid}-${i}`} role="option" aria-selected={false} className={i === active ? "on" : undefined}
              onPointerEnter={() => setActive(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(h)}>
              <Icon n="pin" /><span>{h.label}{h.sub ? <small>{h.sub}</small> : null}</span>
            </li>
          ))}
          <li className="venue-attr" role="presentation" aria-hidden="true">© OpenStreetMap contributors</li>
        </ul>
      ) : null}
    </div>
  );
}
