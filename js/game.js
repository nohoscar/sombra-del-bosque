// Lógica central: bucle de estado, cámara, HUD, interacciones, progresión de noches.
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = canvas.width;
    this.H = canvas.height;

    this.player = new Player();
    this.slenders = [];
    this.fear = { value: 0 };
    this.camX = 0;
    this.rocks = [];
    this.state = "menu";   // menu | playing | note | nightcomplete | gameover | win
    this.message = "";
    this.messageTimer = 0;
    this.shake = 0;

    // Canvas auxiliar para la máscara de iluminación
    this.lightCanvas = document.createElement("canvas");
    this.lightCanvas.width = this.W;
    this.lightCanvas.height = this.H;
    this.lightCtx = this.lightCanvas.getContext("2d");

    this.callbacks = {};
  }

  on(event, fn) { this.callbacks[event] = fn; }
  _emit(event, data) { if (this.callbacks[event]) this.callbacks[event](data); }

  // Arranca desde la primera noche
  start() { this.beginNight(0); }

  // Carga y comienza una noche concreta
  beginNight(i) {
    Level.load(i);
    this.player.reset();
    this.slenders = Level.slenderConfigs.map((c) => new Slender(c));
    this.fear.value = 0;
    this.corruption = 0;
    this.rocks = [];
    this.camX = 0;
    this.shake = 0;
    this._lastFoot = 0;
    FX.init(this.W, this.H);
    Sound.startAmbience();
    this.state = "playing";
  }

  // Pasa a la siguiente noche
  nextNight() { this.beginNight(Level.current + 1); }

  // Reintenta la noche actual (no reinicia todo el juego)
  retry() { this.beginNight(Level.current); }

  resumeFromNote() {
    if (this.state === "note") this.state = "playing";
  }

  // Estado global de tensión (el peor de todos los enemigos)
  threatState() {
    if (this.slenders.some((s) => s.state === "chase")) return "chase";
    if (this.slenders.some((s) => s.state === "suspicious")) return "suspicious";
    return "patrol";
  }

  update(dt) {
    if (this.state !== "playing") return;

    this.player.update(dt);

    // --- Estática / Cordura ---
    // Mirar al Esbelto (estar de frente y verlo en pantalla) llena la estática.
    // Mirar a otro lado o esconderte la recupera.
    let rise = 0;
    let anyChase = false;
    for (const s of this.slenders) {
      s.update(dt, this.player);
      if (s.state === "chase") anyChase = true;
      if (!this.player.hidden) {
        const dx = s.cx - this.player.cx;
        const d = Math.abs(dx);
        const sx = s.cx - this.camX;
        const onScreen = sx > -40 && sx < this.W + 40;
        const facingHim = Math.sign(dx) === this.player.facing;
        // Mirarlo fijo: cuanto más cerca y de frente, más rápido sube
        if (onScreen && facingHim && d < 480) rise = Math.max(rise, (1 - d / 480) * 26);
        // Dread por cercanía extrema aunque mires a otro lado
        if (d < 200) rise = Math.max(rise, 9);
      }
    }
    if (anyChase) rise += 45;
    rise *= Difficulty.get().fearMul;

    if (this.player.hidden) {
      this.fear.value -= 30 * dt;            // escondido: te calmas rápido
    } else if (rise > 0.5) {
      this.fear.value += rise * dt;          // expuesto / mirándolo
    } else {
      this.fear.value -= 16 * dt;            // mirando a otro lado y a salvo
    }
    this.fear.value = Math.max(0, Math.min(100, this.fear.value));

    // Nivel de corrupción (0..1): empieza a manifestarse pasada la mitad
    this.corruption = Math.max(0, Math.min(1, (this.fear.value - 55) / 45));
    this.player.corruption = this.corruption;

    // --- Audio ---
    Sound.update(dt);
    Sound.setStatic(this.fear.value / 100);
    Sound.setTension(Math.min(1, this.fear.value / 100 + (anyChase ? 0.35 : 0)));
    // Pasos: dispara al alternar la fase de caminado en el suelo
    if (this.player.onGround && Math.abs(this.player.vx) > 5) {
      const foot = Math.floor(this.player.walkCycle / Math.PI);
      if (foot !== this._lastFoot) { Sound.footstep(this.player.running); this._lastFoot = foot; }
    }

    this._updateRocks(dt);
    this._updateCamera();
    this._handleInteractions();
    FX.update(dt);

    // Temblor de pantalla según amenaza
    const threat = this.threatState();
    const targetShake = threat === "chase" ? 6 : threat === "suspicious" ? 2 : 0;
    this.shake += (targetShake - this.shake) * 0.1;

    if (this.messageTimer > 0) this.messageTimer -= dt;

    if (this.slenders.some((s) => s.caught) || this.fear.value >= 100) {
      this._lose();
    }
  }

  _updateRocks(dt) {
    for (const r of this.rocks) {
      r.vy += 900 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (r.y >= Level.groundY) {
        r.y = Level.groundY;
        r.landed = true;
        const point = { x: r.x, y: Level.groundY };
        this.slenders.forEach((s) => s.hearRock(point));
      }
    }
    this.rocks = this.rocks.filter((r) => !r.landed);
  }

  _updateCamera() {
    const target = this.player.cx - this.W / 2;
    this.camX += (target - this.camX) * 0.1;
    this.camX = Math.max(0, Math.min(Level.width - this.W, this.camX));
  }

  _handleInteractions() {
    const p = this.player;

    if (Input.wasPressed("throw")) {
      if (p.rocks > 0) {
        p.rocks--;
        this.rocks.push({ x: p.cx, y: p.cy, vx: p.facing * 260, vy: -180, landed: false });
      } else {
        this._notify("Sin piedras");
      }
    }

    // Baterías (se recogen automáticamente al pasar por encima)
    for (const b of Level.batteries) {
      if (!b.taken && Math.abs(p.cx - b.x) < 30 && Math.abs(p.cy - b.y) < 60) {
        b.taken = true;
        p.addBattery(45);
        this._notify("+ Batería");
      }
    }

    // Notas
    let nearPage = null;
    for (const page of Level.pages) {
      if (!page.collected && Math.abs(p.cx - (page.x + 12)) < 40 && Math.abs(p.cy - page.y) < 70) {
        nearPage = page;
      }
    }
    if (nearPage) {
      this._notify("E: examinar");
      if (Input.wasPressed("interact")) {
        nearPage.collected = true;
        this.state = "note";
        this._emit("note", { kind: nearPage.kind, title: nearPage.title, text: nearPage.text });
      }
    }

    // Generadores
    for (const g of Level.generators) {
      if (!g.active && Math.abs(p.cx - (g.x + g.w / 2)) < 50 && Math.abs(p.cy - (g.y + g.h / 2)) < 70) {
        this._notify("E: activar generador");
        if (Input.wasPressed("interact")) {
          g.active = true;
          this._notify("Generador encendido.");
        }
      }
    }

    // Puerta de salida
    const e = Level.exit;
    if (Math.abs(p.cx - (e.x + e.w / 2)) < 55 && Math.abs(p.cy - (e.y + e.h / 2)) < 90) {
      const st = Level.canExit();
      if (st.gensOff > 0) {
        this._notify(`Faltan ${st.gensOff} generador(es) por activar.`);
      } else if (st.pagesLeft > 0) {
        this._notify(`Faltan ${st.pagesLeft} nota(s) antes de poder irte.`);
      } else {
        this._notify("E: escapar");
        if (Input.wasPressed("interact")) this._winNight();
      }
    }
  }

  _notify(msg) {
    this.message = msg;
    this.messageTimer = 0.5;
  }

  _lose() {
    this.state = "gameover";
    Sound.stinger();
    Sound.stopReading();
    Sound.stopAmbience();
    this._emit("gameover", { night: Level.current + 1 });
  }

  _winNight() {
    Sound.stopAmbience();
    if (Level.current + 1 < Level.totalNights) {
      this.state = "nightcomplete";
      this._emit("nightcomplete", { completed: Level.current + 1 });
    } else {
      this.state = "win";
      this._emit("win");
    }
  }

  // ---------- RENDER ----------
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.state === "menu") return;

    // Capas fijas de fondo (no se mueven con la cámara del mundo)
    FX.drawSky(ctx, this.W, this.H);
    FX.drawFarTrees(ctx, this.camX, this.W, this.H);

    // Temblor de pantalla
    const sh = this.shake || 0;
    const ox = (Math.random() - 0.5) * sh;
    const oy = (Math.random() - 0.5) * sh;

    ctx.save();
    ctx.translate(-Math.round(this.camX) + ox, oy);

    this._drawBackground(ctx);
    this._drawPlatforms(ctx);
    this._drawProps(ctx);
    FX.drawFireflies(ctx);
    Level.generators.forEach((g) => this._drawGenerator(ctx, g));
    this._drawExit(ctx);
    this._drawPages(ctx);
    this._drawBatteries(ctx);
    this._drawBushes(ctx, false);
    this._drawRocks(ctx);
    this.slenders.forEach((s) => s.draw(ctx));
    this.player.draw(ctx);
    this._drawBushes(ctx, true);
    FX.drawLeaves(ctx);

    ctx.restore();

    // Tinte de ambiente de la noche (wash de color)
    if (Level.ambient) {
      ctx.fillStyle = Level.ambient.tint;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    FX.drawFog(ctx, this.camX, this.W, this.H);
    this._drawDarkness(ctx);
    FX.drawGrain(ctx, this.W, this.H, this.fear.value / 100);
    this._drawHUD(ctx);

    // Corrupción de imagen por estática alta (glitch)
    if (this.corruption > 0.04) this._drawCorruption(ctx, this.corruption);
  }

  // Bandas glitch, desplazamientos y desgarro de color según la estática
  _drawCorruption(ctx, c) {
    const W = this.W, H = this.H, cv = this.canvas;
    const bands = Math.floor(2 + c * 9);

    // Desplazar tiras horizontales de la propia imagen
    for (let i = 0; i < bands; i++) {
      const y = Math.random() * H;
      const h = 4 + Math.random() * 22;
      const off = (Math.random() - 0.5) * 70 * c;
      ctx.drawImage(cv, 0, y, W, h, off, y, W, h);
    }

    // Líneas de color (scanlines rotas)
    ctx.save();
    ctx.globalAlpha = 0.12 * c;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? "#ff2a2a" : "#2affe0";
      ctx.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2);
    }
    ctx.restore();

    // Desgarro RGB fuerte cuando la estática es crítica
    if (c > 0.6) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.16 * c;
      ctx.drawImage(cv, -7 * c, 0);
      ctx.drawImage(cv, 7 * c, 0);
      ctx.restore();
    }
  }

  _drawBackground(ctx) {
    // Árboles de rango medio (con parallax leve dado por el translate de cámara)
    for (const t of Level.trees) {
      const tw = 54 * t.s;
      const th = 360 * t.s;
      const tx = t.x;
      const ty = Level.groundY - th;
      // tronco con textura
      const bark = ctx.createLinearGradient(tx, 0, tx + tw, 0);
      bark.addColorStop(0, "#2d2436");
      bark.addColorStop(0.5, "#38304a");
      bark.addColorStop(1, "#241d30");
      ctx.fillStyle = bark;
      ctx.fillRect(tx, ty, tw, th);
      // líneas de corteza
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(tx + tw * 0.25, ty, 2, th);
      ctx.fillRect(tx + tw * 0.6, ty, 2, th);
      // raíces
      ctx.fillStyle = "#241d30";
      ctx.fillRect(tx - 6, Level.groundY - 20, tw + 12, 20);
      // copa en capas
      ctx.fillStyle = "#1c1729";
      ctx.beginPath();
      ctx.ellipse(tx + tw / 2, ty + 10, tw * 1.4, tw * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#231c33";
      ctx.beginPath();
      ctx.ellipse(tx + tw / 2, ty, tw * 1.0, tw * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPlatforms(ctx) {
    for (const p of Level.platforms) {
      // tierra con degradado
      const dirt = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      dirt.addColorStop(0, "#33271b");
      dirt.addColorStop(1, "#1c150e");
      ctx.fillStyle = dirt;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // piedritas
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      for (let sx = p.x + 8; sx < p.x + p.w; sx += 47) {
        ctx.fillRect(sx, p.y + 14, 4, 3);
        ctx.fillRect(sx + 20, p.y + 26, 3, 3);
      }
      // pasto superior
      ctx.fillStyle = "#3f6b3a";
      ctx.fillRect(p.x, p.y, p.w, 5);
      ctx.fillStyle = "#4d7d45";
      for (let gx = p.x; gx < p.x + p.w; gx += 9) {
        const hgt = 3 + ((gx * 7) % 4);
        ctx.fillRect(gx, p.y - hgt, 2, hgt);
      }
    }
  }

  _drawProps(ctx) {
    const gy = Level.groundY;
    for (const p of Level.props) {
      if (p.type === "rock") {
        ctx.fillStyle = "#3a3540";
        ctx.beginPath();
        ctx.ellipse(p.x, gy - p.size * 0.4, p.size, p.size * 0.7, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#4a4550";
        ctx.beginPath();
        ctx.ellipse(p.x - p.size * 0.3, gy - p.size * 0.5, p.size * 0.4, p.size * 0.3, 0, Math.PI, 0);
        ctx.fill();
      } else if (p.type === "mushroom") {
        for (let i = 0; i < p.n; i++) {
          const mx = p.x + i * 9;
          ctx.fillStyle = "#c8cbd0";
          ctx.fillRect(mx, gy - 8, 3, 8);
          ctx.fillStyle = "#8a3540";
          ctx.beginPath();
          ctx.ellipse(mx + 1.5, gy - 8, 5, 3.5, 0, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = "#c85560";
          ctx.fillRect(mx, gy - 9, 1.5, 1.5);
        }
      } else if (p.type === "log") {
        ctx.fillStyle = "#2a2018";
        ctx.fillRect(p.x, gy - 12, p.w, 12);
        ctx.fillStyle = "#3a2c20";
        ctx.fillRect(p.x, gy - 12, p.w, 4);
        ctx.fillStyle = "#4a3628";
        ctx.beginPath();
        ctx.arc(p.x, gy - 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a1e14";
        ctx.beginPath();
        ctx.arc(p.x, gy - 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // musgo
        ctx.fillStyle = "#3f6b3a";
        for (let gx = p.x + 6; gx < p.x + p.w; gx += 8) ctx.fillRect(gx, gy - 13, 3, 2);
      } else if (p.type === "grass") {
        ctx.fillStyle = "#31502e";
        for (let i = 0; i < p.n; i++) {
          const gx = p.x + i * 4;
          ctx.fillRect(gx, gy - 10, 2, 10);
        }
      }
    }
  }

  _drawBatteries(ctx) {
    for (const b of Level.batteries) {
      if (b.taken) continue;
      const bob = Math.sin(Date.now() / 280 + b.x) * 3;
      const yy = b.y + bob;
      // halo
      ctx.fillStyle = "rgba(120,220,255,0.16)";
      ctx.beginPath();
      ctx.arc(b.x + 5, yy + 8, 16, 0, Math.PI * 2);
      ctx.fill();
      // cuerpo de pila
      ctx.fillStyle = "#2f6f8a";
      ctx.fillRect(b.x, yy, 10, 18);
      ctx.fillStyle = "#48a0c0";
      ctx.fillRect(b.x + 1, yy + 1, 8, 8);
      ctx.fillStyle = "#d8d8d8";
      ctx.fillRect(b.x + 3, yy - 2, 4, 2);
      // símbolo +
      ctx.fillStyle = "#eaffff";
      ctx.fillRect(b.x + 4, yy + 10, 2, 5);
      ctx.fillRect(b.x + 2, yy + 12, 6, 2);
    }
  }

  _drawBushes(ctx, front) {
    for (const b of Level.bushes) {
      const baseY = Level.groundY;
      ctx.fillStyle = front ? "rgba(40,80,40,0.85)" : "#2f5a30";
      const bumps = Math.floor(b.w / 30);
      for (let i = 0; i <= bumps; i++) {
        const bx = b.x + (i * b.w) / bumps;
        ctx.beginPath();
        ctx.ellipse(bx, baseY - 16, 22, 20, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = front ? "rgba(50,95,50,0.85)" : "#356436";
      ctx.fillRect(b.x - 6, baseY - 20, b.w + 12, 22);
    }
  }

  _drawPages(ctx) {
    for (const page of Level.pages) {
      if (page.collected) continue;
      const bob = Math.sin(Date.now() / 300 + page.x) * 4;
      ctx.save();
      ctx.translate(page.x, page.y + bob);
      ctx.fillStyle = "rgba(255,240,180,0.18)";
      ctx.beginPath();
      ctx.arc(12, 12, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8e0c8";
      ctx.fillRect(0, 0, 24, 28);
      ctx.fillStyle = "#8a8168";
      for (let i = 5; i < 24; i += 5) ctx.fillRect(4, i, 16, 1);
      ctx.restore();
    }
  }

  _drawGenerator(ctx, g) {
    ctx.fillStyle = g.active ? "#3a5a3a" : "#4a4a4a";
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(g.x + 8, g.y + 8, g.w - 16, g.h - 24);
    ctx.fillStyle = g.active ? "#6cff6c" : "#802020";
    ctx.beginPath();
    ctx.arc(g.x + g.w / 2, g.y + g.h - 10, 5, 0, Math.PI * 2);
    ctx.fill();
    if (g.active) {
      ctx.fillStyle = "rgba(108,255,108,0.15)";
      ctx.beginPath();
      ctx.arc(g.x + g.w / 2, g.y + g.h - 10, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawExit(ctx) {
    const e = Level.exit;
    const powered = Level.canExit().gensOff === 0;
    ctx.fillStyle = "#1a1a22";
    ctx.fillRect(e.x - 8, e.y - 8, e.w + 16, e.h + 8);
    ctx.fillStyle = powered ? "#3a2a1a" : "#241a12";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = powered ? "#5a3a22" : "#3a2a1a";
    ctx.fillRect(e.x + 6, e.y + 6, e.w - 12, e.h - 12);
    ctx.fillStyle = powered ? "#d8c060" : "#5a5040";
    ctx.beginPath();
    ctx.arc(e.x + e.w - 14, e.y + e.h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    if (powered) {
      ctx.fillStyle = "rgba(255,230,150,0.12)";
      ctx.fillRect(e.x - 20, e.y - 20, e.w + 40, e.h + 40);
    }
  }

  _drawRocks(ctx) {
    ctx.fillStyle = "#6a6a6a";
    for (const r of this.rocks) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawDarkness(ctx) {
    const fear = this.fear.value / 100;
    const p = this.player;
    const px = p.cx - this.camX;
    const py = p.cy;
    const lx = this.lightCtx;
    const W = this.W, H = this.H;

    // 1) Capa de oscuridad (más densa con el miedo)
    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, W, H);
    lx.fillStyle = `rgba(4,5,10,${0.9 + fear * 0.08})`;
    lx.fillRect(0, 0, W, H);

    // 2) "Recortamos" la luz (destination-out revela el mundo debajo)
    lx.globalCompositeOperation = "destination-out";

    // Halo ambiental alrededor de Alex (siempre)
    const amb = lx.createRadialGradient(px, py, 8, px, py, 130);
    amb.addColorStop(0, "rgba(0,0,0,0.95)");
    amb.addColorStop(1, "rgba(0,0,0,0)");
    lx.fillStyle = amb;
    lx.beginPath();
    lx.arc(px, py, 130, 0, Math.PI * 2);
    lx.fill();

    // Cono de linterna
    if (p.flashlight) {
      const dir = p.facing;
      const ox = px + dir * 6;
      const oy = py - 6;
      const len = 340;
      const cone = lx.createRadialGradient(ox, oy, 10, ox, oy, len);
      cone.addColorStop(0, "rgba(0,0,0,1)");
      cone.addColorStop(0.7, "rgba(0,0,0,0.65)");
      cone.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = cone;
      lx.beginPath();
      lx.moveTo(ox, oy);
      lx.lineTo(ox + dir * len, oy - 120);
      lx.lineTo(ox + dir * len, oy + 120);
      lx.closePath();
      lx.fill();
    }

    // Resplandor de generadores activos y puerta con energía (si están en pantalla)
    lx.fillStyle = "rgba(0,0,0,0.6)";
    for (const g of Level.generators) {
      if (!g.active) continue;
      const gx = g.x + g.w / 2 - this.camX;
      if (gx < -60 || gx > W + 60) continue;
      const gg = lx.createRadialGradient(gx, g.y, 4, gx, g.y, 90);
      gg.addColorStop(0, "rgba(0,0,0,0.7)");
      gg.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = gg;
      lx.beginPath();
      lx.arc(gx, g.y, 90, 0, Math.PI * 2);
      lx.fill();
    }

    lx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.lightCanvas, 0, 0);

    // 3) Tinte cálido de la linterna (encima, aditivo suave)
    if (p.flashlight) {
      const dir = p.facing;
      const ox = px + dir * 6, oy = py - 6, len = 340;
      const warm = ctx.createRadialGradient(ox, oy, 10, ox, oy, len);
      warm.addColorStop(0, "rgba(255,240,190,0.10)");
      warm.addColorStop(1, "rgba(255,240,190,0)");
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + dir * len, oy - 120);
      ctx.lineTo(ox + dir * len, oy + 120);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 4) Tinte rojo de pánico
    if (fear > 0.4) {
      ctx.fillStyle = `rgba(120,0,0,${(fear - 0.4) * 0.32})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _drawHUD(ctx) {
    this._bar(ctx, 20, 20, 200, 16, this.fear.value / 100,
      this.fear.value > 70 ? "#c02020" : "#7a7f90", "ESTATICA");
    this._bar(ctx, 20, 44, 200, 11, this.player.stamina / 100, "#3a7a9a", "AGUANTE");
    const batLow = this.player.battery < 25;
    this._bar(ctx, 20, 62, 200, 11, this.player.battery / 100,
      batLow ? "#c08020" : "#c0b040", "BATERIA");

    ctx.fillStyle = "#dfe6df";
    ctx.font = "16px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "right";
    const totalPages = Level.pages.length;
    const gotPages = Level.pages.filter((p) => p.collected).length;
    const totalGens = Level.generators.length;
    const onGens = Level.generators.filter((g) => g.active).length;
    ctx.fillText(`Notas: ${gotPages}/${totalPages}`, this.W - 20, 32);
    ctx.fillText(`Piedras: ${this.player.rocks}`, this.W - 20, 54);
    ctx.fillText(`Generadores: ${onGens}/${totalGens}`, this.W - 20, 76);
    ctx.fillText(`Linterna: ${this.player.flashlight ? "ON" : "OFF"}`, this.W - 20, 98);
    ctx.textAlign = "left";

    // Nombre de la noche
    ctx.fillStyle = "#8a9a8a";
    ctx.font = "13px 'Trebuchet MS', sans-serif";
    ctx.fillText(`NOCHE ${Level.current + 1}: ${Level.name}`, 20, 92);

    const st = this.threatState();
    if (st === "chase" && this.player.hidden) {
      ctx.fillStyle = "#e0c040";
      ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Conten la respiracion... te esta buscando", this.W / 2, 40);
      ctx.textAlign = "left";
    } else if (st === "chase") {
      ctx.fillStyle = "#ff4040";
      ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("¡TE VIO! ¡CORRE!", this.W / 2, 40);
      ctx.textAlign = "left";
    } else if (st === "suspicious") {
      ctx.fillStyle = "#e0a040";
      ctx.font = "16px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Algo te escuchó...", this.W / 2, 36);
      ctx.textAlign = "left";
    }

    if (this.messageTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(this.W / 2 - 190, this.H - 60, 380, 34);
      ctx.fillStyle = "#eef0ea";
      ctx.font = "16px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.message, this.W / 2, this.H - 38);
      ctx.textAlign = "left";
    }

    if (this.player.hidden) {
      ctx.fillStyle = "rgba(120,220,150,0.9)";
      ctx.font = "14px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ESCONDIDO", this.player.cx - this.camX, this.player.y - 10);
      ctx.textAlign = "left";
    }
  }

  _bar(ctx, x, y, w, h, pct, color, label) {
    pct = Math.max(0, Math.min(1, pct));
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = "#555";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#cfd6cf";
    ctx.font = "10px 'Trebuchet MS', sans-serif";
    ctx.fillText(label, x + 2, y + h - 3);
  }
}
