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
      if (this.t >= IN) { this.phase = "hold"; this.t = 0; }
    } else if (this.phase === "hold") {
      this.fade = 0;
      const scene = this.scenes[this.index];
      const maxHold = (scene && scene.hold) ? scene.hold : MAXHOLD;
      const canSkip = this.t > 0.35;
      const pressed = this._advance || Input.wasPressed("jump") || Input.wasPressed("interact");
      if (pressed && canSkip) { this.phase = "out"; this.t = 0; }
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
    caption: "Otro dia agotador en el pueblo de Willow Creek.\nSolo quieres llegar a casa y dormir.",
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
    caption: "Pero al voltear hacia el bosque...\nalgo alto y quieto te devuelve la mirada.",
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
    caption: "En casa, la puerta del cuarto de Tommy esta abierta.\nSu cama, vacia. La ventana, de par en par.",
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
  {
    caption: "No puedes quedarte esperando.\nTomas una linterna y entras al bosque a buscarlo.",
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
  // Antes de la Noche 2
  1: [{
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
  2: [{
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
  3: [{
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
  4: [{
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

// ---------------- Ser atrapado (breve) ----------------
Cinematic.DEATH = [
  {
    caption: "",
    hold: 1.6,
    draw(ctx, t, W, H) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      // rostro pálido acercándose de golpe
      const s = Math.min(1, t / 0.5);
      const r = 40 + s * 260;
      ctx.fillStyle = "#e9e9ec";
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, r * 0.72, r, 0, 0, Math.PI * 2);
      ctx.fill();
      // tentáculos irrumpiendo
      ctx.strokeStyle = "#0a0a0d";
      ctx.lineWidth = 6;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const jitter = Math.sin(t * 30 + i) * 20;
        ctx.beginPath();
        ctx.moveTo(W / 2, H / 2);
        ctx.lineTo(W / 2 + Math.cos(a) * (r + 120 + jitter), H / 2 + Math.sin(a) * (r + 120 + jitter));
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // flash rojo
      if (t < 0.3) {
        ctx.fillStyle = `rgba(150,0,0,${0.6 - t})`;
        ctx.fillRect(0, 0, W, H);
      }
    },
  },
];
