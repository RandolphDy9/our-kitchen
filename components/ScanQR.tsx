"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { joinByCode } from "@/lib/session";
import { Icon } from "./ui";

/** The check-in code in a scanned QR: an /in/{code} link, an older /#in-{code} link, or the bare code. */
function codeIn(text: string) {
  const m = text.match(/\/in\/([a-z0-9]+)/i) || text.match(/#in-([a-z0-9]+)/i);
  if (m) return m[1];
  return /^[a-z0-9]{4,40}$/i.test(text.trim()) ? text.trim() : null;
}

/** Scan the event's QR code from inside the app. A Home Screen app can't be opened by the phone's camera,
    and on iPhone it doesn't share Safari's storage, so this is how an installed app joins an event. */
export function ScanQR() {
  const [open, setOpen] = useState(false);
  const [can, setCan] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => setCan(!!navigator.mediaDevices?.getUserMedia), []);
  if (!can) return null;
  return (
    <>
      <button className="btn dark block" onClick={() => setOpen(true)}><Icon n="qr" />Scan the QR code</button>
      {open ? <Scanner onClose={close} /> : null}
    </>
  );
}

function Scanner({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, busy = false, stopped = false;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const tick = async () => {
      const v = video.current;
      if (stopped || !v) return;
      if (!busy && v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const qr = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        const code = qr && codeIn(qr.data);
        if (qr && !code) setMsg("That isn't a Qsina check-in code.");
        if (code) {
          busy = true;
          setMsg("Opening the event…");
          if (await joinByCode(code)) return onClose();
          setMsg("That event wasn't found. Ask the organizer for the current QR code.");
          setTimeout(() => (busy = false), 2000);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = s;
        v.play().catch(() => {});
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setMsg("Qsina needs your camera to scan. Allow camera access, or type the event code instead."));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onClose]);
  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label="Scan the event QR code">
      <video ref={video} playsInline muted />
      <div className="scan-frame" aria-hidden="true" />
      <div className="scan-bar">
        <p>{msg || "Point your camera at the QR code at the front desk."}</p>
        <button className="btn block" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
