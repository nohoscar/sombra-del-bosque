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
    this.fadeIn = 1.4; this._outside = null; this.faceFlash = 0; this.faceCd = 0;
    this.camX = Math.max(0, this.player.x - this.W / 2); this.camY = Math.max(0, this.player.y - this.H / 2);
    Sound.startAmbience();
    Sound.setScene(def.scene || (TDLevel.tileMap ? "casa" : "bosque"));
    this.state = "playing";
    Story.start(this, i);
    this._cpKey = null;
    this._applyCheckpoint(i);
  }
  nextNight() { this.beginNight(this.night + 1); }
  retry() { this.beginNight(this.night); }

  // ---- Punto de guardado a medio capitulo ----
  _saveCheckpoint() {
    if (TDLevel.room || this.state !== "playing") return;
    const cp = {
      night: this.night,
      notes: TDLevel.notes.map((n) => !!n.collected),
      props: TDLevel.props.map((q) => ({ checked: !!q.checked, lit: !!q.lit })),
      items: TDLevel.batteries.map((b) => !!b.taken),
      flags: Story.flags,
    };
    const key = JSON.stringify(cp);
    if (key === this._cpKey) return;
    this._cpKey = key;
    cp.battery = Math.round(this.player.battery);
    this.checkpoint = cp;
    try { localStorage.setItem("sombra_checkpoint", JSON.stringify(cp)); } catch (e) {}
  }

  _applyCheckpoint(i) {
    let cp = this.checkpoint;
    if (!cp) { try { cp = JSON.parse(localStorage.getItem("sombra_checkpoint")); } catch (e) {} }
    if (!cp || cp.night !== i) return false;
    const any = cp.notes.some(Boolean) || cp.props.some((q) => q.checked || (q.lit && TDLevel.props.length)) || (cp.items || []).some(Boolean);
    if (!any) return false;
    cp.notes.forEach((c, k) => { if (TDLevel.notes[k]) TDLevel.notes[k].collected = c; });
    cp.props.forEach((s, k) => { const q = TDLevel.props[k]; if (q) { q.checked = s.checked; if (q.kind !== "fogata") q.lit = s.lit; } });
    (cp.items || []).forEach((t, k) => { if (TDLevel.batteries[k]) TDLevel.batteries[k].taken = t; });
    Object.assign(Story.flags, cp.flags || {});
    if (!(i === 0 && !Story.flags.linterna)) this.player.battery = Math.max(40, cp.battery || 0);
    if (Story.flags.avistado) this.dormant = false;
    this.checkpoint = cp;
    this.hint("Continuas donde te quedaste", 3.5);
    return true;
  }

  clearCheckpoint() {
    this.checkpoint = null; this._cpKey = null;
    try { localStorage.removeItem("sombra_checkpoint"); } catch (e) {}
  }

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
    if (this.fadeIn > 0) this.fadeIn -= dt;

    let rise = 0, anyChase = false, nearest = Infinity;
    const lightOn = p.flashlight && !(this.lightFlicker > 0);
    if (this.faceCd > 0) this.faceCd -= dt;
    if (this.faceFlash > 0) this.faceFlash -= dt;
    for (const s of (this.dormant ? [] : this.slenders)) {
      s.update(dt, p);
      if (s.state === "chase") anyChase = true;
      const dx = s.x - p.x, dy = s.y - p.y, dist = Math.hypot(dx, dy) || 1;
      nearest = Math.min(nearest, dist);
      const los = TDLevel.lineOfSight(p.x, p.y, s.x, s.y);
      const ang = Math.acos(Math.max(-1, Math.min(1, (p.fx * dx + p.fy * dy) / dist)));
      const lit = lightOn && los && dist < 330 && ang < 0.5;
      // Luz de fogata o foco encendido
      const inFire = TDLevel.props.some((pr) => pr.lit && Math.hypot(s.x - pr.x, s.y - pr.y) < 160) ||
        TDLevel.generators.some((g) => g.active && Math.hypot(s.x - g.x, s.y - g.y) < g.radius);
      // Que tanto se ve: en lo oscuro casi nada; un chispazo cuando la estatica esta alta
      let target = lit || (inFire && los) ? 1 : (los && dist < 115 ? 0.7 : 0.04);
      if (target < 0.5 && los && this.static > 55 && Math.random() < 1.5 * dt) target = 0.6;
      s.vis = (s.vis ?? 0) + (target - (s.vis ?? 0)) * Math.min(1, dt * (target > (s.vis ?? 0) ? 9 : 3));
      s.closeness = Math.max(0, 1 - dist / 340);
      const looking = los && ang < 0.75 && (s.vis > 0.3 || dist < 200);

      // Aparece mas cerca cuando no lo miras
      const jumped = s.blink ? s.blink(p, looking, dt) : null;
      if (jumped) { s.vis = 0; if (jumped === "behind") s.behind = true; Sound.glitchBurst(0.12); }
      // Volteas... y esta detras de ti
      if (s.behind && looking && s.vis > 0.3) {
        s.behind = false;
        this.static = Math.min(100, this.static + 26);
        Sound.hit();
        if (!(this.faceCd > 0)) { this.faceFlash = 0.14; this.faceCd = 6; }
      }
      // Lo alumbras de cerca: ves su cara un instante
      if (lit && dist < 175 && !(this.faceCd > 0)) {
        this.faceFlash = 0.12; this.faceCd = 9;
        Sound.hit();
      }

      if (!p.hidden && los) {
        const vf = 0.35 + 0.65 * s.vis;   // si no lo ves bien, asusta menos
        if (ang < 0.9 && dist < 440) rise = Math.max(rise, (1 - dist / 440) * 28 * vf);
        if (dist < 170) rise = Math.max(rise, 9);
        // La linterna lo congela un instante, pero gasta bateria de golpe
        if (lit && dist < 340 && ang < 0.55 && s.onLit()) {
          p.battery = Math.max(0, p.battery - 12);
          this._notify("La luz lo detiene... por ahora");
          Sound.glitchBurst();
        }
      }
    }

    // Sus pasos: se oyen del lado de donde viene, antes de verlo
    this._stepT = (this._stepT || 0) - dt;
    if (!this.dormant && this._stepT <= 0) {
      let near = null, nd = Infinity;
      for (const s of this.slenders) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < nd) { nd = d; near = s; } }
      if (near && nd < 520 && !(near.stun > 0)) {
        Sound.slenderStep(Math.max(-1, Math.min(1, (near.x - p.x) / 320)), (1 - nd / 520) * 0.55);
        this._stepT = near.state === "chase" ? 0.34 : 0.8;
      } else this._stepT = 0.4;
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
    // La fogata es zona segura: el no entra a su luz
    for (const pr of TDLevel.props) {
      if (pr.kind !== "fogata" || !pr.lit) continue;
      for (const s of this.slenders) if (Math.hypot(s.x - pr.x, s.y - pr.y) < 150) s.fleeFrom(pr.x, pr.y, dt);
    }
    if (p.stamina < 35 || (anyChase && nearest < 260)) {
      // Respira agitado (y mas rapido si se le acaba el aire)
      this._breathT = (this._breathT || 0) - dt;
      if (this._breathT <= 0) { Sound.breath(p.stamina < 20 ? 0.5 : 0.32); this._breathT = p.stamina < 20 ? 0.55 : 0.85; }
    }
    // Guarda a medio camino: si mueres, no repites lo que ya hiciste
    this._saveCheckpoint();
    Sound.setRiver(TDLevel.riverRow != null && TDLevel.water && TDLevel.water.size
      ? 1 - Math.abs(p.y - (TDLevel.riverRow + 1) * TDLevel.TILE) / 380 : 0);

    // Que te persiga da miedo... pero sobre todo si esta cerca
    if (anyChase && nearest < 300) rise += 4 + 18 * (1 - nearest / 300);
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

  _camera(snap) {
    const tx = this.player.x - this.W / 2, ty = this.player.y - this.H / 2;
    const k = snap ? 1 : 0.12;
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    // Si el lugar es mas chico que la pantalla (un cuarto), queda centrado
    this.camX = TDLevel.worldW < this.W ? (TDLevel.worldW - this.W) / 2 : Math.max(0, Math.min(TDLevel.worldW - this.W, this.camX));
    this.camY = TDLevel.worldH < this.H ? (TDLevel.worldH - this.H) / 2 : Math.max(0, Math.min(TDLevel.worldH - this.H, this.camY));
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
    // Baliza (Noche 1): mantener E para prenderla. Hace ruido... y el viene.
    this.balizaPoint = null;
    const bz = TDLevel.props.find((q) => q.kind === "baliza" && !q.lit);
    if (bz && Math.hypot(p.x - bz.x, p.y - bz.y) < 56) {
      const left = TDLevel.notes.filter((n) => !n.collected).length;
      if (left) this._notify("La baliza esta apagada. Primero las notas.");
      else if (Input.isDown("interact")) {
        bz.charge = (bz.charge || 0) + dt;
        this.balizaPoint = bz;
        this._notify(`Prendiendo la baliza... ${Math.min(100, Math.round(bz.charge / 2 * 100))}%`);
        if (bz.charge >= 2) { bz.lit = true; Story.onProp(this, bz); }
      } else { bz.charge = 0; this._notify("Manten E para prender la baliza"); }
    }
    if (this.balizaPoint) for (const s of this.slenders) s.lureTo(bz.x, bz.y, dt);

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
        intruder.enrage();
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

    // Cabanas: se entra por la puerta
    if (TDLevel.room) {
      this._roomInteractions();
    } else for (const pr of TDLevel.props) {
      if (pr.kind !== "cabana" || pr.checked || !pr.door) continue;
      if (Math.hypot(p.x - pr.door.x, p.y - pr.door.y) < 50) {
        this._notify("E: entrar a la cabana");
        if (Input.wasPressed("interact")) { this.enterRoom(pr); return; }
      }
    }

    const e = TDLevel.exit;
    if (!TDLevel.room && Math.hypot(p.x - e.x, p.y - e.y) < 44) {
      const block = Story.exitBlock(this);
      if (block) this._notify(block);
      else { this._notify(Story.exitPrompt()); if (Input.wasPressed("interact")) this._winNight(); }
    }
  }

  // ---- Cuartos (interior de las cabanas) ----
  enterRoom(pr) {
    const cabs = TDLevel.props.filter((q) => q.kind === "cabana");
    const last = cabs.filter((q) => q.checked).length === cabs.length - 1;
    this._outside = { lvl: TDLevel.snapshot(), slenders: this.slenders, prop: pr, last };
    TDLevel.loadRoom(last ? TDLevel.ROOM_LAST : TDLevel.ROOM);
    this.slenders = [];
    const p = this.player;
    p.x = TDLevel.start.x; p.y = TDLevel.start.y; p.fx = 0; p.fy = -1;
    this.roomDone = false;
    this.fadeIn = 0.7;
    this._camera(true);
    Sound.footstep(false);
  }

  exitRoom() {
    const o = this._outside;
    if (!o) return;
    TDLevel.restore(o.lvl);
    this.slenders = o.slenders;
    const p = this.player;
    p.x = o.prop.door.x; p.y = o.prop.door.y + 14; p.fx = 0; p.fy = 1;
    this._outside = null;
    this.fadeIn = 0.6;
    // Al salir de la ultima, el ya te esta esperando afuera
    if (o.last && this.slenders.length) {
      const s = this.slenders[0];
      for (let k = 0; k < 20; k++) {
        const a = Math.random() * Math.PI * 2, x = p.x + Math.cos(a) * 320, y = p.y + Math.sin(a) * 320;
        if (!TDLevel.circleHitsWall(x, y, 14)) { s.x = x; s.y = y; s._path = []; break; }
      }
      s.state = "suspicious"; s.detection = 70;
    }
    this._camera(true);
  }

  _roomInteractions() {
    const p = this.player;
    for (const b of TDLevel.beds) {
      if (b.counted || Math.hypot(p.x - b.x, p.y - b.y) > 60) continue;
      this._notify("E: contar la litera");
      if (Input.wasPressed("interact")) {
        b.counted = true; Sound.readTick();
        if (TDLevel.beds.every((q) => q.counted) && !this.roomDone) {
          this.roomDone = true;
          this._outside.prop.checked = true;
          Story.onProp(this, this._outside.prop);
        }
      }
    }
    const e = TDLevel.exit;
    if (Math.hypot(p.x - e.x, p.y - e.y) < 48) {
      if (!this.roomDone) this._notify("Cuenta las literas primero");
      else { this._notify("E: salir de la cabana"); if (Input.wasPressed("interact")) this.exitRoom(); }
    }
  }

  // Un Esbelto de verdad dentro del cuarto (guion)
  spawnInRoom(x, y) {
    const s = new TDSlender({ x, y, speed: 92, viewDist: 400, persistence: 1.2 });
    s.x = x; s.y = y; s.state = "chase"; s.detection = 100; s.blinkCd = 999;
    this.slenders = [s];
  }

  resumeFromNote() { if (this.state === "note") this.state = "playing"; }

  _lose() {
    this.state = "gameover"; Sound.stinger(); Sound.stopReading(); Sound.stopAmbience();
    this._emit("gameover", { night: this.night + 1 });
  }
  _winNight() {
    Sound.stopAmbience();
    this.clearCheckpoint();
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
    this._drawSprites(ctx);
    ctx.restore();
    // Tinte de ambiente de la noche
    if (this.ambient) { ctx.fillStyle = this.ambient.tint; ctx.fillRect(0, 0, W, H); }
    this._drawLighting(ctx);
    if (this.faceFlash > 0) this._drawFace(ctx);
    this._drawHUD(ctx);
    if (this.fadeIn > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fadeIn / 1.4)})`; ctx.fillRect(0, 0, W, H); }
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
            if (ch === "e") {
              // Donde estaba la litera que falta: marcas en el piso
              ctx.strokeStyle = "rgba(200,190,170,0.18)"; ctx.setLineDash([5, 5]);
              ctx.strokeRect(x + 4, y + 2, T - 8, T - 4); ctx.setLineDash([]);
            }
            if (ch === "X") {
              const gl = ctx.createLinearGradient(x, y + T, x, y);
              gl.addColorStop(0, "rgba(120,140,190,0.25)"); gl.addColorStop(1, "rgba(120,140,190,0)");
              ctx.fillStyle = gl; ctx.fillRect(x, y, T, T);
            }
          }
          continue;
        }
        if (TDLevel.water && TDLevel.water.has(r + "," + c)) {
          // Agua oscura que corre
          ctx.fillStyle = "#0d1a2a"; ctx.fillRect(x, y, T, T);
          const t = Date.now() / 900;
          ctx.fillStyle = "rgba(120,160,210,0.12)";
          for (let k = 0; k < 3; k++) ctx.fillRect(x + ((k * 19 + t * 30 + r * 7) % T), y + 8 + k * 15, 14, 2);
          continue;
        }
        if (TDLevel.grid[r][c] === 1) continue;
        ctx.fillStyle = (r + c) % 2 ? "#1b2417" : "#1f2a1a";
        ctx.fillRect(x, y, T, T);
        if (TDLevel.bridge && TDLevel.bridge.has(r + "," + c)) {
          ctx.fillStyle = "#0d1a2a"; ctx.fillRect(x, y, T, T);
          ctx.fillStyle = "#4a3422";
          for (let k = 0; k < 4; k++) ctx.fillRect(x + 1, y + k * 13 + 1, T - 2, 10);
          ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x, y, 3, T); ctx.fillRect(x + T - 3, y, 3, T);
        }
        if (TDLevel.bushes.has(r + "," + c)) {
          ctx.fillStyle = "#2f5a30";
          ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, T * 0.5, T * 0.42, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#356436";
          ctx.beginPath(); ctx.ellipse(x + T * 0.38, y + T * 0.42, T * 0.22, T * 0.18, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    this._drawTrail(ctx);
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

  // Su cara, un instante, encima de todo
  _drawFace(ctx) {
    const k = Math.max(0, this.faceFlash / 0.14) * (Settings.lessFlash ? 0.3 : 1);
    Cinematic._slenderFace(ctx, this.W, this.H, 1.05, 0.3, Math.min(1, k * 1.4));
  }

  // Sendero de tierra y huellas (Noche 1)
  _drawTrail(ctx) {
    const tr = TDLevel.trail;
    if (!tr) return;
    const x0 = this.camX - 60, x1 = this.camX + this.W + 60, y0 = this.camY - 60, y1 = this.camY + this.H + 60;
    const vis = (p) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
    const bz = TDLevel.props.find((q) => q.kind === "baliza");
    const showFin = !bz || bz.lit;
    const upto = showFin ? tr.length : Math.min(tr.length, (TDLevel.trailFinal ?? tr.length) + 1);
    // Un solo trazo grueso para que el sendero se vea continuo
    ctx.save();
    ctx.strokeStyle = "rgba(70,52,34,0.36)"; ctx.lineWidth = 44; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); for (let i = 0; i < upto; i++) (i ? ctx.lineTo(tr[i].x, tr[i].y) : ctx.moveTo(tr[i].x, tr[i].y)); ctx.stroke();
    ctx.strokeStyle = "rgba(90,68,44,0.25)"; ctx.lineWidth = 26; ctx.stroke();
    ctx.restore();
    for (const f of TDLevel.prints) {
      if (!vis(f) || (f.fin && !showFin)) continue;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
      if (f.big) {
        // La huella enorme, descalza
        ctx.fillStyle = "rgba(14,10,8,0.7)";
        ctx.beginPath(); ctx.ellipse(0, 0, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(15, k * 2.5, 1.6, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.fillStyle = "rgba(20,14,10,0.55)";
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Cabana del campamento (3x2 casillas)
  _drawCabana(ctx, pr) {
    const T = TDLevel.TILE, { c, r } = pr.tile;
    const x = (c - 1) * T, y = (r - 1) * T, w = 3 * T, h = 2 * T, lift = 34;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 4, y + h - 6, w, 10);
    ctx.fillStyle = "#2a1f16"; ctx.fillRect(x, y - lift + 20, w, h + lift - 20);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    for (let yy = y - lift + 30; yy < y + h; yy += 12) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    ctx.fillStyle = "#1a130e";
    ctx.beginPath(); ctx.moveTo(x - 10, y - lift + 24); ctx.lineTo(x + w / 2, y - lift - 22); ctx.lineTo(x + w + 10, y - lift + 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1c2438"; ctx.fillRect(x + 14, y + 14, 26, 20); ctx.fillRect(x + w - 40, y + 14, 26, 20);
    ctx.fillStyle = pr.checked ? "#050404" : "#4a3220";
    ctx.fillRect(x + w / 2 - 15, y + h - 46, 30, 46);
    ctx.fillStyle = "#c8b890"; ctx.font = "10px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`CABANA ${TDLevel.props.filter((q) => q.kind === "cabana").indexOf(pr) + 1}`, x + w / 2, y - lift + 36);
    ctx.textAlign = "left";
  }

  // Baliza del sendero: poste con foco
  _drawBaliza(ctx, pr) {
    const x = pr.x, y = pr.y;
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(x, y + 14, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3c3f46"; ctx.fillRect(x - 3, y - 60, 6, 74);
    ctx.fillStyle = "#2a2c31"; ctx.fillRect(x - 10, y - 70, 20, 12);
    const on = pr.lit && Math.random() > 0.03;
    ctx.fillStyle = on ? "#ffe9a8" : (pr.charge > 0 && Math.random() < 0.5 ? "#a08a50" : "#4a4a40");
    ctx.beginPath(); ctx.arc(x, y - 64, 6, 0, Math.PI * 2); ctx.fill();
    if (on) {
      const g = ctx.createRadialGradient(x, y - 64, 4, x, y - 64, 70);
      g.addColorStop(0, "rgba(255,233,168,0.45)"); g.addColorStop(1, "rgba(255,233,168,0)");
      ctx.fillStyle = g; ctx.fillRect(x - 70, y - 134, 140, 140);
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
          if (TDLevel.propTiles && TDLevel.propTiles.has(r + "," + c)) continue;
          if (TDLevel.water && TDLevel.water.has(r + "," + c)) continue;
          items.push({ y: r * T + T, fn: () => (rock ? this._drawRock(ctx, c, r) : this._drawTree(ctx, c, r)) });
        }
    for (const b of TDLevel.batteries) if (!b.taken) items.push({ y: b.y + 10, fn: () => (b.id === "linterna" ? this._drawFlashlightItem(ctx, b) : this._drawBattery(ctx, b)) });
    for (const n of TDLevel.notes) if (!n.collected) items.push({ y: n.y + 12, fn: () => this._drawNote(ctx, n) });
    for (const g of TDLevel.generators) items.push({ y: g.y + 18, fn: () => this._drawGenerator(ctx, g) });
    for (const pr of TDLevel.props) if (pr.kind === "baliza") items.push({ y: pr.y + 14, fn: () => this._drawBaliza(ctx, pr) });
    for (const pr of TDLevel.props) if (pr.kind === "fogata") items.push({ y: pr.y + 14, fn: () => this._drawFogata(ctx, pr) });
    for (const pr of TDLevel.props) if (pr.kind === "cabana") items.push({ y: (pr.tile.r + 1) * TDLevel.TILE, fn: () => this._drawCabana(ctx, pr) });
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
    const flick = this.lightFlicker > 0 && Math.random() < (Settings.lessFlash ? 0.12 : 0.65);
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
    // Meta de esta noche
    ctx.fillStyle = "#c9b27a"; ctx.font = "13px 'Trebuchet MS', sans-serif";
    ctx.fillText("\u25B8 " + Story.goal(this), 20, 108);

    ctx.fillStyle = "#dfe6df"; ctx.font = "16px 'Trebuchet MS', sans-serif"; ctx.textAlign = "right";
    const got = TDLevel.notes.filter((n) => n.collected).length;
    if (!TDLevel.room) ctx.fillText(`${story ? "Pistas" : "Notas"}: ${got}/${TDLevel.notes.length}`, this.W - 76, 32);
    if (TDLevel.generators.length) ctx.fillText(`Focos: ${this.genCharges}`, this.W - 76, 54);
    if (!story || this.player.battery > 0) ctx.fillText(`Linterna: ${this.player.flashlight ? "ON" : "OFF"}`, this.W - 76, TDLevel.generators.length ? 76 : 54);
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
