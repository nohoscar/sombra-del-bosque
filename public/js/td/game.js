// Motor del prototipo cenital: cámara 2D, iluminación con cono, estática, render.
class TDGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = canvas.width; this.H = canvas.height;
    this.player = new TDPlayer();
    this.slender = null;
    this.static = 0;
    this.corruption = 0;
    this.camX = 0; this.camY = 0;
    this.state = "menu";
    this.message = ""; this.msgTimer = 0;
    this._lastFoot = 0;
    this.callbacks = {};
    this.lightCanvas = document.createElement("canvas");
    this.lightCanvas.width = this.W; this.lightCanvas.height = this.H;
    this.lightCtx = this.lightCanvas.getContext("2d");
  }

  on(e, fn) { this.callbacks[e] = fn; }
  _emit(e, d) { if (this.callbacks[e]) this.callbacks[e](d); }

  start() {
    TDLevel.generate(0);
    this.player.reset();
    this.slender = new TDSlender({});
    this.static = 0; this.corruption = 0;
    this._lastFoot = 0;
    this.genCharges = (typeof Difficulty !== "undefined") ? Difficulty.get().genCharges : 2;
    Sound.startAmbience();
    this.state = "playing";
  }

  update(dt) {
    if (this.state !== "playing") return;
    const p = this.player, s = this.slender;
    p.corruption = this.corruption;
    p.update(dt);
    s.update(dt, p);

    // Generadores encendidos: cuentan su tiempo y ahuyentan al Esbelto
    for (const g of TDLevel.generators) {
      if (g.active) {
        g.timer -= dt;
        if (g.timer <= 0) { g.active = false; g.timer = 0; }
        else if (Math.hypot(s.x - g.x, s.y - g.y) < g.radius) s.fleeFrom(g.x, g.y, dt);
      }
    }

    // --- Estática (mirar al Esbelto) ---
    let rise = 0;
    const dx = s.x - p.x, dy = s.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (!p.hidden && TDLevel.lineOfSight(p.x, p.y, s.x, s.y)) {
      const ang = Math.acos(Math.max(-1, Math.min(1, (p.fx * dx + p.fy * dy) / (dist || 1))));
      if (ang < 0.9 && dist < 440) rise = (1 - dist / 440) * 28; // mirándolo
      if (dist < 170) rise = Math.max(rise, 9);
    }
    if (s.state === "chase") rise += 45;
    const fm = (typeof Difficulty !== "undefined") ? Difficulty.get().fearMul : 1;
    rise *= fm;
    if (p.hidden) this.static -= 30 * dt;
    else if (rise > 0.5) this.static += rise * dt;
    else this.static -= 16 * dt;
    this.static = Math.max(0, Math.min(100, this.static));
    this.corruption = Math.max(0, Math.min(1, (this.static - 55) / 45));

    this._camera();
    this._interactions();
    if (this.msgTimer > 0) this.msgTimer -= dt;

    // Audio
    Sound.update(dt);
    Sound.setStatic(this.static / 100);
    Sound.setTension(Math.min(1, this.static / 100 + (s.state === "chase" ? 0.35 : 0)));
    if (p.moving) {
      const foot = Math.floor(p.walkPhase / Math.PI);
      if (foot !== this._lastFoot) { Sound.footstep(p.running); this._lastFoot = foot; }
    }

    if (s.caught || this.static >= 100) this._lose();
  }

  _camera() {
    const tx = this.player.x - this.W / 2, ty = this.player.y - this.H / 2;
    this.camX += (tx - this.camX) * 0.12;
    this.camY += (ty - this.camY) * 0.12;
    this.camX = Math.max(0, Math.min(TDLevel.worldW - this.W, this.camX));
    this.camY = Math.max(0, Math.min(TDLevel.worldH - this.H, this.camY));
  }

  _notify(m) { this.message = m; this.msgTimer = 0.5; }

  _interactions() {
    const p = this.player;
    // Baterías
    for (const b of TDLevel.batteries) {
      if (!b.taken && Math.hypot(p.x - b.x, p.y - b.y) < 26) { b.taken = true; p.addBattery(45); this._notify("+ Bateria"); }
    }
    // Notas
    let nearNote = null;
    for (const n of TDLevel.notes) if (!n.collected && Math.hypot(p.x - n.x, p.y - n.y) < 34) nearNote = n;
    if (nearNote) {
      this._notify("E: examinar");
      if (Input.wasPressed("interact")) {
        nearNote.collected = true; this.state = "note";
        this._emit("note", { kind: nearNote.kind, title: nearNote.title, text: nearNote.text });
      }
    }
    // Generadores: zona de luz temporal que ahuyenta al Esbelto (usos limitados)
    for (const g of TDLevel.generators) {
      if (Math.hypot(p.x - g.x, p.y - g.y) >= 40) continue;
      if (g.active) { this._notify(`Foco activo (${Math.ceil(g.timer)}s)`); continue; }
      if (this.genCharges > 0) {
        this._notify(`E: encender foco  (${this.genCharges} usos)`);
        if (Input.wasPressed("interact")) {
          g.active = true;
          g.timer = (typeof Difficulty !== "undefined") ? Difficulty.get().litDuration : 9;
          this.genCharges--;
          this._notify("Foco encendido: zona segura");
        }
      } else {
        this._notify("Sin cargas de generador");
      }
    }
    // Salida (solo requiere las notas)
    const e = TDLevel.exit;
    if (Math.hypot(p.x - e.x, p.y - e.y) < 40) {
      const st = TDLevel.canExit();
      if (st.pagesLeft > 0) this._notify(`Faltan ${st.pagesLeft} nota(s)`);
      else { this._notify("E: escapar"); if (Input.wasPressed("interact")) this._win(); }
    }
  }

  resumeFromNote() { if (this.state === "note") this.state = "playing"; }

  _lose() { this.state = "gameover"; Sound.stinger(); Sound.stopReading(); Sound.stopAmbience(); this._emit("gameover"); }
  _win() { Sound.stopAmbience(); this.state = "win"; this._emit("win"); }

  // ---------- RENDER ----------
  draw() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    if (this.state === "menu") return;
    ctx.save();
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));
    this._drawGround(ctx);                 // piso + arbustos (planos)
    if (this.slender) this.slender.drawCone(ctx);
    this._drawSprites(ctx);                // árboles, objetos y personajes de pie, ordenados
    ctx.restore();
    this._drawLighting(ctx);
    this._drawHUD(ctx);
  }

  _visibleTiles() {
    const T = TDLevel.TILE;
    return {
      c0: Math.max(0, Math.floor(this.camX / T)),
      r0: Math.max(0, Math.floor(this.camY / T)),
      c1: Math.min(TDLevel.cols - 1, Math.ceil((this.camX + this.W) / T)),
      r1: Math.min(TDLevel.rows - 1, Math.ceil((this.camY + this.H) / T)),
    };
  }

  // Piso + arbustos (planos, en el suelo)
  _drawGround(ctx) {
    const T = TDLevel.TILE;
    const v = this._visibleTiles();
    for (let r = v.r0; r <= v.r1; r++) {
      for (let c = v.c0; c <= v.c1; c++) {
        if (TDLevel.grid[r][c] === 1) continue;
        const x = c * T, y = r * T;
        ctx.fillStyle = (r + c) % 2 ? "#1b2417" : "#1f2a1a";
        ctx.fillRect(x, y, T, T);
        if (TDLevel.bushes.has(r + "," + c)) {
          ctx.fillStyle = "#2f5a30";
          ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, T * 0.5, T * 0.42, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#356436";
          ctx.beginPath(); ctx.ellipse(x + T * 0.38, y + T * 0.42, T * 0.22, T * 0.18, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // Charco de luz cálida de los focos encendidos (en el piso)
    for (const g of TDLevel.generators) {
      if (!g.active) continue;
      const pulse = 0.14 + Math.sin(Date.now() / 200) * 0.03;
      const grad = ctx.createRadialGradient(g.x, g.y, 20, g.x, g.y, g.radius);
      grad.addColorStop(0, `rgba(255,225,150,${pulse + 0.1})`);
      grad.addColorStop(1, "rgba(255,225,150,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Sprites verticales (árboles, objetos y personajes), ordenados por profundidad
  _drawSprites(ctx) {
    const T = TDLevel.TILE;
    const v = this._visibleTiles();
    const items = [];

    for (let r = v.r0; r <= v.r1; r++) {
      for (let c = v.c0; c <= v.c1; c++) {
        if (TDLevel.grid[r][c] === 1) {
          const rock = (r * 7 + c * 3) % 5 === 0;
          items.push({ y: r * T + T, fn: () => (rock ? this._drawRock(ctx, c, r) : this._drawTree(ctx, c, r)) });
        }
      }
    }
    for (const b of TDLevel.batteries) if (!b.taken) items.push({ y: b.y + 10, fn: () => this._drawBattery(ctx, b) });
    for (const n of TDLevel.notes) if (!n.collected) items.push({ y: n.y + 12, fn: () => this._drawNote(ctx, n) });
    for (const g of TDLevel.generators) items.push({ y: g.y + 18, fn: () => this._drawGenerator(ctx, g) });
    items.push({ y: TDLevel.exit.y + 22, fn: () => this._drawExit(ctx) });
    items.push({ y: this.player.y + 15, fn: () => this.player.draw(ctx) });
    if (this.slender) items.push({ y: this.slender.y + 16, fn: () => this.slender.draw(ctx) });

    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.fn();
  }

  _drawTree(ctx, c, r) {
    const T = TDLevel.TILE, x = c * T + T / 2, base = r * T + T * 0.95;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, base, T * 0.42, T * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    // tronco
    ctx.fillStyle = "#3b2f28"; ctx.fillRect(x - 5, base - T * 0.55, 10, T * 0.55);
    ctx.fillStyle = "#2c231d"; ctx.fillRect(x - 1, base - T * 0.5, 3, T * 0.5);
    // copa en capas
    ctx.fillStyle = "#14220e";
    ctx.beginPath(); ctx.ellipse(x, base - T * 0.75, T * 0.55, T * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1d3016";
    ctx.beginPath(); ctx.ellipse(x - T * 0.12, base - T * 0.9, T * 0.4, T * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#26401f";
    ctx.beginPath(); ctx.ellipse(x - T * 0.2, base - T * 1.0, T * 0.2, T * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawRock(ctx, c, r) {
    const T = TDLevel.TILE, x = c * T + T / 2, base = r * T + T * 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, base, T * 0.4, T * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a3540";
    ctx.beginPath(); ctx.ellipse(x, base - T * 0.22, T * 0.4, T * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a4550";
    ctx.beginPath(); ctx.ellipse(x - T * 0.1, base - T * 0.3, T * 0.22, T * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawBattery(ctx, b) {
    const bob = Math.sin(Date.now() / 280 + b.x) * 2, y = b.y + bob;
    ctx.fillStyle = "rgba(120,220,255,0.16)";
    ctx.beginPath(); ctx.arc(b.x, y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f6f8a"; ctx.fillRect(b.x - 5, y - 12, 10, 18);
    ctx.fillStyle = "#48a0c0"; ctx.fillRect(b.x - 4, y - 11, 8, 7);
    ctx.fillStyle = "#d8d8d8"; ctx.fillRect(b.x - 2, y - 15, 4, 3);
  }

  _drawNote(ctx, n) {
    const bob = Math.sin(Date.now() / 300 + n.x) * 2, y = n.y + bob;
    ctx.fillStyle = "rgba(255,240,180,0.18)";
    ctx.beginPath(); ctx.arc(n.x, y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8e0c8"; ctx.fillRect(n.x - 9, y - 16, 18, 22);
    ctx.fillStyle = "#8a8168";
    for (let i = -11; i < 4; i += 4) ctx.fillRect(n.x - 6, y + i, 12, 1);
  }

  _drawGenerator(ctx, g) {
    const y = g.y - 6;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(g.x, g.y + 20, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.active ? "#3a5a3a" : "#4a4a4a"; ctx.fillRect(g.x - 18, y - 20, 36, 40);
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(g.x - 12, y - 14, 24, 22);
    ctx.fillStyle = g.active ? "#6cff6c" : "#802020";
    ctx.beginPath(); ctx.arc(g.x, y + 14, 4, 0, Math.PI * 2); ctx.fill();
    if (g.active) { ctx.fillStyle = "rgba(108,255,108,0.15)"; ctx.beginPath(); ctx.arc(g.x, y, 26, 0, Math.PI * 2); ctx.fill(); }
  }

  _drawExit(ctx) {
    const e = TDLevel.exit, powered = TDLevel.canExit().pagesLeft === 0;
    const y = e.y - 8;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 24, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
    // portal de piedra vertical
    ctx.fillStyle = "#1a1a22"; ctx.fillRect(e.x - 24, y - 30, 48, 62);
    ctx.fillStyle = powered ? "#5a3a22" : "#2a2018"; ctx.fillRect(e.x - 17, y - 24, 34, 56);
    ctx.fillStyle = powered ? "#6a4527" : "#33261a"; ctx.fillRect(e.x - 12, y - 20, 24, 52);
    ctx.fillStyle = powered ? "#d8c060" : "#5a5040";
    ctx.beginPath(); ctx.arc(e.x + 9, y + 6, 3, 0, Math.PI * 2); ctx.fill();
    if (powered) { ctx.fillStyle = "rgba(255,230,150,0.14)"; ctx.beginPath(); ctx.arc(e.x, y, 44, 0, Math.PI * 2); ctx.fill(); }
  }

  _drawLighting(ctx) {
    const lx = this.lightCtx, W = this.W, H = this.H;
    const p = this.player;
    const px = p.x - this.camX, py = p.y - this.camY;
    const fear = this.static / 100;

    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, W, H);
    lx.fillStyle = `rgba(4,5,10,${0.9 + fear * 0.08})`;
    lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = "destination-out";

    // Halo ambiental
    const amb = lx.createRadialGradient(px, py, 8, px, py, 120);
    amb.addColorStop(0, "rgba(0,0,0,0.95)"); amb.addColorStop(1, "rgba(0,0,0,0)");
    lx.fillStyle = amb;
    lx.beginPath(); lx.arc(px, py, 120, 0, Math.PI * 2); lx.fill();

    // Cono de linterna (sector en la dirección de la mirada)
    if (p.flashlight) {
      const ang = Math.atan2(p.fy, p.fx);
      const spread = 0.5, len = 320;
      lx.save();
      lx.beginPath(); lx.moveTo(px, py);
      lx.arc(px, py, len, ang - spread, ang + spread); lx.closePath(); lx.clip();
      const cone = lx.createRadialGradient(px, py, 10, px, py, len);
      cone.addColorStop(0, "rgba(0,0,0,1)"); cone.addColorStop(0.7, "rgba(0,0,0,0.6)"); cone.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = cone; lx.fillRect(0, 0, W, H);
      lx.restore();
    }

    // Focos encendidos: revelan su zona segura
    for (const g of TDLevel.generators) {
      if (!g.active) continue;
      const gx = g.x - this.camX, gy = g.y - this.camY;
      const gg = lx.createRadialGradient(gx, gy, 12, gx, gy, g.radius);
      gg.addColorStop(0, "rgba(0,0,0,1)"); gg.addColorStop(0.75, "rgba(0,0,0,0.7)"); gg.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = gg;
      lx.beginPath(); lx.arc(gx, gy, g.radius, 0, Math.PI * 2); lx.fill();
    }

    lx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.lightCanvas, 0, 0);

    // Tinte cálido de linterna
    if (p.flashlight) {
      const ang = Math.atan2(p.fy, p.fx), spread = 0.5, len = 320;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, len, ang - spread, ang + spread); ctx.closePath(); ctx.clip();
      const warm = ctx.createRadialGradient(px, py, 10, px, py, len);
      warm.addColorStop(0, "rgba(255,240,190,0.10)"); warm.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = warm; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // Tinte de pánico
    if (fear > 0.4) { ctx.fillStyle = `rgba(120,0,0,${(fear - 0.4) * 0.3})`; ctx.fillRect(0, 0, W, H); }

    // Glitch por corrupción
    if (this.corruption > 0.05) {
      const c = this.corruption, cv = this.canvas, bands = Math.floor(2 + c * 8);
      for (let i = 0; i < bands; i++) {
        const y = Math.random() * H, h = 4 + Math.random() * 20, off = (Math.random() - 0.5) * 60 * c;
        ctx.drawImage(cv, 0, y, W, h, off, y, W, h);
      }
    }
  }

  _drawHUD(ctx) {
    const bar = (x, y, w, h, pct, col, label) => {
      pct = Math.max(0, Math.min(1, pct));
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = "#1a1a1a"; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = col; ctx.fillRect(x, y, w * pct, h);
      ctx.fillStyle = "#cfd6cf"; ctx.font = "10px 'Trebuchet MS', sans-serif"; ctx.fillText(label, x + 2, y + h - 3);
    };
    bar(20, 20, 200, 16, this.static / 100, this.static > 70 ? "#c02020" : "#7a7f90", "ESTATICA");
    bar(20, 44, 200, 11, this.player.stamina / 100, "#3a7a9a", "AGUANTE");
    bar(20, 62, 200, 11, this.player.battery / 100, this.player.battery < 25 ? "#c08020" : "#c0b040", "BATERIA");

    ctx.fillStyle = "#dfe6df"; ctx.font = "16px 'Trebuchet MS', sans-serif"; ctx.textAlign = "right";
    const got = TDLevel.notes.filter((n) => n.collected).length;
    ctx.fillText(`Notas: ${got}/${TDLevel.notes.length}`, this.W - 20, 32);
    ctx.fillText(`Focos: ${this.genCharges}`, this.W - 20, 54);
    ctx.fillText(`Linterna: ${this.player.flashlight ? "ON" : "OFF"}`, this.W - 20, 76);
    ctx.textAlign = "left";

    if (this.slender && this.slender.state === "chase" && !this.player.hidden) {
      ctx.fillStyle = "#ff4040"; ctx.font = "bold 22px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("¡TE VIO! ¡CORRE!", this.W / 2, 40); ctx.textAlign = "left";
    } else if (this.slender && this.slender.state === "chase" && this.player.hidden) {
      ctx.fillStyle = "#e0c040"; ctx.font = "18px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Conten la respiracion...", this.W / 2, 40); ctx.textAlign = "left";
    }

    if (this.msgTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(this.W / 2 - 170, this.H - 54, 340, 32);
      ctx.fillStyle = "#eef0ea"; ctx.font = "16px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(this.message, this.W / 2, this.H - 33); ctx.textAlign = "left";
    }
    if (this.player.hidden) {
      ctx.fillStyle = "rgba(120,220,150,0.9)"; ctx.font = "13px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("ESCONDIDO", this.player.x - this.camX, this.player.y - this.camY - 22); ctx.textAlign = "left";
    }
  }
}
