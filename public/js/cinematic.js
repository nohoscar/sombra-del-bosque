// Sistema de cinemáticas: reproduce una secuencia de escenas dibujadas en canvas,
// con fundidos, subtítulos, barras cinematográficas y opción de avanzar/saltar.
const Cinematic = {
  active: false,
  scenes: [],
  index: 0,
  t: 0,
  fade: 1,
  phase: "in",     // in | hold | out
  onDone: null,
  _advance: false,

  play(scenes, onDone) {
    this.scenes = scenes;
    this.onDone = onDone;
    this.index = 0;
    this.t = 0;
    this.fade = 1;
    this.phase = "in";
    this.active = true;
    this._advance = false;
  },

  advance() { this._advance = true; },

  skipAll() {
    if (!this.active) return;
    this.active = false;
    if (typeof Sound !== "undefined") Sound.stopVoice();
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  },

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const IN = 0.8, OUT = 0.6, MAXHOLD = 11;

    if (this.phase === "in") {
      this.fade = 1 - Math.min(1, this.t / IN);
      if (this.t >= IN) {
        this.phase = "hold"; this.t = 0;
        const sc = this.scenes[this.index];
        this._voiceDur = 0;
        if (sc && sc.voice && typeof Sound !== "undefined") this._voiceDur = Sound.playVoice(sc.voice) || 0;
        if (sc && sc.theme && typeof Sound !== "undefined") Sound.theme(sc.theme === "roto");
        if (sc && sc.hit && typeof Sound !== "undefined") Sound.hit();
        if (sc && sc.sfx === "glitch" && typeof Sound !== "undefined") Sound.glitchBurst();
      }
    } else if (this.phase === "hold") {
      this.fade = 0;
      const scene = this.scenes[this.index];
      const maxHold = Math.max((scene && scene.hold) ? scene.hold : MAXHOLD, (this._voiceDur || 0) + 1.2);
      const canSkip = this.t > 0.35;
      const pressed = this._advance || Input.wasPressed("jump") || Input.wasPressed("interact");
      if (pressed && canSkip) { this.phase = "out"; this.t = 0; if (typeof Sound !== "undefined") Sound.stopVoice(); }
      else if (this.t > maxHold) { this.phase = "out"; this.t = 0; }
      this._advance = false;
    } else if (this.phase === "out") {
      this.fade = Math.min(1, this.t / OUT);
      if (this.t >= OUT) {
        this.index++;
        if (this.index >= this.scenes.length) {
          this.active = false;
          const cb = this.onDone;
          this.onDone = null;
          if (cb) cb();
        } else {
          this.phase = "in";
          this.t = 0;
        }
      }
    }
  },

  draw(ctx, W, H) {
    if (!this.active) return;
    const scene = this.scenes[this.index];

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Escena
    if (scene && scene.draw) scene.draw(ctx, this.t, W, H, this.phase);

    // Viñeta
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Fundido a negro
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Barras cinematográficas
    const bar = 64;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);

    // Subtítulo
    const textAlpha = Math.max(0, 1 - this.fade * 1.4);
    if (scene && scene.caption && textAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.fillStyle = "#e8e6df";
      ctx.font = "20px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      const lines = scene.caption.split("\n");
      const startY = H - bar - 18 - (lines.length - 1) * 26;
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * 26));
      ctx.restore();
    }

    // Pista de avanzar (parpadea)
    if (this.phase === "hold") {
      const blink = 0.4 + Math.sin(this.t * 3) * 0.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, blink);
      ctx.fillStyle = "#b7c0b7";
      ctx.font = "14px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("Click o [ESPACIO] para continuar  >>", W - 24, H - bar - 14);
      ctx.restore();
    }
  },

  // ================= HELPERS DE DIBUJO =================
  _sky(ctx, W, H, topColor, botColor) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, topColor);
    g.addColorStop(1, botColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },

  _moon(ctx, mx, my, r) {
    const halo = ctx.createRadialGradient(mx, my, r * 0.3, mx, my, r * 3);
    halo.addColorStop(0, "rgba(210,220,240,0.3)");
    halo.addColorStop(1, "rgba(210,220,240,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(mx, my, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d6dcec";
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
  },

  _stars(ctx, W, H, n, t) {
    for (let i = 0; i < n; i++) {
      const x = (i * 137.5) % W;
      const y = (i * 53.3) % (H * 0.5);
      const a = 0.35 + Math.sin(t * 2 + i) * 0.3;
      ctx.fillStyle = `rgba(220,225,255,${Math.max(0, a)})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  },

  _treeline(ctx, W, baseY, color, count) {
    ctx.fillStyle = color;
    const step = W / count;
    for (let i = 0; i <= count; i++) {
      const x = i * step;
      const h = 90 + ((i * 41) % 70);
      ctx.beginPath();
      ctx.moveTo(x - step * 0.6, baseY);
      ctx.lineTo(x, baseY - h);
      ctx.lineTo(x + step * 0.6, baseY);
      ctx.closePath();
      ctx.fill();
    }
  },

  _slenderFar(ctx, x, y, h, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const w = h * 0.12;
    ctx.fillStyle = "#0c0c10";
    ctx.fillRect(x - w / 2, y - h, w, h);           // cuerpo
    ctx.fillRect(x - w * 1.1, y - h * 0.9, w * 0.5, h * 0.6); // brazo
    ctx.fillRect(x + w * 0.6, y - h * 0.9, w * 0.5, h * 0.6);
    ctx.fillStyle = "#e9e9ec";
    ctx.fillRect(x - w / 2, y - h, w, h * 0.12);     // cabeza pálida
    ctx.restore();
  },

  _alex(ctx, x, y, s, flip) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(s, s);
    // piernas
    ctx.fillStyle = "#274574";
    ctx.fillRect(-6, -18, 5, 18);
    ctx.fillRect(2, -18, 5, 18);
    // hoodie
    ctx.fillStyle = "#2f7d43";
    ctx.fillRect(-8, -42, 16, 26);
    // cabeza
    ctx.fillStyle = "#e6b58f";
    ctx.fillRect(-6, -54, 12, 12);
    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(-7, -56, 14, 6);
    ctx.restore();
  },
};

// ---------------- Escena de apertura ----------------
Cinematic.OPENING = [
  {
    caption: "Papa tenia turno doble esa noche.\nMe tocaba cuidar a Tommy. Como siempre.",
    voice: "op_1",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#12142a", "#243049");
      Cinematic._stars(ctx, W, H, 60, t);
      Cinematic._moon(ctx, W - 140, 130, 34);
      // silueta de bosque lejano
      Cinematic._treeline(ctx, W, H - 120, "#0e1020", 14);
      // suelo / camino
      ctx.fillStyle = "#171a24";
      ctx.fillRect(0, H - 120, W, 120);
      ctx.fillStyle = "#20242f";
      ctx.beginPath();
      ctx.moveTo(W * 0.35, H - 120);
      ctx.lineTo(W * 0.65, H - 120);
      ctx.lineTo(W * 0.8, H);
      ctx.lineTo(W * 0.2, H);
      ctx.closePath();
      ctx.fill();
      // casa a la derecha con ventana encendida
      const hx = W * 0.62, hy = H - 260;
      ctx.fillStyle = "#241f2b";
      ctx.fillRect(hx, hy, 230, 160);
      ctx.fillStyle = "#1a1620";
      ctx.beginPath();
      ctx.moveTo(hx - 14, hy);
      ctx.lineTo(hx + 115, hy - 70);
      ctx.lineTo(hx + 244, hy);
      ctx.closePath();
      ctx.fill();
      // puerta
      ctx.fillStyle = "#3a2c1e";
      ctx.fillRect(hx + 30, hy + 90, 44, 70);
      // ventana encendida (cálida)
      const winG = ctx.createLinearGradient(hx + 130, hy + 40, hx + 130, hy + 100);
      winG.addColorStop(0, "#ffd98a");
      winG.addColorStop(1, "#e0a850");
      ctx.fillStyle = winG;
      ctx.fillRect(hx + 130, hy + 40, 70, 58);
      ctx.fillStyle = "#241f2b";
      ctx.fillRect(hx + 162, hy + 40, 6, 58);
      ctx.fillRect(hx + 130, hy + 66, 70, 6);
      // Alex caminando hacia la casa
      const walk = Math.min(1, t / 3);
      const ax = W * 0.2 + walk * (W * 0.35);
      Cinematic._alex(ctx, ax, H - 110, 1.6, false);
    },
  },
  {
    caption: "Al pasar junto al bosque, senti que algo me miraba.\nAlgo alto. Quieto.",
    voice: "op_2",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#0f1124", "#1d2338");
      Cinematic._stars(ctx, W, H, 50, t);
      Cinematic._moon(ctx, 150, 120, 30);
      // niebla baja
      ctx.fillStyle = "rgba(150,160,180,0.06)";
      ctx.fillRect(0, H - 200, W, 120);
      // bosque más cercano
      Cinematic._treeline(ctx, W, H - 90, "#0a0c18", 10);
      ctx.fillStyle = "#12141d";
      ctx.fillRect(0, H - 90, W, 90);
      // Alex de espaldas, mirando al bosque
      Cinematic._alex(ctx, W * 0.28, H - 84, 1.8, false);
      // El Esbelto entre los árboles, apareciendo lentamente
      const appear = Math.max(0, Math.min(0.8, (t - 1.2) / 3));
      Cinematic._slenderFar(ctx, W * 0.72, H - 96, 150, appear);
    },
  },
  {
    caption: "Cuando llegue, la casa estaba a oscuras.\nY la ventana del cuarto de Tommy, abierta de par en par.",
    voice: "op_3",
    draw(ctx, t, W, H) {
      // Interior del cuarto, luz de luna azul
      Cinematic._sky(ctx, W, H, "#161a2e", "#0e1120");
      ctx.fillStyle = "#1a1e30";
      ctx.fillRect(0, H - 150, W, 150); // piso
      // pared con ventana abierta
      const wx = W * 0.58, wy = 120;
      ctx.fillStyle = "#0c1830";
      ctx.fillRect(wx, wy, 150, 150);
      // luz de luna entrando
      const beam = ctx.createLinearGradient(wx, wy, wx - 120, H - 150);
      beam.addColorStop(0, "rgba(150,180,235,0.22)");
      beam.addColorStop(1, "rgba(150,180,235,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + 150, wy);
      ctx.lineTo(wx + 40, H - 150);
      ctx.lineTo(wx - 150, H - 150);
      ctx.closePath();
      ctx.fill();
      // marco y cortina meciéndose
      ctx.strokeStyle = "#2a3350";
      ctx.lineWidth = 6;
      ctx.strokeRect(wx, wy, 150, 150);
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(210,215,230,0.5)";
      const sway = Math.sin(t * 2) * 10;
      ctx.beginPath();
      ctx.moveTo(wx + 150, wy);
      ctx.quadraticCurveTo(wx + 130 + sway, wy + 75, wx + 150, wy + 150);
      ctx.lineTo(wx + 120, wy + 150);
      ctx.lineTo(wx + 120, wy);
      ctx.closePath();
      ctx.fill();
      // cama vacía a la izquierda
      ctx.fillStyle = "#3a2c3a";
      ctx.fillRect(W * 0.12, H - 210, 200, 60);
      ctx.fillStyle = "#4a3a4a";
      ctx.fillRect(W * 0.12, H - 230, 40, 24); // almohada
      ctx.fillStyle = "#2c2130";
      ctx.fillRect(W * 0.12, H - 150, 200, 8);
      // dibujo infantil en el piso
      ctx.fillStyle = "#d9c7a3";
      ctx.fillRect(W * 0.42, H - 170, 26, 30);
    },
  },
];

// ---------------- Helpers extra ----------------
Cinematic._stoneCircle = function (ctx, cx, y, rx, names) {
  ctx.strokeStyle = "#3a3540";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, rx * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  // piedras verticales alrededor
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sx = cx + Math.cos(a) * rx;
    const sy = y + Math.sin(a) * rx * 0.35;
    ctx.fillStyle = "#413b47";
    ctx.fillRect(sx - 4, sy - 16, 8, 16);
    ctx.fillStyle = "#2a2530";
    ctx.fillRect(sx - 2, sy - 12, 4, 10);
  }
};

// ---------------- Interludios entre noches (índice = noche que empieza) ----------------
Cinematic.INTERLUDES = {
  // Antes de la Noche 1
  1: [
  {
    caption: "Segui sus huellas hasta donde empiezan los pinos.\nNo le avise a nadie. Quien me iba a creer.",
    voice: "in_1",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#0c0e1c", "#181c2c");
      Cinematic._stars(ctx, W, H, 40, t);
      Cinematic._moon(ctx, W - 120, 110, 28);
      // pared de bosque imponente
      Cinematic._treeline(ctx, W, H - 80, "#0a0c16", 8);
      Cinematic._treeline(ctx, W, H - 80, "#070810", 5);
      ctx.fillStyle = "#101219";
      ctx.fillRect(0, H - 80, W, 80);
      // niebla densa
      ctx.fillStyle = "rgba(150,160,180,0.08)";
      ctx.fillRect(0, H - 170, W, 90);
      // Alex de espaldas con haz de linterna hacia el bosque
      const ax = W * 0.32;
      Cinematic._alex(ctx, ax, H - 74, 2, false);
      const beam = ctx.createLinearGradient(ax, H - 120, W, H - 200);
      beam.addColorStop(0, "rgba(255,240,190,0.22)");
      beam.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(ax + 6, H - 118);
      ctx.lineTo(W, H - 240);
      ctx.lineTo(W, H - 120);
      ctx.closePath();
      ctx.fill();
    },
  },
  ],
  // Antes de la Noche 2
  2: [{
    caption: "El sendero muere en un campamento de verano abandonado.\nUn arco podrido: 'CAMPAMENTO WILLOW'. Cerrado hace decadas.",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#0f1124", "#1b2036");
      Cinematic._stars(ctx, W, H, 45, t);
      Cinematic._moon(ctx, W - 140, 110, 26);
      Cinematic._treeline(ctx, W, H - 90, "#0a0c18", 10);
      ctx.fillStyle = "#12141d";
      ctx.fillRect(0, H - 90, W, 90);
      // arco de entrada
      ctx.fillStyle = "#231b14";
      ctx.fillRect(W * 0.3, H - 260, 16, 170);
      ctx.fillRect(W * 0.66, H - 260, 16, 170);
      ctx.fillRect(W * 0.3, H - 268, W * 0.36 + 16, 20);
      // cartel torcido colgando
      ctx.save();
      ctx.translate(W * 0.48, H - 236);
      ctx.rotate(0.09);
      ctx.fillStyle = "#5a3e24";
      ctx.fillRect(-78, -17, 156, 36);
      ctx.fillStyle = "#e0d0a0";
      ctx.font = "15px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CAMPAMENTO WILLOW", 0, 5);
      ctx.restore();
      // tiendas de campana
      for (let i = 0; i < 3; i++) {
        const tx = W * 0.2 + i * W * 0.22;
        ctx.fillStyle = "#26331f";
        ctx.beginPath();
        ctx.moveTo(tx - 42, H - 90); ctx.lineTo(tx, H - 162); ctx.lineTo(tx + 42, H - 90);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#080a06";
        ctx.beginPath();
        ctx.moveTo(tx - 9, H - 90); ctx.lineTo(tx, H - 122); ctx.lineTo(tx + 9, H - 90);
        ctx.closePath(); ctx.fill();
      }
      Cinematic._alex(ctx, W * 0.5, H - 84, 1.6, false);
    },
  }],
  // Antes de la Noche 3
  3: [{
    caption: "Entre los pinos aparece la vieja estacion de guardabosques.\nVentanas rotas. La radio, muda desde hace anos.",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#0e1022", "#1a1e34");
      Cinematic._stars(ctx, W, H, 40, t);
      Cinematic._moon(ctx, 150, 110, 26);
      Cinematic._treeline(ctx, W, H - 100, "#090b16", 9);
      ctx.fillStyle = "#101219";
      ctx.fillRect(0, H - 100, W, 100);
      // cabaña-estación
      const hx = W * 0.4, hy = H - 260;
      ctx.fillStyle = "#241c16";
      ctx.fillRect(hx, hy, 240, 160);
      ctx.fillStyle = "#160f0a";
      ctx.beginPath();
      ctx.moveTo(hx - 16, hy); ctx.lineTo(hx + 120, hy - 56); ctx.lineTo(hx + 256, hy);
      ctx.closePath(); ctx.fill();
      // troncos horizontales
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      for (let yy = hy + 16; yy < hy + 160; yy += 18) {
        ctx.beginPath(); ctx.moveTo(hx, yy); ctx.lineTo(hx + 240, yy); ctx.stroke();
      }
      // ventana rota con luz débil
      ctx.fillStyle = "#2a3550";
      ctx.fillRect(hx + 30, hy + 44, 60, 50);
      ctx.strokeStyle = "#080808";
      ctx.beginPath();
      ctx.moveTo(hx + 30, hy + 44); ctx.lineTo(hx + 90, hy + 94);
      ctx.moveTo(hx + 90, hy + 44); ctx.lineTo(hx + 30, hy + 94);
      ctx.stroke();
      // puerta
      ctx.fillStyle = "#3a2c1e";
      ctx.fillRect(hx + 140, hy + 80, 50, 80);
      // mástil de radio
      ctx.strokeStyle = "#3a3a44";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx + 230, hy); ctx.lineTo(hx + 230, hy - 64); ctx.stroke();
      ctx.lineWidth = 1;
      Cinematic._alex(ctx, W * 0.74, H - 94, 1.6, true);
    },
  }],
  // Antes de la Noche 4
  4: [{
    caption: "Un claro con circulos de piedra.\nNombres de ninos tallados. El ultimo dice: TOMMY.",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#14122a", "#241a2c");
      Cinematic._stars(ctx, W, H, 35, t);
      Cinematic._moon(ctx, W * 0.5, 120, 40);
      Cinematic._treeline(ctx, W, H - 120, "#0c0a1a", 11);
      ctx.fillStyle = "#181422";
      ctx.fillRect(0, H - 120, W, 120);
      Cinematic._stoneCircle(ctx, W * 0.5, H - 70, 220);
      Cinematic._stoneCircle(ctx, W * 0.22, H - 60, 90);
      Cinematic._stoneCircle(ctx, W * 0.78, H - 62, 100);
      Cinematic._alex(ctx, W * 0.5, H - 66, 1.6, false);
    },
  }],
  // Antes de la Noche 5
  5: [{
    caption: "Tres sombras te siguen ahora.\n'No mires atras, hermano', susurra Tommy. 'Corre'.",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#1a0e18", "#2a1216");
      ctx.fillStyle = "rgba(120,20,25,0.10)";
      ctx.fillRect(0, 0, W, H);
      Cinematic._stars(ctx, W, H, 25, t);
      Cinematic._treeline(ctx, W, H - 80, "#0c0810", 9);
      ctx.fillStyle = "#140d10";
      ctx.fillRect(0, H - 80, W, 80);
      Cinematic._alex(ctx, W * 0.28, H - 74, 1.9, false);
      Cinematic._slenderFar(ctx, W * 0.6, H - 92, 130, 0.6);
      Cinematic._slenderFar(ctx, W * 0.75, H - 96, 150, 0.5);
      Cinematic._slenderFar(ctx, W * 0.9, H - 90, 120, 0.4);
    },
  }],
};

// ---------------- Final (victoria) ----------------
Cinematic.ENDING = [
  {
    caption: "Cruzas la puerta justo cuando el sol asoma\nentre los arboles.",
    draw(ctx, t, W, H) {
      // amanecer
      Cinematic._sky(ctx, W, H, "#2a2a48", "#c98a5a");
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.7, 20, W * 0.5, H * 0.7, W * 0.7);
      glow.addColorStop(0, "rgba(255,225,160,0.7)");
      glow.addColorStop(1, "rgba(255,225,160,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      Cinematic._treeline(ctx, W, H - 70, "#3a2b28", 10);
      ctx.fillStyle = "#4a3a30";
      ctx.fillRect(0, H - 70, W, 70);
      Cinematic._alex(ctx, W * 0.42, H - 64, 2, false);
    },
  },
  {
    caption: "Junto a ti, la sombra de un nino sonrie...\ny se deshace en la luz de la manana.",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#3a3a5a", "#e0a868");
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.5, 20, W * 0.5, H * 0.5, W * 0.7);
      glow.addColorStop(0, "rgba(255,235,180,0.85)");
      glow.addColorStop(1, "rgba(255,235,180,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#4a3a30";
      ctx.fillRect(0, H - 70, W, 70);
      Cinematic._alex(ctx, W * 0.44, H - 64, 2, false);
      // sombra de Tommy que se desvanece
      const fade = Math.max(0, 0.8 - t / 5);
      ctx.save();
      ctx.globalAlpha = fade;
      Cinematic._alex(ctx, W * 0.54, H - 64, 1.3, true);
      ctx.restore();
    },
  },
  {
    caption: "El bosque queda en silencio por primera vez en anos.\nTommy es libre. El ciclo se rompio.",
    draw(ctx, t, W, H) {
      Cinematic._sky(ctx, W, H, "#4a5a7a", "#f0c890");
      Cinematic._treeline(ctx, W, H - 70, "#5a4a40", 10);
      ctx.fillStyle = "#6a5a4a";
      ctx.fillRect(0, H - 70, W, 70);
      // aves lejanas
      ctx.strokeStyle = "rgba(30,30,40,0.5)";
      for (let i = 0; i < 5; i++) {
        const bx = W * 0.2 + i * 90 + Math.sin(t + i) * 10;
        const by = 120 + (i % 2) * 30;
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx + 8, by - 5); ctx.lineTo(bx + 16, by);
        ctx.stroke();
      }
    },
  },
];

// ---------------- Cara del Esbelto (susto y muerte) ----------------
// Cabeza enorme, alargada y sin rostro: solo dos sombras hundidas donde irian los ojos.
Cinematic._slenderFace = function (ctx, W, H, scale, tilt, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  ctx.translate(W / 2, H * 0.55);
  ctx.rotate(tilt || 0);
  ctx.scale(scale, scale);
  // Hombros y cuello del traje
  ctx.fillStyle = "#0c0c10";
  ctx.beginPath(); ctx.moveTo(-260, 420); ctx.lineTo(-150, 210); ctx.lineTo(150, 210); ctx.lineTo(260, 420); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d9d9de"; ctx.beginPath(); ctx.moveTo(-34, 210); ctx.lineTo(34, 210); ctx.lineTo(0, 330); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#5a1010"; ctx.beginPath(); ctx.moveTo(-8, 214); ctx.lineTo(8, 214); ctx.lineTo(4, 320); ctx.lineTo(-4, 320); ctx.closePath(); ctx.fill();
  // Cara
  const g = ctx.createRadialGradient(-30, -60, 20, 0, 0, 230);
  g.addColorStop(0, "#f2f2f4"); g.addColorStop(0.6, "#d6d7dc"); g.addColorStop(1, "#8d8f98");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 120, 200, 0, 0, Math.PI * 2); ctx.fill();
  // Hundimientos donde deberian estar los ojos y la boca
  ctx.fillStyle = "rgba(70,70,82,0.35)";
  ctx.beginPath(); ctx.ellipse(-44, -30, 26, 34, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(44, -30, 26, 34, -0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(70,70,82,0.18)";
  ctx.beginPath(); ctx.ellipse(0, 90, 38, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Estatica encima
  for (let i = 0; i < 14; i++) {
    const y = Math.random() * H, h = 2 + Math.random() * 10;
    ctx.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${200 + Math.random() * 55 | 0},${210 + Math.random() * 45 | 0},${0.08 + Math.random() * 0.15})`;
    ctx.fillRect(0, y, W, h);
  }
};

// ---------------- Ser atrapado ----------------
// Se agacha hacia la camara, todo se vuelve estatica... y luego silencio total.
Cinematic.DEATH = [
  {
    caption: "",
    hold: 2.6,
    draw(ctx, t, W, H) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (t < 1.4) {
        const k = Math.min(1, t / 1.2);
        Cinematic._slenderFace(ctx, W, H, 0.45 + k * k * 1.4, 0.15 + k * 0.35, Math.min(1, t * 3));
        if (t > 0.9) {   // la imagen se rompe
          const r = (t - 0.9) / 0.5;
          for (let i = 0; i < 40 * r; i++) {
            const v = Math.random() * 255 | 0;
            ctx.fillStyle = `rgba(${v},${v},${v},0.85)`;
            ctx.fillRect(Math.random() * W, Math.random() * H, 30 + Math.random() * 300, 2 + Math.random() * 8);
          }
        }
      }
      // Despues: negro y silencio
    },
  },
];

// ---------------- Letrero de cinta entre capitulos ----------------
// Estatica, sello de la cinta ("NOCHE 2 · 01:17 a.m."), titulo letra por letra y la voz de Alex.
Cinematic.titleCard = function (o) {
  return [{
    caption: "",
    hold: o.hold || 7,
    voice: o.voice,
    sfx: "glitch",
    draw(ctx, t0, W, H, phase) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (phase === "in") return;
      const t = phase === "out" ? 99 : t0;
      // Golpe de estatica al entrar
      if (phase === "hold" && t < 0.45 && !(typeof Settings !== "undefined" && Settings.lessFlash)) {
        for (let i = 0; i < 260; i++) {
          const v = Math.random() * 255 | 0;
          ctx.fillStyle = `rgba(${v},${v},${v},${0.9 - t * 2})`;
          ctx.fillRect(Math.random() * W, Math.random() * H, 4 + Math.random() * 60, 2 + Math.random() * 4);
        }
      }
      // Sello de la cinta
      ctx.font = "16px Consolas, 'Courier New', monospace"; ctx.textAlign = "left";
      ctx.fillStyle = "#c9cfd6";
      ctx.fillText("\u25B6 PLAY", 40, 96);
      if (Math.floor(t * 1.6) % 2 === 0) { ctx.fillStyle = "#c22"; ctx.beginPath(); ctx.arc(W - 106, 90, 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#c9cfd6"; ctx.textAlign = "right"; ctx.fillText("REC", W - 40, 96);
      ctx.textAlign = "left"; ctx.fillText(o.stamp || "", 40, H - 84);
      // Titulo letra por letra
      const shown = Math.min(o.title.length, Math.floor(Math.max(0, t - 0.5) * 14));
      ctx.font = "48px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center";
      ctx.fillStyle = "#e6e2d8";
      const jx = Math.random() < 0.04 ? (Math.random() - 0.5) * 8 : 0;
      ctx.fillText(o.title.slice(0, shown), W / 2 + jx, H * 0.45);
      if (o.label) {
        ctx.font = "13px Georgia, serif"; ctx.fillStyle = "#8d939b";
        ctx.fillText(o.label.split("").join(" "), W / 2, H * 0.45 - 62);
      }
      // Texto debajo, aparece despues del titulo
      const a = Math.max(0, Math.min(1, (t - 0.6 - o.title.length / 14) * 1.2));
      if (a > 0 && o.text) {
        ctx.globalAlpha = a; ctx.font = "italic 18px Georgia, serif"; ctx.fillStyle = "#b7bcc3";
        o.text.split("\n").forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.45 + 50 + i * 28));
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = "left";
      // Lineas de cinta
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      for (let y = (t * 40) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    },
  }];
};

