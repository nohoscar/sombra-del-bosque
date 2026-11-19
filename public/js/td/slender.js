// El Esbelto cenital: patrulla por puntos, cono de visión 2D con línea de vista,
// persecución con deslizamiento en paredes. No te atrapa si estás escondido.
class TDSlender {
  constructor(cfg) { this.cfg = cfg || {}; this.reset(); }

  reset() {
    const c = this.cfg;
    const d = (typeof Difficulty !== "undefined") ? Difficulty.get() : { slenderSpeed: 1, view: 1, hideLose: 1 };
    // Empieza lejos del inicio (hacia el centro/derecha del mapa)
    const spawn = this._nearestFloor(
      Math.floor((c.x ?? TDLevel.worldW * 0.6) / TDLevel.TILE),
      Math.floor((c.y ?? TDLevel.worldH * 0.5) / TDLevel.TILE)
    );
    this.x = spawn.x; this.y = spawn.y;
    this.r = 14;
    this.fx = -1; this.fy = 0;
    this.speed = (c.speed ?? 104) * d.slenderSpeed;
    this.viewDist = (c.viewDist ?? 320) * d.view;
    this.halfAngle = 0.6;                 // ~34° a cada lado
    this.hideLose = d.hideLose;
    this.persistence = c.persistence ?? 0.7;
    this.state = "patrol";
    this.detection = 0;
    this.caught = false;
    this.flicker = 0;
    this.stuck = 0;
    this.lunge = 0;   // embestida (más veloz) cuando lo provocas
    this.stun = 0;    // la linterna lo frena un instante
    this.stunCd = 0;  // espera antes de poder frenarlo otra vez
    this.lastX = null; this.lastY = null;  // donde te vio por ultima vez

    // Puntos de patrulla: tiles de piso repartidos
    this.waypoints = this._genWaypoints(6);
    this.wp = 0;

    // Navegación por caminos
    this._path = [];
    this.pathT = 0;
    this._goalKey = "";
  }

  // Busca el tile de piso más cercano (spiral) para no aparecer dentro de una pared
  _nearestFloor(c0, r0) {
    for (let rad = 0; rad < Math.max(TDLevel.cols, TDLevel.rows); rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const c = c0 + dc, r = r0 + dr;
          if (c > 0 && r > 0 && c < TDLevel.cols - 1 && r < TDLevel.rows - 1 && TDLevel.grid[r][c] === 0) {
            return TDLevel.center(c, r);
          }
        }
      }
    }
    return TDLevel.center(c0, r0);
  }

  _genWaypoints(n) {
    const pts = [];
    let guard = 0;
    while (pts.length < n && guard++ < 400) {
      const c = 2 + Math.floor(Math.random() * (TDLevel.cols - 4));
      const r = 2 + Math.floor(Math.random() * (TDLevel.rows - 4));
      if (TDLevel.grid[r][c] === 0 && !(c < 6 && r < 6)) pts.push(TDLevel.center(c, r));
    }
    if (!pts.length) pts.push({ x: this.x, y: this.y });
    return pts;
  }

  canSee(p) {
    if (p.hidden) return false;
    const dx = p.x - this.x, dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.viewDist) return false;
    const ang = Math.abs(this._angleBetween(this.fx, this.fy, dx / dist, dy / dist));
    if (ang > this.halfAngle) return false;
    return TDLevel.lineOfSight(this.x, this.y, p.x, p.y);
  }

  _angleBetween(ax, ay, bx, by) {
    const dot = ax * bx + ay * by;
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  _moveToward(tx, ty, speed, dt) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const vx = dx / d * speed * dt, vy = dy / d * speed * dt;
    let moved = false;
    if (!TDLevel.circleHitsWall(this.x + vx, this.y, this.r)) { this.x += vx; moved = true; }
    if (!TDLevel.circleHitsWall(this.x, this.y + vy, this.r)) { this.y += vy; moved = true; }
    // orienta hacia el movimiento
    this.fx = dx / d; this.fy = dy / d;
    return moved;
  }

  // Navega hacia (gx,gy) rodeando obstáculos (recalcula la ruta cada tanto)
  _navigate(gx, gy, speed, dt, recomputeEvery) {
    const my = TDLevel.tileAtPx(this.x, this.y);
    const gt = TDLevel.tileAtPx(gx, gy);
    const gk = gt.c + "," + gt.r;
    this.pathT -= dt;
    if (this.pathT <= 0 || this._goalKey !== gk || !this._path.length) {
      this._path = TDLevel.findPath(my.c, my.r, gt.c, gt.r) || [];
      this._goalKey = gk;
      this.pathT = recomputeEvery;
    }
    if (this._path.length) {
      const n = this._path[0];
      const moved = this._moveToward(n.x, n.y, speed, dt);
      if (Math.hypot(n.x - this.x, n.y - this.y) < 16) this._path.shift();
      return moved;
    }
    return this._moveToward(gx, gy, speed, dt); // fallback directo (cerca)
  }

  // Te enfurece (por ejemplo, si te ve encender un foco): carga hacia ti
  enrage() {
    this.state = "chase";
    this.detection = 100;
    this.lunge = Math.max(this.lunge, 1.1);
    this.pathT = 0;
  }

  // La linterna lo alcanza: se congela un instante. Devuelve true si lo freno.
  onLit() {
    if (this.stunCd > 0 || this.stun > 0) return false;
    this.stun = 1.3; this.stunCd = 4.5;
    // Si no te perseguia, ahora sabe que estas ahi
    if (this.state !== "chase") { this.detection = Math.max(this.detection, 70); this.state = "suspicious"; }
    return true;
  }

  // Atraído por el ruido de encender un foco: se acerca al punto
  lureTo(x, y, dt) {
    if (this.state === "chase" || this.stun > 0) return;
    this._moveToward(x, y, this.speed * 1.15, dt);
    this.detection = Math.min(100, this.detection + 45 * dt);
    if (this.detection > 45) this.state = "suspicious";
  }

  update(dt, p) {
    this.flicker += dt;
    if (this.lunge > 0) this.lunge -= dt;
    if (this.stunCd > 0) this.stunCd -= dt;
    if (this.stun > 0) { this.stun -= dt; return; }   // congelado por la luz
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    const sees = this.canSee(p);
    const hears = dist < 240 * p.noise && !p.hidden && TDLevel.lineOfSight(this.x, this.y, p.x, p.y);
    if (sees || (this.state === "chase" && !p.hidden)) { this.lastX = p.x; this.lastY = p.y; }

    if (this.state === "chase") {
      if (p.hidden) {
        // Va a donde te vio por ultima vez y revisa. Si te escondiste ahi mismo, te encuentra.
        this.detection -= (35 * this.hideLose / this.persistence) * dt;
        const gx = this.lastX ?? p.x, gy = this.lastY ?? p.y;
        this._navigate(gx, gy, this.speed * 1.2, dt, 0.35);
        if (dist < 34 && this.detection > 40) this.caught = true;
        if (this.detection <= 25) { this.state = "patrol"; this.wp = this._nearestWaypoint(); this.pathT = 0; }
      } else {
        this.detection = 100;
        // Persecución: más lento que correr (podés escapar), embiste si lo provocaste
        const chaseSpeed = this.speed * (this.lunge > 0 ? 1.9 : 1.3);
        this._navigate(p.x, p.y, chaseSpeed, dt, 0.25);
        if (dist < 20) this.caught = true;
      }
    } else {
      // Patrulla / sospecha: navega por el mapa rodeando árboles
      if (this.state === "suspicious") {
        this._navigate(p.x, p.y, this.speed * 0.85, dt, 0.4);
      } else {
        const t = this.waypoints[this.wp];
        const moved = this._navigate(t.x, t.y, this.speed * 0.85, dt, 0.5);
        const near = Math.hypot(t.x - this.x, t.y - this.y) < 34;
        if (near) { this.wp = (this.wp + 1) % this.waypoints.length; this.pathT = 0; this.stuck = 0; }
        else if (!moved) { this.stuck += dt; if (this.stuck > 0.9) { this.wp = (this.wp + 1) % this.waypoints.length; this.pathT = 0; this.stuck = 0; } }
        else this.stuck = 0;
      }

      if (sees) this.detection += 62 * dt;
      else if (hears) this.detection += 26 * dt;
      else this.detection -= 34 * dt;

      if (this.detection >= 100) { this.state = "chase"; this.pathT = 0; }
      else if (this.detection > 45) this.state = "suspicious";
      else if (this.detection <= 20) this.state = "patrol";
    }
    this.detection = Math.max(0, Math.min(100, this.detection));
  }

  // Ahuyentado por una zona de luz: huye del foco y no puede atrapar
  fleeFrom(gx, gy, dt) {
    const dx = this.x - gx, dy = this.y - gy;
    const d = Math.hypot(dx, dy) || 1;
    this._moveToward(this.x + dx / d * 120, this.y + dy / d * 120, this.speed * 1.7, dt);
    this.detection = Math.max(0, this.detection - 80 * dt);
    if (this.detection < 25 && this.state === "chase") { this.state = "patrol"; this.wp = this._nearestWaypoint(); }
    this.caught = false;
  }

  _nearestWaypoint() {
    let best = 0, bd = Infinity;
    this.waypoints.forEach((w, i) => {
      const d = Math.hypot(w.x - this.x, w.y - this.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // Cono de visión, plano sobre el piso (se dibuja antes que los sprites)
  drawCone(ctx) {
    if (this.state === "chase") return;
    const x = this.x, y = this.y;
    const base = Math.atan2(this.fy, this.fx);
    ctx.fillStyle = this.state === "suspicious" ? "rgba(200,60,60,0.10)" : "rgba(180,180,200,0.07)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, this.viewDist, base - this.halfAngle, base + this.halfAngle);
    ctx.closePath();
    ctx.fill();
  }

  // Cuerpo en perspectiva 3/4: figura muy alta (el doble que Alex), quieta, brazos hasta las rodillas.
  // vis (0..1) lo pone el juego: en lo oscuro casi no se ve.
  draw(ctx) {
    const vis = this.vis ?? 1;
    if (vis < 0.02) return;
    const x = Math.round(this.x + (this.stun > 0 ? (Math.random() - 0.5) * 7 : 0)), y = Math.round(this.y);
    const close = (this.closeness ?? 0);
    // La cabeza se ladea cuando te ve
    const tilt = (this.state === "chase" || this.state === "suspicious") ? 0.32 : 0.05;
    ctx.save();
    ctx.globalAlpha *= vis;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.ellipse(x, y + 16, 16, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Tentaculos solo cuando esta muy cerca: delgados, lentos
    if (this.state === "chase" && close > 0.55) {
      ctx.strokeStyle = "rgba(8,8,10,0.85)"; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.7 + Math.sin(this.flicker * 1.3 + i) * 0.25;
        const len = 40 + Math.sin(this.flicker * 2 + i * 1.7) * 14;
        ctx.beginPath(); ctx.moveTo(x, y - 54);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.6 + 10, y - 54 + Math.sin(a) * len * 0.4, x + Math.cos(a) * len, y - 54 + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }

    // Piernas largas
    ctx.fillStyle = "#0b0b0e";
    ctx.fillRect(x - 6, y - 26, 5, 42);
    ctx.fillRect(x + 1, y - 26, 5, 42);
    // Torso estrecho (traje), camisa y corbata
    ctx.fillStyle = "#131319";
    ctx.beginPath(); ctx.moveTo(x - 9, y - 72); ctx.lineTo(x + 9, y - 72); ctx.lineTo(x + 7, y - 24); ctx.lineTo(x - 7, y - 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8d8dc"; ctx.fillRect(x - 2, y - 70, 4, 36);
    ctx.fillStyle = "#6e1414"; ctx.fillRect(x - 1, y - 68, 2, 20);
    // Brazos que llegan a las rodillas, con dedos largos
    ctx.fillStyle = "#131319";
    ctx.fillRect(x - 12, y - 70, 3, 56);
    ctx.fillRect(x + 9, y - 70, 3, 56);
    ctx.fillStyle = "#cfd0d4";
    ctx.fillRect(x - 12, y - 14, 3, 9); ctx.fillRect(x + 9, y - 14, 3, 9);
    ctx.fillRect(x - 13, y - 6, 1, 5); ctx.fillRect(x + 12, y - 6, 1, 5);

    // Cabeza: alargada, sin rostro, ladeada
    ctx.save();
    ctx.translate(x, y - 80); ctx.rotate(tilt);
    ctx.fillStyle = "#e9eaed";
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Sombras donde irian los ojos: casi nada, solo para que se sienta que mira
    ctx.fillStyle = "rgba(90,90,100,0.28)";
    ctx.beginPath(); ctx.ellipse(-2.5, -1, 2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2.5, -1, 2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // Aparece mas cerca cuando no lo miras (no camina: "salta" en la oscuridad).
  // looking: true si el jugador lo esta viendo. Devuelve "near" | "behind" | null.
  blink(p, looking, dt) {
    this.blinkCd = (this.blinkCd ?? 3) - dt;
    if (this.blinkCd > 0 || looking || this.stun > 0 || p.hidden) return null;
    if (this.state !== "chase" && this.state !== "suspicious") return null;
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    if (dist < 170) return null;
    const fa = Math.atan2(p.fy, p.fx);
    // A veces, justo detras de ti
    const tries = Math.random() < 0.3 ? [["behind", fa + Math.PI, 150, 190]] : [];
    tries.push(["near", Math.atan2(this.y - p.y, this.x - p.x), Math.max(170, dist * 0.55), Math.max(190, dist * 0.7)]);
    for (const [kind, ang, d0, d1] of tries) {
      for (let k = 0; k < 10; k++) {
        const a = ang + (Math.random() - 0.5) * 0.9, d = d0 + Math.random() * (d1 - d0);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (TDLevel.circleHitsWall(x, y, this.r)) continue;
        // Nunca aparece frente a tu linterna
        const dx = x - p.x, dy = y - p.y;
        if ((p.fx * dx + p.fy * dy) / (Math.hypot(dx, dy) || 1) > 0.5 && kind === "near") continue;
        this.x = x; this.y = y; this._path = []; this.pathT = 0;
        this.blinkCd = this.state === "chase" ? 4 + Math.random() * 3 : 7 + Math.random() * 5;
        return kind;
      }
    }
    this.blinkCd = 1.5;
    return null;
  }
}
