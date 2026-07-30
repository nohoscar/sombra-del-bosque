// Sistema de efectos visuales y ambiente: cielo, luna, estrellas, parallax de
// árboles lejanos, niebla animada, partículas (luciérnagas y hojas) y grano de film.
const FX = {
  time: 0,
  stars: [],
  fireflies: [],
  leaves: [],
  fogBands: [],
  grainCanvas: null,
  grainCtx: null,

  init(W, H) {
    this.time = 0;

    // Estrellas fijas en el cielo (screen space)
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.5,
        r: Math.random() * 1.4 + 0.3,
        tw: Math.random() * Math.PI * 2,
      });
    }

    // Luciérnagas repartidas por el mundo
    this.fireflies = [];
    const count = Math.floor(Level.width / 260);
    for (let i = 0; i < count; i++) {
      this.fireflies.push({
        x: Math.random() * Level.width,
        y: 260 + Math.random() * 200,
        phase: Math.random() * Math.PI * 2,
        amp: 12 + Math.random() * 20,
        speed: 0.4 + Math.random() * 0.6,
        blink: Math.random() * Math.PI * 2,
      });
    }

    // Hojas cayendo
    this.leaves = [];
    for (let i = 0; i < 45; i++) {
      this.leaves.push(this._newLeaf(true));
    }

    // Bandas de niebla (parallax lento)
    this.fogBands = [];
    for (let i = 0; i < 3; i++) {
      this.fogBands.push({
        y: 300 + i * 80,
        speed: 8 + i * 6,
        offset: Math.random() * 2000,
        alpha: 0.05 + i * 0.03,
        scale: 1 + i * 0.5,
      });
    }

    // Textura de grano de film precalculada
    this._buildGrain(W, H);
  },

  _newLeaf(spread) {
    return {
      x: Math.random() * Level.width,
      y: spread ? Math.random() * Level.height : -20,
      vx: -10 - Math.random() * 20,
      vy: 20 + Math.random() * 30,
      sway: Math.random() * Math.PI * 2,
      size: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      color: Math.random() > 0.5 ? "#6b4a2a" : "#7a5a2e",
    };
  },

  _buildGrain(W, H) {
    // Media resolución para rendimiento; se escala al dibujar
    this.grainCanvas = document.createElement("canvas");
    this.grainCanvas.width = Math.ceil(W / 2);
    this.grainCanvas.height = Math.ceil(H / 2);
    this.grainCtx = this.grainCanvas.getContext("2d");
    this._grainFrame = 0;
  },

  update(dt) {
    this.time += dt;

    for (const f of this.fireflies) {
      f.phase += f.speed * dt;
      f.blink += dt * 2;
    }

    for (const l of this.leaves) {
      l.sway += dt * 2;
      l.x += (l.vx + Math.sin(l.sway) * 12) * dt;
      l.y += l.vy * dt;
      l.rot += dt;
      if (l.y > Level.height + 20 || l.x < -20) {
        Object.assign(l, this._newLeaf(false));
        l.x = Math.random() * Level.width;
      }
    }
  },

  // --- Cielo, luna y estrellas (screen space, fijo) ---
  drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b0a18");
    g.addColorStop(0.45, "#171426");
    g.addColorStop(0.75, "#241f33");
    g.addColorStop(1, "#2b2436");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Estrellas titilantes
    for (const s of this.stars) {
      const a = 0.4 + Math.sin(this.time * 2 + s.tw) * 0.35;
      ctx.fillStyle = `rgba(220,225,255,${Math.max(0, a)})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // Luna con halo
    const mx = W - 150, my = 100;
    const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 120);
    halo.addColorStop(0, "rgba(200,210,235,0.28)");
    halo.addColorStop(1, "rgba(200,210,235,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 120, my - 120, 240, 240);
    ctx.fillStyle = "#d6dcec";
    ctx.beginPath();
    ctx.arc(mx, my, 42, 0, Math.PI * 2);
    ctx.fill();
    // Cráteres
    ctx.fillStyle = "#c2c8da";
    ctx.beginPath(); ctx.arc(mx - 12, my - 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 14, my + 10, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 6, my - 18, 4, 0, Math.PI * 2); ctx.fill();
  },

  // --- Árboles lejanos en silueta (parallax lento) ---
  drawFarTrees(ctx, camX, W, H) {
    const par = camX * 0.35;
    ctx.save();
    ctx.translate(-par % 400, 0);
    ctx.fillStyle = "#100e1c";
    for (let i = -1; i < W / 200 + 2; i++) {
      const bx = i * 200;
      const th = 260 + (i % 3) * 40;
      ctx.beginPath();
      ctx.moveTo(bx, H);
      ctx.lineTo(bx + 30, H - th);
      ctx.lineTo(bx + 60, H);
      ctx.closePath();
      ctx.fill();
      // copa redondeada
      ctx.beginPath();
      ctx.ellipse(bx + 30, H - th, 50, 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // --- Luciérnagas (mundo, dentro del translate de cámara) ---
  drawFireflies(ctx) {
    for (const f of this.fireflies) {
      const fx = f.x + Math.cos(f.phase) * f.amp;
      const fy = f.y + Math.sin(f.phase * 1.3) * f.amp;
      const glow = 0.3 + Math.sin(f.blink) * 0.3;
      if (glow <= 0.05) continue;
      ctx.fillStyle = `rgba(190,255,120,${glow * 0.5})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(220,255,160,${glow})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // --- Hojas cayendo (mundo) ---
  drawLeaves(ctx) {
    for (const l of this.leaves) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  // --- Niebla animada (screen space, encima del mundo) ---
  drawFog(ctx, camX, W, H) {
    const density = (Level.ambient && Level.ambient.fog) ? Level.ambient.fog : 1;
    for (const band of this.fogBands) {
      const drift = (this.time * band.speed + band.offset - camX * 0.15) % (W + 400);
      ctx.fillStyle = `rgba(180,185,200,${band.alpha * density})`;
      for (let i = -1; i < 3; i++) {
        const bx = -200 + drift + i * (W + 400) / 2 - (W + 400);
        ctx.beginPath();
        ctx.ellipse(bx + W / 2, band.y, 320 * band.scale, 60 * band.scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  // --- Grano de film + pulso de pánico (screen space, al final) ---
  drawGrain(ctx, W, H, fear) {
    // Regenera el ruido cada 2 frames (suficiente para el ojo, más barato)
    this._grainFrame = (this._grainFrame + 1) % 2;
    if (this._grainFrame === 0) {
      const gctx = this.grainCtx;
      const gw = this.grainCanvas.width, gh = this.grainCanvas.height;
      const img = gctx.createImageData(gw, gh);
      const data = img.data;
      const intensity = 30 + fear * 60;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * intensity) | 0;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = v;
      }
      gctx.putImageData(img, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.05 + fear * 0.06;
    ctx.drawImage(this.grainCanvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
  },
};
