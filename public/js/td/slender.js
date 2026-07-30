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
    this.speed = (c.speed ?? 80) * d.slenderSpeed;
    this.viewDist = (c.viewDist ?? 320) * d.view;
    this.halfAngle = 0.6;                 // ~34° a cada lado
    this.hideLose = d.hideLose;
    this.persistence = c.persistence ?? 0.7;
    this.state = "patrol";
    this.detection = 0;
    this.caught = false;
    this.flicker = 0;
    this.stuck = 0;

    // Puntos de patrulla: tiles de piso repartidos
    this.waypoints = this._genWaypoints(6);
    this.wp = 0;
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

  update(dt, p) {
    this.flicker += dt;
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    const sees = this.canSee(p);
    const hears = dist < 240 * p.noise && !p.hidden && TDLevel.lineOfSight(this.x, this.y, p.x, p.y);

    if (this.state === "chase") {
      if (p.hidden) {
        this.detection -= (65 * this.hideLose / this.persistence) * dt;
        // se acerca al ultimo rastro
        this._moveToward(p.x, p.y, this.speed * 1.5, dt);
        if (this.detection <= 25) { this.state = "patrol"; this.wp = this._nearestWaypoint(); }
      } else {
        this.detection = 100;
        const moved = this._moveToward(p.x, p.y, this.speed * 1.9, dt);
        if (!moved) this.stuck += dt; else this.stuck = 0;
        if (dist < 24) this.caught = true;
      }
    } else {
      // patrol / suspicious: recorre puntos
      const t = this.waypoints[this.wp];
      const reached = !this._moveToward(t.x, t.y, this.speed * (this.state === "suspicious" ? 0.5 : 1), dt);
      const near = Math.hypot(t.x - this.x, t.y - this.y) < 26;
      if (near || reached) {
        this.stuck += dt;
        if (near || this.stuck > 1.2) { this.wp = (this.wp + 1) % this.waypoints.length; this.stuck = 0; }
      } else this.stuck = 0;

      if (sees) this.detection += 62 * dt;
      else if (hears) this.detection += 26 * dt;
      else this.detection -= 34 * dt;

      if (this.detection >= 100) this.state = "chase";
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

  // Cuerpo en perspectiva 3/4: figura alta y delgada, anclada por los pies
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const chasing = this.state === "chase";
    const sway = Math.sin(this.flicker * 1.5) * 1.5;

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(x, y + 16, 15, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Tentáculos al perseguir (irradian desde el cuerpo)
    if (chasing) {
      ctx.strokeStyle = "#0a0a0d";
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + this.flicker;
        const len = 22 + Math.sin(this.flicker * 6 + i) * 12;
        ctx.beginPath(); ctx.moveTo(x, y - 14);
        ctx.lineTo(x + Math.cos(a) * (16 + len), y - 14 + Math.sin(a) * (16 + len));
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }

    // Piernas (pantalón negro)
    ctx.fillStyle = "#0d0d10";
    ctx.fillRect(x - 6, y - 2, 5, 18);
    ctx.fillRect(x + 1, y - 2, 5, 18);

    // Torso alargado (traje) + camisa/corbata
    ctx.fillStyle = "#161620";
    ctx.fillRect(x - 8 + sway, y - 30, 16, 30);
    ctx.fillStyle = "#e8e8ea";
    ctx.fillRect(x - 2 + sway, y - 28, 4, 24);
    ctx.fillStyle = "#a01f1f";
    ctx.fillRect(x - 1 + sway, y - 26, 2, 12);

    // Brazos largos y finos
    ctx.fillStyle = "#161620";
    ctx.fillRect(x - 11 + sway, y - 28, 3, 26);
    ctx.fillRect(x + 8 + sway, y - 28, 3, 26);
    // Manos pálidas
    ctx.fillStyle = "#dcdce0";
    ctx.fillRect(x - 11 + sway, y - 4, 3, 5);
    ctx.fillRect(x + 8 + sway, y - 4, 3, 5);

    // Cabeza blanca sin rostro
    ctx.fillStyle = "#eef0f2";
    ctx.beginPath(); ctx.arc(x + sway, y - 38, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(120,120,130,0.2)";
    ctx.beginPath(); ctx.arc(x + sway, y - 37, 5, 0, Math.PI * 2); ctx.fill();
  }
}
