"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./ui";

export type Opt = readonly [value: string | number, label: string];

/* Dropdown in the app's own style. The native <select> popup can't be styled (it's drawn by the OS),
   so this is a button + listbox with the usual keyboard support: arrows, Home/End, Enter/Space, Esc, type-ahead. */
export function Select({ id, value, options, onChange, placeholder, "aria-label": ariaLabel }: {
  id?: string; value: string | number; options: Opt[]; onChange: (v: string) => void; placeholder?: string; "aria-label"?: string;
}) {
  const uid = useId(), listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: "", t: 0 });
  const cur = options.findIndex(([v]) => String(v) === String(value));
  const label = cur >= 0 ? options[cur][1] : placeholder || "";

  const show = () => {
    const r = btn.current!.getBoundingClientRect();
    // Room below, minus the floating bottom nav; open upward when it doesn't fit.
    const below = window.innerHeight - r.bottom - 96, above = r.top - 16, want = Math.min(options.length * 46 + 8, 296);
    setUp(below < want && above > below);
    setActive(Math.max(cur, 0));
    setOpen(true);
  };
  const pick = (i: number) => {
    setOpen(false);
    btn.current?.focus();
    if (options[i] && String(options[i][0]) !== String(value)) onChange(String(options[i][0]));
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: React.KeyboardEvent) => {
    const n = options.length;
    if (!n) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    const go = (i: number) => { e.preventDefault(); setActive(Math.max(0, Math.min(n - 1, i))); };
    if (e.key === "ArrowDown") go(active + 1);
    else if (e.key === "ArrowUp") go(active - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const t = typed.current, now = Date.now();
      t.s = (now - t.t > 700 ? "" : t.s) + e.key.toLowerCase();
      t.t = now;
      const hit = options.findIndex(([, l]) => l.toLowerCase().startsWith(t.s));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div className={`sel${open ? " open" : ""}${up ? " up" : ""}`} ref={wrap}>
      <button ref={btn} id={id} type="button" className="sel-btn" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${uid}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}>
        <span className={cur >= 0 ? undefined : "sel-ph"}>{label}</span><Icon n="chev" />
      </button>
      {open ? (
        <ul ref={list} id={listId} role="listbox" className="sel-list" aria-labelledby={id}>
          {options.map(([v, l], i) => (
            <li key={String(v)} id={`${uid}-${i}`} role="option" aria-selected={i === cur} className={i === active ? "on" : undefined}
              onPointerEnter={() => setActive(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
              <span>{l}</span>{i === cur ? <Icon n="check" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
