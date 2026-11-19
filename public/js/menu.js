// Menu de inicio vivo: bosque de noche en capas, niebla, la casa, y una linterna
// que sigue al mouse (o al dedo). A veces el Esbelto aparece entre los pinos;
// si lo alumbras, desaparece con un chispazo. El menu cambia segun tu avance.
const MenuScene = {
  t: 0,
  mx: 640, my: 330,   // donde apunta la linterna (en pixeles del canvas)
  moved: 0,           // segundos desde el ultimo movimiento del mouse
  progress: 0,        // capitulos terminados (0 = nada)
  slender: null,
  nextSlender: 7,
  glitch: 0,

  init(canvas) {
    this.canvas = canvas;
    this._light = document.createElement("canvas");
    this._light.width = canvas.width; this._light.height = canvas.height;
    const mv = (e) => {
      if (!canvas.getBoundingClientRect) return;
      const r = canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) / r.width * canvas.width;
      this.my = (e.clientY - r.top) / r.height * canvas.height;
      this.moved = 3;
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerdown", mv);
    // Lugares entre los pinos donde puede aparecer [x, y, alto] (fraccion del canvas)
    this.spots = [[0.14, 0.79, 150], [0.33, 0.78, 135], [0.5, 0.8, 165], [0.88, 0.79, 145], [0.24, 0.8, 175]];
  },

  update(dt) {
    this.t += dt;
    const W = this.canvas.width, H = this.canvas.height;
    // Sin mouse, la linterna "busca" sola, despacio
    if (this.moved > 0) this.moved -= dt;
    else {
      this.mx += (W * 0.55 + Math.sin(this.t * 0.35) * W * 0.28 - this.mx) * 0.02;
      this.my += (H * 0.62 + Math.sin(this.t * 0.6) * 40 - this.my) * 0.02;
    }
    if (this.glitch > 0) this.glitch -= dt;

    if (!this.slender) {
      this.nextSlender -= dt;
      if (this.nextSlender <= 0) {
        const s = this.spots[Math.floor(Math.random() * this.spots.length)];
        const life = 5 + Math.random() * 4;
        this.slender = { x: s[0] * W, y: s[1] * H, h: s[2], a: 0, life, max: life };
      }
    } else {
      const s = this.slender;
      s.life -= dt;
      s.a = Math.min(0.85, s.a + dt * 0.35, s.life * 0.5);
      const par = (this.mx / W - 0.5) * 24;
      const lit = Math.hypot(this.mx - (s.x - par), this.my - (s.y - s.h * 0.6)) < 130;
      if (lit && s.a > 0.2) {
        this.slender = null; this.glitch = 0.45; this.nextSlender = 12 + Math.random() * 10;
        if (typeof Sound !== "undefined" && Sound.glitchBurst) Sound.glitchBurst();
      } else if (s.life <= 0) {
        this.slender = null; this.nextSlender = 8 + Math.random() * 9;
      }
    }
  },

  draw(ctx) {
    const W = this.canvas.width, H = this.canvas.height, t = this.t;
    const px = this.mx / W - 0.5;   // parallax segun la linterna

    Cinematic._sky(ctx, W, H, "#0a0c1b", "#1a1f33");
    Cinematic._stars(ctx, W, H, 80, t);
    Cinematic._moon(ctx, W * 0.8 - px * 8, 104, 30);

    this._pines(ctx, W, H * 0.72, "#121629", 20, 0.55, -px * 10 + t * 1.5, 1);
    this._fog(ctx, W, t * 10, 0.07, H * 0.66);
    if (this.slender) {
      const s = this.slender, jump = Math.random() < 0.07;
      Cinematic._slenderFar(ctx, s.x - px * 24 + (jump ? 4 : 0), s.y, s.h, jump ? s.a * 0.3 : s.a);
    }
    this._pines(ctx, W, H * 0.83, "#0b0e1a", 13, 0.85, -px * 24, 2);
    this._fog(ctx, W, t * 16, 0.09, H * 0.82);
    ctx.fillStyle = "#06070d"; ctx.fillRect(0, H * 0.86, W, H);
    this._pines(ctx, W, H * 1.05, "#030407", 6, 1.45, -px * 48, 3);
    this._house(ctx, W * 0.7 - px * 34, H * 0.9);

    // Oscuridad con el circulo de la linterna
    const L = this._light, lx = L.getContext("2d");
    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, W, H);
    lx.fillStyle = "rgba(2,3,8,0.64)"; lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = "destination-out";
    const fl = Math.random() < 0.025 ? 0.35 : 1;
    const g = lx.createRadialGradient(this.mx, this.my, 18, this.mx, this.my, 200);
    g.addColorStop(0, `rgba(0,0,0,${fl})`); g.addColorStop(0.6, `rgba(0,0,0,${fl * 0.6})`); g.addColorStop(1, "rgba(0,0,0,0)");
    lx.fillStyle = g; lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = "source-over";
    ctx.drawImage(L, 0, 0);
    const warm = ctx.createRadialGradient(this.mx, this.my, 10, this.mx, this.my, 200);
    warm.addColorStop(0, `rgba(255,236,180,${0.09 * fl})`); warm.addColorStop(1, "rgba(255,236,180,0)");
    ctx.fillStyle = warm; ctx.fillRect(0, 0, W, H);

    // Chispazo al alumbrarlo
    if (this.glitch > 0) {
      const k = this.glitch / 0.45;
      for (let i = 0; i < 7; i++) {
        const y = Math.random() * H, h = 4 + Math.random() * 26;
        ctx.drawImage(this.canvas, 0, y, W, h, (Math.random() - 0.5) * 70 * k, y, W, h);
      }
      ctx.fillStyle = `rgba(220,225,235,${0.18 * k})`; ctx.fillRect(0, 0, W, H);
    }
  },

  // Fila de pinos; cada capa tiene su propia semilla para que no se repitan
  _pines(ctx, W, baseY, color, n, scale, off, seed) {
    ctx.fillStyle = color;
    const step = W / n, span = W + step * 2;
    for (let i = 0; i <= n + 1; i++) {
      const r = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453, fr = r - Math.floor(r);
      const x = ((i * step + off + fr * step * 0.6) % span + span) % span - step;
      const h = (120 + fr * 90) * scale, w = (24 + fr * 14) * scale;
      ctx.fillRect(x - 3 * scale, baseY - h * 0.25, 6 * scale, h * 0.25);
      for (let k = 0; k < 4; k++) {
        const ty = baseY - h * 0.18 - k * h * 0.2, tw = w * (1 - k * 0.2);
        ctx.beginPath(); ctx.moveTo(x - tw, ty); ctx.lineTo(x, ty - h * 0.36); ctx.lineTo(x + tw, ty); ctx.closePath(); ctx.fill();
      }
    }
  },

  _fog(ctx, W, shift, alpha, y) {
    for (let i = 0; i < 6; i++) {
      const x = ((i * 240 + shift) % (W + 520)) - 260;
      const g = ctx.createRadialGradient(x, y, 10, x, y, 260);
      g.addColorStop(0, `rgba(150,160,185,${alpha})`); g.addColorStop(1, "rgba(150,160,185,0)");
      ctx.fillStyle = g; ctx.fillRect(x - 260, y - 260, 520, 520);
    }
  },

  // La casa cambia segun el avance: luz prendida, luego apagada y la puerta abierta
  _house(ctx, x, base) {
    const p = this.progress;
    ctx.fillStyle = "#13111d";
    ctx.fillRect(x, base - 70, 112, 70);
    ctx.beginPath(); ctx.moveTo(x - 8, base - 70); ctx.lineTo(x + 56, base - 108); ctx.lineTo(x + 120, base - 70); ctx.closePath(); ctx.fill();
    const lit = p === 0, flick = lit && Math.random() < 0.04;
    ctx.fillStyle = lit && !flick ? "#e8b860" : "#1a2034";
    ctx.fillRect(x + 68, base - 54, 22, 18);
    if (lit && !flick) {
      const g = ctx.createRadialGradient(x + 79, base - 45, 4, x + 79, base - 45, 60);
      g.addColorStop(0, "rgba(255,200,110,0.35)"); g.addColorStop(1, "rgba(255,200,110,0)");
      ctx.fillStyle = g; ctx.fillRect(x + 19, base - 105, 120, 120);
    }
    ctx.fillStyle = p >= 1 ? "#030306" : "#2a2018";
    ctx.fillRect(x + 18, base - 38, 18, 38);
    if (p >= 2) {
      // La gorra de Tommy colgada de una rama
      ctx.strokeStyle = "#0b0e1a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 90, base - 96); ctx.lineTo(x - 40, base - 84); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = "#8a2424";
      ctx.beginPath(); ctx.arc(x - 52, base - 80, 7, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - 59, base - 81, 18, 3);
    }
  },
};
