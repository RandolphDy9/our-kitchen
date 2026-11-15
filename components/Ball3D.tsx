"use client";
import { useEffect, useRef } from "react";

/* A small 3D pickleball drawn in the poster style: flat colour, one hard shadow band, black outline.
   It plays one short entrance and then stops drawing, so it costs nothing while the player reads the screen
   (the paddle scene is the exception: it keeps bouncing while it's on screen, until the player taps it).
   three.js loads on demand, only on screens that show a ball. If it can't run (reduced motion, data saver,
   no WebGL) nothing is drawn and the flat artwork underneath stays as it is. */

type Enter = "drop" | "roll" | "spin" | "paddle";
type Props = {
  /** drop: falls from the top of its box and bounces to rest. roll: rolls in from the right. spin: turns into place.
      paddle: a paddle is drawn too, and the ball keeps bouncing on it (a warm-up). A tap slows it to a stop; another
      tap starts it again. It pauses while it's off screen. */
  enter: Enter;
  color?: "white" | "yellow";
  /** Ball diameter as a share of the box width. */
  fit?: number;
  className?: string;
  /** Called once the first frame is on screen, so the flat artwork can step aside. */
  onReady?: () => void;
};

const INK = 0x111111, FILL = { white: 0xffffff, yellow: 0xf6b90a };
const HOLES = 40;
const outExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export function Ball3D({ enter, color = "white", fit = 0.76, className, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const el = host.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let gone = false, stop = () => {};

    import("three").then((T) => {
      if (gone || !el.clientWidth) return;
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try {
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      } catch {
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      const cv = renderer.domElement;
      cv.setAttribute("aria-hidden", "true");
      el.appendChild(cv);

      // Ball radius is 1; the camera is sized so the ball takes `fit` of the box width.
      const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
      const withPaddle = enter === "paddle";
      if (withPaddle) {
        // Looking down at the paddle from the front, so its face reads as an oval and the ball rises above it.
        cam.position.set(0, 10 * Math.sin(0.56), 10 * Math.cos(0.56));
        cam.lookAt(0, 0, 0);
      } else cam.position.z = 6;
      let halfW = 1, halfH = 1;
      const size = () => {
        const w = el.clientWidth, h = el.clientHeight;
        halfW = 1 / fit;
        halfH = (halfW * h) / w;
        // With a paddle, its centre sits low and right of the middle, leaving room above for the bounce.
        const [cx, cy] = withPaddle ? [0.14, -0.3] : [0, 0];
        cam.left = -halfW * (1 + cx); cam.right = halfW * (1 - cx); cam.top = halfH * (1 - cy); cam.bottom = -halfH * (1 + cy);
        cam.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };

      const scene = new T.Scene();
      const light = new T.DirectionalLight(0xffffff, 3);
      light.position.set(-2, 3, 4);
      scene.add(light);
      // Two flat tones: lit, and one hard shadow band.
      const steps = new T.DataTexture(new Uint8Array([196, 255]), 2, 1, T.RedFormat);
      steps.minFilter = steps.magFilter = T.NearestFilter;
      steps.needsUpdate = true;

      const ball = new T.Group(), spinner = new T.Group();
      ball.add(spinner);
      const sphere = new T.SphereGeometry(1, 40, 28), disc = new T.CircleGeometry(0.115, 18);
      const skin = new T.MeshToonMaterial({ color: FILL[color], gradientMap: steps });
      const ink = new T.MeshBasicMaterial({ color: INK }), rim = new T.MeshBasicMaterial({ color: INK, side: T.BackSide });
      spinner.add(new T.Mesh(sphere, skin));
      const outline = new T.Mesh(sphere, rim);
      outline.scale.setScalar(1.075);
      ball.add(outline);
      // Holes spread evenly over the ball, lying just above the surface.
      const up = new T.Vector3(0, 0, 1), n = new T.Vector3();
      for (let i = 0; i < HOLES; i++) {
        const y = 1 - (2 * (i + 0.5)) / HOLES, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        n.set(Math.cos(a) * r, y, Math.sin(a) * r);
        const hole = new T.Mesh(disc, ink);
        hole.position.copy(n).multiplyScalar(1.004);
        hole.quaternion.setFromUnitVectors(up, n);
        spinner.add(hole);
      }
      spinner.rotation.set(0.5, 0.3, 0.2);
      scene.add(ball);

      // The paddle: black face with a dashed yellow ring, white handle with a black outline.
      const paddle = new T.Group(), extra: { dispose(): void }[] = [];
      if (withPaddle) {
        const faceG = new T.CylinderGeometry(1, 1, 0.14, 48), boxG = new T.BoxGeometry(1, 1, 1), dashG = new T.RingGeometry(0.66, 0.7, 3, 1, 0, 0.11);
        const white = new T.MeshBasicMaterial({ color: 0xffffff }), gold = new T.MeshBasicMaterial({ color: FILL.yellow });
        extra.push(faceG, boxG, dashG, white, gold);
        const face = new T.Mesh(faceG, ink);
        face.scale.set(2.25, 1, 2.75);
        face.position.y = -0.07;
        const dashes = new T.Group();
        for (let i = 0; i < 26; i++) {
          const d = new T.Mesh(dashG, gold);
          d.rotation.z = (i / 26) * Math.PI * 2;
          dashes.add(d);
        }
        dashes.rotation.x = -Math.PI / 2;
        dashes.scale.set(2.25, 2.75, 1);
        dashes.position.y = 0.005;
        const grip = new T.Mesh(boxG, white), gripRim = new T.Mesh(boxG, rim);
        grip.scale.set(0.8, 0.44, 2.7);
        gripRim.scale.set(0.98, 0.62, 2.88);
        grip.position.set(0, -0.12, 3.95);
        gripRim.position.copy(grip.position);
        paddle.add(face, dashes, gripRim, grip);
        paddle.rotation.y = -0.6;
        scene.add(paddle);
      }
      // Warm-up taps: the ball drops in and keeps bouncing on the paddle. `want` is where the bounce is heading
      // (1 = full height, 0 = at rest) and `amp` follows it slowly, so a tap winds it down or back up.
      const FALL = 0.42, PEAK = 3.2;
      let want = 1, amp = 1, last = 0, falling = true, fallT = 0, hopT = 0, hopH = 0, hopD = 0, since = 9, hit = 1, turn = 0, seen = true;
      const hop = () => { hopT = 0; hopH = PEAK * amp; hopD = 0.62 * Math.sqrt(hopH / PEAK); };
      size();

      const pad = 0.27; // room for the outline between the ball and the edge of its box
      let raf = 0, t0 = 0, mode: Enter = enter, shown = false;
      const frame = (now: number) => {
        if (!t0) t0 = now;
        const t = (now - t0) / 1000;
        let done = false;
        if (mode === "drop") {
          // Falls from the top of the box, three bounces that each lose height, then rest.
          const floor = -halfH + 1 + pad, top = halfH - 1 - pad, h0 = top - floor;
          const g = 2 * h0 / 0.36 ** 2; // first fall takes 0.36s
          let tt = t, h = h0, fall = 0.36, y = floor, n = 0;
          if (tt < fall) y = floor + h - 0.5 * g * tt * tt;
          else {
            tt -= fall;
            for (; n < 3; n++) {
              h *= 0.3;
              const half = Math.sqrt((2 * h) / g);
              if (tt < 2 * half) { y = floor + g * half * tt - 0.5 * g * tt * tt; break; }
              tt -= 2 * half;
            }
            done = n === 3;
          }
          ball.position.set(0, y, 0);
          spinner.rotation.x = 0.5 + 5 * outExpo(Math.min(t / 1.5, 1));
        } else if (mode === "roll") {
          // Rolls in from the right edge and slows to a stop; the turn matches the distance covered.
          const k = outExpo(Math.min(t / 1.1, 1)), x = (halfW + 1.3) * (1 - k);
          ball.position.set(x, 0, 0);
          spinner.rotation.z = 0.2 + x;
          done = t >= 1.1;
        } else if (mode === "paddle") {
          const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
          last = now;
          amp += (want - amp) * Math.min(1, dt * 1.3);
          since += dt;
          let y = 0;
          const land = () => { since = 0; hit = Math.min(1, hopH / PEAK + 0.12); hop(); };
          if (falling) {
            fallT += dt;
            y = 6.5 * Math.max(0, 1 - (fallT / FALL) ** 2);
            if (fallT >= FALL) { falling = false; hopH = PEAK; land(); }
          } else if (hopH < 0.04) {
            // Resting on the paddle. Starts hopping again once the bounce is wanted back.
            if (want && amp > 0.03) hop();
            else done = !want && since > 0.7;
          } else {
            hopT += dt;
            if (hopT >= hopD) land();
            if (hopH >= 0.04) { const u = hopT / hopD; y = 4 * hopH * u * (1 - u); }
          }
          // Each hit pushes the paddle down a touch and it springs back.
          const dip = -0.3 * hit * Math.exp(-9 * since);
          paddle.position.y = dip;
          paddle.rotation.x = -0.5 * dip;
          ball.position.set(0, 1 + y + dip, 0);
          turn += dt * (0.15 + amp);
          spinner.rotation.x = 0.5 + turn * 1.6;
          spinner.rotation.z = 0.2 + turn * 0.7;
          // Off screen: stop drawing until it scrolls back into view.
          if (!seen) done = true;
        } else {
          const k = outExpo(Math.min(t / 1.2, 1));
          ball.scale.setScalar(0.7 + 0.3 * k);
          spinner.rotation.y = 0.3 + (1 - k) * -5;
          done = t >= 1.2;
        }
        renderer.render(scene, cam);
        if (!shown) { shown = true; ready.current?.(); }
        raf = done ? 0 : requestAnimationFrame(frame);
      };
      const play = (m: Enter) => {
        if (raf) return;
        mode = m; t0 = 0;
        raf = requestAnimationFrame(frame);
      };
      play(enter);

      // A tap gives the ball one more turn. On the paddle it winds the bouncing down to a stop, or back up.
      const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
      const tap = () => {
        if (!withPaddle) return play("spin");
        want = want ? 0 : 1;
        wake();
      };
      cv.addEventListener("pointerdown", tap);
      const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && withPaddle && (want || hopH >= 0.04)) wake(); });
      if (withPaddle) io.observe(el);
      const ro = new ResizeObserver(() => { size(); if (!raf) renderer.render(scene, cam); });
      ro.observe(el);

      stop = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        cv.removeEventListener("pointerdown", tap);
        [sphere, disc, skin, ink, rim, steps, ...extra].forEach((x) => x.dispose());
        renderer.dispose();
        cv.remove();
      };
      if (gone) stop();
    }).catch(() => {});

    return () => { gone = true; stop(); };
  }, [enter, color, fit]);

  return <div ref={host} className={`ball3d ${className || ""}`} />;
}
