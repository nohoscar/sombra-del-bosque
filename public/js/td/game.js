// Motor cenital completo: 5 noches, múltiples Esbeltos, ambiente por noche,
// generadores (zonas de luz), estática, pausa y progresión.
class TDGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = canvas.width; this.H = canvas.height;
    this.player = new TDPlayer();
    this.slenders = [];
    this.night = 0;
    this.static = 0; this.corruption = 0;
    this.camX = 0; this.camY = 0;
    this.state = "menu";        // menu | playing | note | nightcomplete | gameover | win
    this.paused = false;
    this.message = ""; this.msgTimer = 0;
    this._lastFoot = 0;
    this.genCharges = 2;
    this.ambient = { tint: "rgba(40,60,90,0.05)", dark: 0.6 };
    this.callbacks = {};
    this.lightCanvas = document.createElement("canvas");
    this.lightCanvas.width = this.W; this.lightCanvas.height = this.H;
    this.lightCtx = this.lightCanvas.getContext("2d");
  }

  on(e, fn) { this.callbacks[e] = fn; }
  _emit(e, d) { if (this.callbacks[e]) this.callbacks[e](d); }

  beginNight(i) {
    TDLevel.load(i);
    this.night = i;
    this.player.reset();
    const def = TDLevel.def || {};
    if (def.startBattery != null) this.player.battery = def.startBattery;
    this.slenders = TDLevel.slenderConfigs.map((c) => new TDSlender(c));
    this.dormant = !!def.dormant;          // el Esbelto aun no despierta (guion)
    this.static = 0; this.corruption = 0; this._lastFoot = 0; this.paused = false;
    this.channelGen = null; this.channelT = 0; this.channelPoint = null; this.channelBlocked = false;
    this.genCharges = (typeof Difficulty !== "undefined") ? Difficulty.get().genCharges : 2;
    this.ambient = TDLevel.ambient;
    this.subtitle = null; this.hintMsg = null; this.apparitions = [];
    this.lightFlicker = 0; this.proximity = 0;
    this.camX = Math.max(0, this.player.x - this.W / 2); this.camY = Math.max(0, this.player.y - this.H / 2);
    Sound.startAmbience();
    this.state = "playing";
    Story.start(this, i);
  }
  nextNight() { this.beginNight(this.night + 1); }
  retry() { this.beginNight(this.night); }

  // ---- Herramientas para el guion (story.js) ----
  say(text, secs, voice, pan) {
    let dur = 0;
    if (voice) dur = Sound.playVoice(voice, pan) || 0;
    this.subtitle = { text, t: Math.max(secs || 3, dur + 0.6) };
  }
  hint(text, secs) { this.hintMsg = { text, t: secs || 4 }; }
  appear(x, y, secs) {
    // Figura solo visual (no persigue): se dibuja con el mismo cuerpo del Esbelto
    this.apparitions.push({ x, y, t: secs, max: secs, state: "patrol", flicker: 0 });
  }
  flickerLight(secs) { this.lightFlicker = Math.max(this.lightFlicker, secs); }
  wake() { this.dormant = false; }

  setPaused(p) {
    if (this.state !== "playing" && !p) { this.paused = false; return; }
    this.paused = p;
  }
  togglePause() { if (this.state === "playing") this.setPaused(!this.paused); }

  threatState() {
    if (this.slenders.some((s) => s.state === "chase")) return "chase";
    if (this.slenders.some((s) => s.state === "suspicious")) return "suspicious";
    return "patrol";
  }

  update(dt) {
    if (this.state !== "playing" || this.paused) return;
    const p = this.player;
    p.corruption = this.corruption;
    p.update(dt);
    Story.update(this, dt);
    if (this.state !== "playing") return;
    if (this.subtitle && (this.subtitle.t -= dt) <= 0) this.subtitle = null;
    if (this.hintMsg && (this.hintMsg.t -= dt) <= 0) this.hintMsg = null;
    for (const a of this.apparitions) { a.t -= dt; a.flicker += dt; }
    this.apparitions = this.apparitions.filter((a) => a.t > 0);
    if (this.lightFlicker > 0) this.lightFlicker -= dt;

    let rise = 0, anyChase = false, nearest = Infinity;
    for (const s of (this.dormant ? [] : this.slenders)) {
      s.update(dt, p);
      if (s.state === "chase") anyChase = true;
      nearest = Math.min(nearest, Math.hypot(s.x - p.x, s.y - p.y));
      if (!p.hidden && TDLevel.lineOfSight(p.x, p.y, s.x, s.y)) {
        const dx = s.x - p.x, dy = s.y - p.y, dist = Math.hypot(dx, dy) || 1;
        const ang = Math.acos(Math.max(-1, Math.min(1, (p.fx * dx + p.fy * dy) / dist)));
        if (ang < 0.9 && dist < 440) rise = Math.max(rise, (1 - dist / 440) * 28);
        if (dist < 170) rise = Math.max(rise, 9);
        // Si la linterna lo alcanza, se enfurece y carga hacia ti
        if (p.flashlight && dist < 340 && ang < 0.55) s.onLit();
      }
    }

    // Los aparatos fallan cuando esta cerca: la linterna parpadea (por tiempo, no por cuadro)
    this.proximity = Math.max(0, Math.min(1, 1 - nearest / 340));
    if (p.flashlight && this.proximity > 0.15 && Math.random() < this.proximity * 4 * dt) {
      this.lightFlicker = Math.max(this.lightFlicker, 0.08 + Math.random() * 0.3);
    }

    // Generadores encendidos: cuentan tiempo y ahuyentan a los Esbeltos
    for (const g of TDLevel.generators) {
      if (!g.active) continue;
      g.timer -= dt;
      if (g.timer <= 0) { g.active = false; g.timer = 0; continue; }
      for (const s of this.slenders) if (Math.hypot(s.x - g.x, s.y - g.y) < g.radius) s.fleeFrom(g.x, g.y, dt);
    }

    if (anyChase) rise += 30;
    const fm = (typeof Difficulty !== "undefined") ? Difficulty.get().fearMul : 1;
    rise *= fm;
    if (p.hidden) this.static -= 30 * dt;
    else if (rise > 0.5) this.static += rise * dt;
    else this.static -= 16 * dt;
    this.static = Math.max(0, Math.min(100, this.static));
    this.corruption = Math.max(0, Math.min(1, (this.static - 55) / 45));

    this._camera();
    this._interactions(dt);
    // El ruido de encender un foco atrae a los Esbeltos hacia ese punto
    if (this.channelPoint) for (const s of this.slenders) s.lureTo(this.channelPoint.x, this.channelPoint.y, dt);
    if (this.msgTimer > 0) this.msgTimer -= dt;

    Sound.update(dt);
    Sound.setStatic(this.static / 100);
    Sound.setTension(Math.min(1, this.static / 100 + (anyChase ? 0.35 : 0)));
    Sound.setProximity(this.proximity);
    if (!this.dormant && this.slenders.length) {
      const st = this.threatState();
      Sound.setMusic(st === "chase" ? "chase" : st === "suspicious" ? "tension" : "calm");
    }
    if (p.moving) {
      const foot = Math.floor(p.walkPhase / Math.PI);
      if (foot !== this._lastFoot) { Sound.footstep(p.running); this._lastFoot = foot; }
    }

    if (this.slenders.some((s) => s.caught) || this.static >= 100) this._lose();
  }

  _camera() {
    const tx = this.player.x - this.W / 2, ty = this.player.y - this.H / 2;
    this.camX += (tx - this.camX) * 0.12;
    this.camY += (ty - this.camY) * 0.12;
    this.camX = Math.max(0, Math.min(TDLevel.worldW - this.W, this.camX));
    this.camY = Math.max(0, Math.min(TDLevel.worldH - this.H, this.camY));
  }

  _notify(m) { this.message = m; this.msgTimer = 0.5; }

  _interactions(dt) {
    const p = this.player;
    for (const b of TDLevel.batteries) {
      if (!b.taken && Math.hypot(p.x - b.x, p.y - b.y) < 30) {
        b.taken = true; p.addBattery(b.amount ?? 45);
        if (b.label) this.hint(b.label, 2.5); else this._notify("+ Bateria");
        Story.onItem(this, b);
      }
    }
    let nearNote = null;
    for (const n of TDLevel.notes) if (!n.collected && Math.hypot(p.x - n.x, p.y - n.y) < 40) nearNote = n;
    if (nearNote) {
      this._notify("E: examinar");
      if (Input.wasPressed("interact")) {
        nearNote.collected = true; this.state = "note";
        this._emit("note", { kind: nearNote.kind, title: nearNote.title, text: nearNote.text, voice: nearNote.voice });
        Story.onNote(this, nearNote);
      }
    }

    // Focos: mantener E para encender (canalización). El ruido atrae al Esbelto,
    // y si se acerca demasiado, lo impide con un chispazo.
    let cg = null;
    for (const g of TDLevel.generators) {
      if (g.active && Math.hypot(p.x - g.x, p.y - g.y) < 44) this._notify(`Foco activo (${Math.ceil(g.timer)}s)`);
      if (!g.active && Math.hypot(p.x - g.x, p.y - g.y) < 44) cg = g;
    }
    this.channelPoint = null;
    if (cg && this.genCharges > 0 && Input.isDown("interact") && !this.channelBlocked) {
      if (this.channelGen !== cg) { this.channelGen = cg; this.channelT = 0; }
      this.channelT += dt;
      this.channelPoint = { x: cg.x, y: cg.y };
      const intruder = this.slenders.find((s) => Math.hypot(s.x - cg.x, s.y - cg.y) < 140);
      if (intruder) {
        this.channelGen = null; this.channelT = 0; this.channelPoint = null; this.channelBlocked = true;
        this.static = Math.min(100, this.static + 22);
        intruder.onLit();
        Sound.stinger();
        this._notify("¡El Esbelto lo impide!");
      } else {
        const need = 1.2;
        if (this.channelT >= need) {
          cg.active = true;
          cg.timer = (typeof Difficulty !== "undefined") ? Difficulty.get().litDuration : 9;
          this.genCharges--;
          this.channelGen = null; this.channelT = 0;
          this._notify("Foco encendido: zona segura");
        } else {
          this._notify(`Encendiendo foco... ${Math.round(this.channelT / need * 100)}%`);
        }
      }
    } else {
      this.channelGen = null; this.channelT = 0;
      if (!Input.isDown("interact")) this.channelBlocked = false;
      if (cg && this.channelBlocked) this._notify("El Esbelto vigila el foco...");
      else if (cg && this.genCharges <= 0) this._notify("Sin cargas de generador");
      else if (cg) this._notify("Manten E para encender el foco");
    }

    const e = TDLevel.exit;
    if (Math.hypot(p.x - e.x, p.y - e.y) < 44) {
      const block = Story.exitBlock(this);
      if (block) this._notify(block);
      else { this._notify(Story.exitPrompt()); if (Input.wasPressed("interact")) this._winNight(); }
    }
  }

  resumeFromNote() { if (this.state === "note") this.state = "playing"; }

  _lose() {
    this.state = "gameover"; Sound.stinger(); Sound.stopReading(); Sound.stopAmbience();
    this._emit("gameover", { night: this.night + 1 });
  }
  _winNight() {
    Sound.stopAmbience();
    if (this.night + 1 < TDLevel.totalNights) { this.state = "nightcomplete"; this._emit("nightcomplete", { completed: this.night + 1 }); }
    else { this.state = "win"; this._emit("win"); }
  }

  // ---------- RENDER ----------
  draw() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    if (this.state === "menu") return;
    ctx.save();
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));
    this._drawGround(ctx);
    if (!this.dormant) this.slenders.forEach((s) => s.drawCone(ctx));
    this._drawSprites(ctx);
    ctx.restore();
    // Tinte de ambiente de la noche
    if (this.ambient) { ctx.fillStyle = this.ambient.tint; ctx.fillRect(0, 0, W, H); }
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

  _drawGround(ctx) {
    const T = TDLevel.TILE, v = this._visibleTiles(), map = TDLevel.tileMap;
    for (let r = v.r0; r <= v.r1; r++) {
      for (let c = v.c0; c <= v.c1; c++) {
        const x = c * T, y = r * T;
        if (map) {
          const ch = map[r][c];
          if (ch === "," || ch === "T") {
            ctx.fillStyle = (r + c) % 2 ? "#16200f" : "#192412";
            ctx.fillRect(x, y, T, T);
          } else {
            // Piso de madera (tablas)
            ctx.fillStyle = (r % 2) ? "#3a2a1e" : "#36271c";
            ctx.fillRect(x, y, T, T);
            ctx.fillStyle = "rgba(0,0,0,0.22)";
            ctx.fillRect(x, y + T - 2, T, 2);
            ctx.fillRect(x + ((r * 23) % T), y, 2, T);
          }
          continue;
        }
        if (TDLevel.grid[r][c] === 1) continue;
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

  _drawFogata(ctx, pr) {
    const x = pr.x, y = pr.y, t = Date.now() / 1000;
    // Piedras alrededor y troncos
    ctx.fillStyle = "#3a3540";
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 26, y + Math.sin(a) * 12, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#3b2618"; ctx.fillRect(x - 16, y - 3, 32, 6);
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.6); ctx.fillRect(-15, -3, 30, 6); ctx.restore();
    if (!pr.lit) {
      ctx.fillStyle = "rgba(160,160,170,0.25)";
      ctx.beginPath(); ctx.ellipse(x + Math.sin(t) * 4, y - 22 - (t * 10 % 20), 7, 10, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    // Llamas que bailan
    for (let k = 0; k < 3; k++) {
      const h = 22 + Math.sin(t * 9 + k * 2) * 6 - k * 4, w = 9 - k * 2;
      ctx.fillStyle = ["#d4521c", "#f0912c", "#ffd36a"][k];
      ctx.beginPath();
      ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.6 + Math.sin(t * 7 + k) * 3, y - h * 0.6, x, y - h);
      ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.5, x + w, y); ctx.closePath(); ctx.fill();
    }
  }

  _drawSprites(ctx) {
    const T = TDLevel.TILE, v = this._visibleTiles(), items = [], map = TDLevel.tileMap;
    for (let r = v.r0; r <= v.r1; r++)
      for (let c = v.c0; c <= v.c1; c++)
        if (TDLevel.grid[r][c] === 1) {
          if (map) {
            const ch = map[r][c];
            if (ch === ",") continue;
            if (ch === "T") { items.push({ y: r * T + T, fn: () => this._drawTree(ctx, c, r) }); continue; }
            items.push({ y: r * T + T, fn: () => this._drawHouseTile(ctx, ch, c, r) });
            continue;
          }
          const rock = (r * 7 + c * 3) % 5 === 0;
          items.push({ y: r * T + T, fn: () => (rock ? this._drawRock(ctx, c, r) : this._drawTree(ctx, c, r)) });
        }
    for (const b of TDLevel.batteries) if (!b.taken) items.push({ y: b.y + 10, fn: () => (b.id === "linterna" ? this._drawFlashlightItem(ctx, b) : this._drawBattery(ctx, b)) });
    for (const n of TDLevel.notes) if (!n.collected) items.push({ y: n.y + 12, fn: () => this._drawNote(ctx, n) });
    for (const g of TDLevel.generators) items.push({ y: g.y + 18, fn: () => this._drawGenerator(ctx, g) });
    for (const pr of TDLevel.props) if (pr.kind === "fogata") items.push({ y: pr.y + 14, fn: () => this._drawFogata(ctx, pr) });
    if (!map) items.push({ y: TDLevel.exit.y + 22, fn: () => this._drawExit(ctx) });
    items.push({ y: this.player.y + 15, fn: () => this.player.draw(ctx) });
    if (!this.dormant) for (const s of this.slenders) items.push({ y: s.y + 16, fn: () => s.draw(ctx) });
    for (const a of this.apparitions) items.push({ y: a.y + 16, fn: () => {
      // Aparece y se desvanece, con saltos de imagen
      const k = a.t / a.max, alpha = Math.min(1, (1 - k) * 5, k * 3);
      if (Math.random() < 0.12) return;
      ctx.save(); ctx.globalAlpha = Math.max(0, alpha);
      TDSlender.prototype.draw.call(a, ctx);
      ctx.restore();
    } });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.fn();
  }

  // Paredes, ventanas, puerta y muebles de la casa (vista 3/4)
  _drawHouseTile(ctx, ch, c, r) {
    const T = TDLevel.TILE, x = c * T, y = r * T, lift = T * 0.45;
    if (ch === "#" || ch === "W" || ch === "D") {
      ctx.fillStyle = "#211c26"; ctx.fillRect(x, y - lift, T, T + lift);
      ctx.fillStyle = "#3a3344"; ctx.fillRect(x, y - lift, T, lift * 0.55);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, y + T - 6, T, 6);
      if (ch === "W") {
        ctx.fillStyle = "#1b2b4a"; ctx.fillRect(x + 6, y - lift + 12, T - 12, T - 6);
        ctx.fillStyle = "rgba(150,180,235,0.18)"; ctx.fillRect(x + 6, y - lift + 12, T - 12, (T - 6) / 2);
        ctx.fillStyle = "#211c26"; ctx.fillRect(x + T / 2 - 2, y - lift + 12, 4, T - 6);
      }
      if (ch === "D") {
        const ready = TDLevel.notes.every((n) => n.collected);
        ctx.fillStyle = ready ? "#6a4527" : "#4a3220"; ctx.fillRect(x + 8, y - lift + 6, T - 16, T + lift - 10);
        ctx.fillStyle = "#d8c060"; ctx.beginPath(); ctx.arc(x + T - 16, y + T / 2 - 4, 3, 0, Math.PI * 2); ctx.fill();
        if (ready) { ctx.fillStyle = "rgba(255,230,150,0.12)"; ctx.beginPath(); ctx.arc(x + T / 2, y, 46, 0, Math.PI * 2); ctx.fill(); }
      }
      return;
    }
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x + 3, y + T - 8, T - 6, 8);
    if (ch === "B") {        // cama
      ctx.fillStyle = "#2c3a5a"; ctx.fillRect(x + 2, y + 2, T - 4, T - 6);
      ctx.fillStyle = "#3a4c72"; ctx.fillRect(x + 4, y + 8, T - 8, T - 16);
      if (TDLevel.tileMap[r - 1] && TDLevel.tileMap[r - 1][c] !== "B") { ctx.fillStyle = "#cfcfd8"; ctx.fillRect(x + 8, y + 4, T - 16, 12); }
    } else if (ch === "K") { // barra de cocina
      ctx.fillStyle = "#4a4650"; ctx.fillRect(x, y - 10, T, T + 4);
      ctx.fillStyle = "#6a6672"; ctx.fillRect(x, y - 10, T, 12);
    } else if (ch === "O") { // sillon
      ctx.fillStyle = "#4a2226"; ctx.fillRect(x + 1, y + 6, T - 2, T - 10);
      ctx.fillStyle = "#5e2c31"; ctx.fillRect(x + 1, y - 4, T - 2, 14);
    } else if (ch === "M") { // mesa
      ctx.fillStyle = "#5a3e26"; ctx.fillRect(x + 4, y + 4, T - 8, T - 14);
      ctx.fillStyle = "#6c4b2e"; ctx.fillRect(x + 4, y + 4, T - 8, 6);
    } else if (ch === "F") { // refri
      ctx.fillStyle = "#b8bcc4"; ctx.fillRect(x + 6, y - lift, T - 12, T + lift - 4);
      ctx.fillStyle = "#8a8e96"; ctx.fillRect(x + 6, y - lift + 22, T - 12, 3);
    }
  }

  _drawFlashlightItem(ctx, b) {
    const bob = Math.sin(Date.now() / 280) * 2, y = b.y + bob;
    ctx.fillStyle = "rgba(255,240,180,0.16)"; ctx.beginPath(); ctx.arc(b.x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a2a30"; ctx.fillRect(b.x - 12, y - 4, 18, 8);
    ctx.fillStyle = "#c8a040"; ctx.fillRect(b.x + 6, y - 6, 6, 12);
  }

  _drawTree(ctx, c, r) {
    const T = TDLevel.TILE, x = c * T + T / 2, base = r * T + T * 0.95;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, base, T * 0.42, T * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3b2f28"; ctx.fillRect(x - 5, base - T * 0.55, 10, T * 0.55);
    ctx.fillStyle = "#2c231d"; ctx.fillRect(x - 1, base - T * 0.5, 3, T * 0.5);
    ctx.fillStyle = "#14220e"; ctx.beginPath(); ctx.ellipse(x, base - T * 0.75, T * 0.55, T * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1d3016"; ctx.beginPath(); ctx.ellipse(x - T * 0.12, base - T * 0.9, T * 0.4, T * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#26401f"; ctx.beginPath(); ctx.ellipse(x - T * 0.2, base - T * 1.0, T * 0.2, T * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawRock(ctx, c, r) {
    const T = TDLevel.TILE, x = c * T + T / 2, base = r * T + T * 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, base, T * 0.4, T * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a3540"; ctx.beginPath(); ctx.ellipse(x, base - T * 0.22, T * 0.4, T * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a4550"; ctx.beginPath(); ctx.ellipse(x - T * 0.1, base - T * 0.3, T * 0.22, T * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawBattery(ctx, b) {
    const bob = Math.sin(Date.now() / 280 + b.x) * 2, y = b.y + bob;
    ctx.fillStyle = "rgba(120,220,255,0.16)"; ctx.beginPath(); ctx.arc(b.x, y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f6f8a"; ctx.fillRect(b.x - 5, y - 12, 10, 18);
    ctx.fillStyle = "#48a0c0"; ctx.fillRect(b.x - 4, y - 11, 8, 7);
    ctx.fillStyle = "#d8d8d8"; ctx.fillRect(b.x - 2, y - 15, 4, 3);
  }

  _drawNote(ctx, n) {
    const bob = Math.sin(Date.now() / 300 + n.x) * 2, y = n.y + bob;
    ctx.fillStyle = "rgba(255,240,180,0.18)"; ctx.beginPath(); ctx.arc(n.x, y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8e0c8"; ctx.fillRect(n.x - 9, y - 16, 18, 22);
    ctx.fillStyle = "#8a8168"; for (let i = -11; i < 4; i += 4) ctx.fillRect(n.x - 6, y + i, 12, 1);
  }

  _drawGenerator(ctx, g) {
    const y = g.y - 6;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(g.x, g.y + 20, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.active ? "#3a5a3a" : "#4a4a4a"; ctx.fillRect(g.x - 18, y - 20, 36, 40);
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(g.x - 12, y - 14, 24, 22);
    ctx.fillStyle = g.active ? "#6cff6c" : "#802020"; ctx.beginPath(); ctx.arc(g.x, y + 14, 4, 0, Math.PI * 2); ctx.fill();
  }

  _drawExit(ctx) {
    const e = TDLevel.exit, powered = TDLevel.canExit().pagesLeft === 0, y = e.y - 8;
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(e.x, e.y + 24, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1a22"; ctx.fillRect(e.x - 24, y - 30, 48, 62);
    ctx.fillStyle = powered ? "#5a3a22" : "#2a2018"; ctx.fillRect(e.x - 17, y - 24, 34, 56);
    ctx.fillStyle = powered ? "#6a4527" : "#33261a"; ctx.fillRect(e.x - 12, y - 20, 24, 52);
    ctx.fillStyle = powered ? "#d8c060" : "#5a5040"; ctx.beginPath(); ctx.arc(e.x + 9, y + 6, 3, 0, Math.PI * 2); ctx.fill();
    if (powered) { ctx.fillStyle = "rgba(255,230,150,0.14)"; ctx.beginPath(); ctx.arc(e.x, y, 44, 0, Math.PI * 2); ctx.fill(); }
  }

  _drawLighting(ctx) {
    const lx = this.lightCtx, W = this.W, H = this.H, p = this.player;
    const px = p.x - this.camX, py = p.y - this.camY;
    const fear = this.static / 100;
    const base = (this.ambient && this.ambient.dark) ? this.ambient.dark : 0.62;
    // Parpadeo: la linterna y la luz cercana fallan cuando el esta cerca (o por guion)
    const flick = this.lightFlicker > 0 && Math.random() < 0.65;
    const lightOn = p.flashlight && !flick;

    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, W, H);
    lx.fillStyle = `rgba(4,5,10,${base + fear * 0.14})`;
    lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = "destination-out";

    const ambR = flick ? 110 : 210;
    const amb = lx.createRadialGradient(px, py, 40, px, py, ambR);
    amb.addColorStop(0, "rgba(0,0,0,1)"); amb.addColorStop(0.55, "rgba(0,0,0,0.85)"); amb.addColorStop(1, "rgba(0,0,0,0)");
    lx.fillStyle = amb; lx.beginPath(); lx.arc(px, py, ambR, 0, Math.PI * 2); lx.fill();

    if (lightOn) {
      const ang = Math.atan2(p.fy, p.fx), spread = 0.5, len = 330;
      lx.save();
      lx.beginPath(); lx.moveTo(px, py); lx.arc(px, py, len, ang - spread, ang + spread); lx.closePath(); lx.clip();
      const cone = lx.createRadialGradient(px, py, 10, px, py, len);
      cone.addColorStop(0, "rgba(0,0,0,1)"); cone.addColorStop(0.7, "rgba(0,0,0,0.6)"); cone.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = cone; lx.fillRect(0, 0, W, H);
      lx.restore();
    }

    for (const g of TDLevel.generators) {
      if (!g.active) continue;
      const gx = g.x - this.camX, gy = g.y - this.camY;
      const gg = lx.createRadialGradient(gx, gy, 12, gx, gy, g.radius);
      gg.addColorStop(0, "rgba(0,0,0,1)"); gg.addColorStop(0.75, "rgba(0,0,0,0.7)"); gg.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = gg; lx.beginPath(); lx.arc(gx, gy, g.radius, 0, Math.PI * 2); lx.fill();
    }

    // Luz de la fogata (tiembla como fuego de verdad)
    for (const pr of TDLevel.props) {
      if (!pr.lit) continue;
      const fx = pr.x - this.camX, fy = pr.y - this.camY;
      const fr = 175 + Math.sin(Date.now() / 90) * 8 + Math.random() * 6;
      const fg = lx.createRadialGradient(fx, fy, 10, fx, fy, fr);
      fg.addColorStop(0, "rgba(0,0,0,1)"); fg.addColorStop(0.6, "rgba(0,0,0,0.75)"); fg.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = fg; lx.beginPath(); lx.arc(fx, fy, fr, 0, Math.PI * 2); lx.fill();
    }

    lx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.lightCanvas, 0, 0);

    for (const pr of TDLevel.props) {
      if (!pr.lit) continue;
      const fx = pr.x - this.camX, fy = pr.y - this.camY;
      const warm = ctx.createRadialGradient(fx, fy, 6, fx, fy, 170);
      warm.addColorStop(0, "rgba(255,150,60,0.22)"); warm.addColorStop(1, "rgba(255,150,60,0)");
      ctx.fillStyle = warm; ctx.beginPath(); ctx.arc(fx, fy, 170, 0, Math.PI * 2); ctx.fill();
    }

    if (lightOn) {
      const ang = Math.atan2(p.fy, p.fx), spread = 0.5, len = 330;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, len, ang - spread, ang + spread); ctx.closePath(); ctx.clip();
      const warm = ctx.createRadialGradient(px, py, 10, px, py, len);
      warm.addColorStop(0, "rgba(255,240,190,0.10)"); warm.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = warm; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (fear > 0.4) { ctx.fillStyle = `rgba(120,0,0,${(fear - 0.4) * 0.3})`; ctx.fillRect(0, 0, W, H); }

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
    const story = !!(TDLevel.def && TDLevel.def.hud && TDLevel.def.hud.story);
    if (!story || this.player.battery > 0) {
      // Cerca de el, la etiqueta de la bateria se corrompe
      const lbl = this.proximity > 0.5 && Math.random() < this.proximity * 0.6 ? "B#T3R!A" : "BATERIA";
      bar(20, 62, 200, 11, this.player.battery / 100, this.player.battery < 25 ? "#c08020" : "#c0b040", lbl);
    }

    ctx.fillStyle = "#8a9a8a"; ctx.font = "13px 'Trebuchet MS', sans-serif";
    ctx.fillText(`${TDLevel.label || "NOCHE " + this.night}: ${TDLevel.name}`, 20, 90);

    ctx.fillStyle = "#dfe6df"; ctx.font = "16px 'Trebuchet MS', sans-serif"; ctx.textAlign = "right";
    const got = TDLevel.notes.filter((n) => n.collected).length;
    ctx.fillText(`${story ? "Pistas" : "Notas"}: ${got}/${TDLevel.notes.length}`, this.W - 20, 32);
    if (TDLevel.generators.length) ctx.fillText(`Focos: ${this.genCharges}`, this.W - 20, 54);
    if (!story || this.player.battery > 0) ctx.fillText(`Linterna: ${this.player.flashlight ? "ON" : "OFF"}`, this.W - 20, TDLevel.generators.length ? 76 : 54);
    ctx.textAlign = "left";

    // Pista de controles / objetivo (arriba, discreta)
    if (this.hintMsg) {
      const a = Math.min(1, this.hintMsg.t);
      ctx.save(); ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = "#b9c4b9"; ctx.font = "14px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(this.hintMsg.text, this.W / 2, 72);
      ctx.restore();
    }
    // Subtitulo de lo que dice Alex (abajo, estilo cine)
    if (this.subtitle) {
      const a = Math.min(1, this.subtitle.t * 2);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = "italic 19px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center";
      const w = ctx.measureText(this.subtitle.text).width + 40;
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(this.W / 2 - w / 2, this.H - 112, w, 34);
      ctx.fillStyle = "#efe9da"; ctx.fillText(this.subtitle.text, this.W / 2, this.H - 89);
      ctx.restore();
    }

    const st = this.threatState();
    if (st === "chase" && !this.player.hidden) {
      ctx.fillStyle = "#ff4040"; ctx.font = "bold 22px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("¡TE VIO! ¡CORRE!", this.W / 2, 40); ctx.textAlign = "left";
    } else if (st === "chase" && this.player.hidden) {
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
