// Canvas "symbols" for each research topic. Each animation is a small
// self-contained sketch. They pause when off-screen and render a single
// static frame when the visitor prefers reduced motion.
(function () {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;

  function hexToRgb(hex) {
    hex = hex.trim().replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function alpha(hex, a) {
    if (!hex.startsWith("#")) return hex; // already rgba()
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function palette(el) {
    const cs = getComputedStyle(el);
    const v = n => cs.getPropertyValue(n).trim();
    return { ink: v("--ink"), ink2: v("--ink-2"), ink3: v("--ink-3"), accent: v("--accent"), accent2: v("--accent-2") };
  }

  const ANIMS = {};

  /* ---- 1. String star: a tangled closed string, slowly morphing, inside its would-be horizon ---- */
  ANIMS.stringStar = () => {
    // A closed curve built from many Fourier modes with a rough (slowly decaying)
    // spectrum, each mode drifting at its own rate: a string that keeps re-tangling.
    const K = 28, N = 1400;
    const modes = [];
    return {
      init() {
        modes.length = 0;
        for (let k = 1; k <= K; k++) {
          const amp = k === 1 ? 0.5 : 0.4 / Math.pow(k, 0.4);
          const rate = () => (0.04 + 0.12 * Math.random()) * (1 + 0.08 * k) * (Math.random() < 0.5 ? -1 : 1);
          modes.push({ k, ax: amp * (0.8 + 0.4 * Math.random()), ay: amp * (0.8 + 0.4 * Math.random()),
            px: Math.random() * TAU, py: Math.random() * TAU, wx: rate(), wy: rate() });
        }
      },
      draw(ctx, w, h, t, c) {
        const m = Math.min(w, h), cx = w / 2, cy = h / 2, R = m * 0.1;
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.42);
        grd.addColorStop(0, alpha(c.accent, 0.18));
        grd.addColorStop(1, alpha(c.accent, 0));
        ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
        // would-be horizon
        ctx.setLineDash([3, 6]); ctx.lineWidth = 1; ctx.strokeStyle = alpha(c.ink3, 0.8);
        ctx.beginPath(); ctx.arc(cx, cy, m * 0.4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        // the string
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const th = i / N * TAU;
          let x = 0, y = 0;
          for (const m of modes) {
            x += m.ax * Math.cos(m.k * th + m.px + m.wx * t);
            y += m.ay * Math.sin(m.k * th + m.py + m.wy * t);
          }
          if (i === 0) ctx.moveTo(cx + R * x, cy + R * y); else ctx.lineTo(cx + R * x, cy + R * y);
        }
        ctx.strokeStyle = c.ink; ctx.lineWidth = m < 150 ? 0.9 : 1.2; ctx.lineJoin = "round"; ctx.stroke();
      }
    };
  };

  /* ---- 2. Holography: geodesics drifting through the Poincaré disk ---- */
  ANIMS.holography = () => {
    const geos = [];
    return {
      init() {
        geos.length = 0;
        for (let i = 0; i < 10; i++) {
          geos.push({ a: Math.random() * TAU, s: (0.05 + Math.random() * 0.1) * (Math.random() < 0.5 ? -1 : 1), w: 0.5 + Math.random() * 2.2 });
        }
      },
      draw(ctx, w, h, t, c) {
        const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.43;
        // bulk depth: hyperbolic circles of constant radius
        ctx.lineWidth = 1;
        for (let k = 1; k <= 4; k++) {
          ctx.strokeStyle = alpha(c.ink3, 0.28);
          ctx.beginPath(); ctx.arc(cx, cy, R * Math.tanh(k * 0.45), 0, TAU); ctx.stroke();
        }
        // geodesics
        for (const g of geos) {
          const a = g.a + t * g.s, b = a + g.w;
          const m = (a + b) / 2, hh = (b - a) / 2;
          const ax = cx + R * Math.cos(a), ay = cy + R * Math.sin(a);
          const bx = cx + R * Math.cos(b), by = cy + R * Math.sin(b);
          ctx.strokeStyle = alpha(c.accent, 0.85); ctx.lineWidth = 1.3;
          ctx.beginPath();
          if (Math.abs(Math.cos(hh)) < 1e-3) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
          else {
            const d = R / Math.cos(hh), Cx = cx + d * Math.cos(m), Cy = cy + d * Math.sin(m), r = R * Math.abs(Math.tan(hh));
            const angA = Math.atan2(ay - Cy, ax - Cx), angB = Math.atan2(by - Cy, bx - Cx);
            let diff = (angB - angA) % TAU; if (diff < 0) diff += TAU;
            ctx.arc(Cx, Cy, r, angA, angB, diff > Math.PI);
          }
          ctx.stroke();
          // boundary operators
          ctx.fillStyle = c.accent2;
          ctx.beginPath(); ctx.arc(ax, ay, 2.6, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, TAU); ctx.fill();
        }
        // the boundary
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      }
    };
  };

  /* ---- 3. Chaos: two Lorenz trajectories that start a hair apart ---- */
  ANIMS.chaos = () => {
    // SPEED is Lorenz time units per real second; the other symbols drift slowly, so keep it low.
    const S = 10, RHO = 28, B = 8 / 3, DT = 0.006, LEN = 1100, LIFE = 3200, SPEED = 0.35;
    let A, Bp, trA = [], trB = [], age = 0, last = null, acc = 0;
    function integ(p) {
      const dx = S * (p.y - p.x), dy = p.x * (RHO - p.z) - p.y, dz = p.x * p.y - B * p.z;
      p.x += dx * DT; p.y += dy * DT; p.z += dz * DT;
    }
    function reset() {
      Bp = { x: A.x + 1e-4, y: A.y, z: A.z }; trA = []; trB = []; age = 0;
    }
    function tick(n) {
      for (let i = 0; i < n; i++) {
        integ(A); integ(Bp);
        trA.push([A.x, A.z]); trB.push([Bp.x, Bp.z]);
        if (trA.length > LEN) { trA.shift(); trB.shift(); }
      }
      age += n;
    }
    function trail(ctx, tr, col, w, h) {
      // Lorenz x spans about ±20 and z about 0–50; map that to a box that sits inside the circle.
      const m = Math.min(w, h);
      const sx = x => w / 2 + x * (m * 0.0165), sy = z => h / 2 + (25 - z) * (m * 0.0132);
      const CH = 24;  // segments per stroke: the tail fades in chunks, which keeps draw calls low
      for (let i = 1; i < tr.length; i += CH) {
        const end = Math.min(i + CH, tr.length);
        ctx.strokeStyle = alpha(col, 0.06 + 0.94 * (end / tr.length));
        ctx.beginPath(); ctx.moveTo(sx(tr[i - 1][0]), sy(tr[i - 1][1]));
        for (let j = i; j < end; j++) ctx.lineTo(sx(tr[j][0]), sy(tr[j][1]));
        ctx.stroke();
      }
      const last = tr[tr.length - 1];
      if (last) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx(last[0]), sy(last[1]), 2.8, 0, TAU); ctx.fill(); }
    }
    return {
      init() {
        A = { x: 1, y: 1, z: 1 };
        for (let i = 0; i < 3000; i++) integ(A);
        reset(); tick(reduceMotion ? 1100 : 900);
      },
      draw(ctx, w, h, t, c) {
        if (!reduceMotion) {
          if (last === null) last = t;
          acc += Math.min(t - last, 0.1) * SPEED; last = t;
          while (acc >= DT) { tick(1); acc -= DT; }
          if (age > LIFE) reset();
        }
        const fade = Math.min(1, age / 40, (LIFE - age) / 90 + 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, fade));
        ctx.lineWidth = 1.2; ctx.lineCap = "round";
        trail(ctx, trB, c.accent2, w, h);
        trail(ctx, trA, c.accent, w, h);
        ctx.globalAlpha = 1;
      }
    };
  };

  /* ---- 4. Cosmology: a universe with no boundary, growing out of nothing ---- */
  ANIMS.cosmos = () => {
    const RINGS = 8, STEPS = 90, SQUASH = 0.3;
    return {
      init() {},
      draw(ctx, w, h, t, c) {
        const R = Math.min(h * 0.34, w * 0.26);        // radius of the Euclidean cap
        const H = R + R * Math.acosh(1.5);              // height of the geometry, pole to rim
        const cx = w / 2;
        // profile radius as a function of height above the pole: sphere, then expansion
        const prof = y => y <= R ? Math.sqrt(Math.max(0, R * R - (R - y) * (R - y))) : R * Math.cosh((y - R) / R);
        const rt = prof(H), e = rt * SQUASH;            // top rim radius and the rim ellipse's half-height
        // Optical centering: put the centroid of the silhouette (bowl + rim ellipse) at the canvas
        // center. Plain bounding-box centering reads as too high because the wide rim carries
        // most of the visual weight.
        let num = 0, den = 0;
        for (let i = 0; i <= STEPS; i++) { const y = H * i / STEPS, wgt = prof(y) * (H / STEPS); num += y * wgt; den += wgt; }
        for (let i = 0; i <= 24; i++) { const y = H + e * i / 24, wgt = rt * Math.sqrt(Math.max(0, 1 - ((y - H) / e) ** 2)) * (e / 24); num += y * wgt; den += wgt; }
        const y0 = h / 2 + num / den;                   // canvas y of the south pole
        const path = (fx, fy) => {
          ctx.beginPath();
          for (let i = 0; i <= STEPS; i++) {
            const y = H * i / STEPS, r = prof(y);
            const X = fx(r, y), Y = fy(r, y);
            i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
          }
          ctx.stroke();
        };
        // meridians (front side only)
        ctx.lineWidth = 1;
        for (const ph of [-0.75, 0, 0.75]) {
          ctx.strokeStyle = alpha(c.ink3, 0.45);
          path((r, y) => cx + r * Math.sin(ph), (r, y) => y0 - y + r * SQUASH * Math.cos(ph));
        }
        // slices of time drifting upward: the universe expanding
        for (let k = 0; k < RINGS; k++) {
          const u = ((k / RINGS) + t * 0.03) % 1;
          const y = u * H, r = prof(y);
          const fade = Math.sin(Math.PI * u);
          ctx.strokeStyle = alpha(c.accent, 0.8 * fade); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(cx, y0 - y, Math.max(r, 0.01), Math.max(r * SQUASH, 0.01), 0, 0, TAU); ctx.stroke();
        }
        // where Euclidean meets Lorentzian
        ctx.setLineDash([3, 5]); ctx.strokeStyle = alpha(c.accent2, 0.9); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, y0 - R, R, R * SQUASH, 0, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        // outline
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
        path((r, y) => cx - r, (r, y) => y0 - y);
        path((r, y) => cx + r, (r, y) => y0 - y);
        ctx.beginPath(); ctx.ellipse(cx, y0 - H, rt, rt * SQUASH, 0, 0, TAU); ctx.lineWidth = 1.2; ctx.stroke();
      }
    };
  };

  /* ---- mounting ---- */
  function mount(canvas, name) {
    const make = ANIMS[name];
    if (!make) return;
    const anim = make();
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, running = false, ready = false, raf = 0, colors = palette(canvas);
    const t0 = performance.now();

    function frame(now) {
      if (!ready) { if (running) raf = requestAnimationFrame(frame); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      anim.draw(ctx, w, h, (now - t0) / 1000, colors);
      if (running) raf = requestAnimationFrame(frame);
    }
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.round(rect.width); h = Math.round(rect.height);
      canvas.width = w * dpr; canvas.height = h * dpr;
      anim.init(w, h);
      ready = true;
      if (!running) frame(performance.now());
    }
    function start() { if (running || reduceMotion) return; if (!ready) resize(); running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop()), { threshold: 0.05 }).observe(canvas);
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
    window.addEventListener("themechange", () => { colors = palette(canvas); if (!running) frame(performance.now()); });
  }

  window.mountAnim = mount;
  window.mountAllAnims = root => (root || document).querySelectorAll("canvas[data-anim]").forEach(c => {
    if (c.dataset.mounted) return; c.dataset.mounted = "1"; mount(c, c.dataset.anim);
  });
})();
