// Jugador cenital: movimiento 8 direcciones con colisión, linterna, esconderse.
class TDPlayer {
  constructor() { this.reset(); }

  reset() {
    this.x = TDLevel.start.x;
    this.y = TDLevel.start.y;
    this.r = 13;
    this.fx = 1; this.fy = 0;     // dirección a la que mira
    this.stamina = 100;
    this.running = false;
    this.hidden = false;
    this.flashlight = false;
    this.battery = 100;
    this.noise = 0;
    this.rocks = 3;
    this.corruption = 0;
    this.glitchTimer = 0;
    this.glitchKind = 0;
    this.walkPhase = 0;
    this.moving = false;
  }

  update(dt) {
    const WALK = 135, RUN = 235;
    let ix = 0, iy = 0;
    if (Input.isDown("left")) ix -= 1;
    if (Input.isDown("right")) ix += 1;
    if (Input.isDown("up")) iy -= 1;
    if (Input.isDown("down")) iy += 1;

    const wantsRun = Input.isDown("run") && this.stamina > 0 && (ix || iy);
    this.running = !!wantsRun;
    let speed = wantsRun ? RUN : WALK;

    // Errores de movimiento por estática alta
    if (this.glitchTimer > 0) {
      this.glitchTimer -= dt;
      if (this.glitchKind === 0) { ix = -ix; iy = -iy; }      // control invertido
      else if (this.glitchKind === 1) { ix = 0; iy = 0; }     // tropiezo
      else { ix += (Math.random() - 0.5) * 1.5; iy += (Math.random() - 0.5) * 1.5; }
    } else if (this.corruption > 0.35 && Math.random() < this.corruption * 0.05) {
      this.glitchTimer = 0.18 + Math.random() * 0.22;
      this.glitchKind = Math.floor(Math.random() * 3);
    }

    // Normaliza diagonal
    const mag = Math.hypot(ix, iy);
    this.moving = mag > 0.01;
    if (this.moving) {
      ix /= mag; iy /= mag;
      this.fx = ix; this.fy = iy;
    }

    // Stamina
    if (this.running && this.moving) this.stamina = Math.max(0, this.stamina - 42 * dt);
    else this.stamina = Math.min(100, this.stamina + 24 * dt);

    // Linterna
    if (Input.wasPressed("flashlight") && (this.battery > 0 || this.flashlight)) this.flashlight = !this.flashlight;
    if (this.flashlight) {
      const drain = (typeof Difficulty !== "undefined") ? Difficulty.get().batteryDrain : 1;
      this.battery = Math.max(0, this.battery - 8 * drain * dt);
      if (this.battery <= 0) this.flashlight = false;
    }

    // Movimiento con colisión (por ejes, para poder "deslizar" en paredes)
    const nx = this.x + ix * speed * dt;
    if (!TDLevel.circleHitsWall(nx, this.y, this.r)) this.x = nx;
    const ny = this.y + iy * speed * dt;
    if (!TDLevel.circleHitsWall(this.x, ny, this.r)) this.y = ny;

    // Escondite: sobre un arbusto
    this.hidden = TDLevel.isBushPx(this.x, this.y);

    // Ruido
    this.noise = 0;
    if (this.moving && this.running) this.noise = 1.0;
    else if (this.moving) this.noise = 0.4;
    if (this.flashlight) this.noise = Math.max(this.noise, 0.5);
    if (this.hidden) this.noise *= 0.3;

    // Animación de caminado
    if (this.moving) this.walkPhase += dt * (this.running ? 16 : 10);
  }

  addBattery(a) { this.battery = Math.min(100, this.battery + a); }

  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.save();
    if (this.hidden) ctx.globalAlpha = 0.4;

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, y + 10, this.r, this.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();

    // Cuerpo (hoodie verde), visto desde arriba
    const bob = Math.sin(this.walkPhase) * 1.5;
    ctx.fillStyle = "#2f7d43";
    ctx.beginPath(); ctx.arc(x, y + bob, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#256b38";
    ctx.beginPath(); ctx.arc(x, y + bob, this.r * 0.7, 0, Math.PI * 2); ctx.fill();

    // Cabeza (pelo castaño) hacia donde mira
    const hx = x + this.fx * 4, hy = y + this.fy * 4 + bob;
    ctx.fillStyle = "#5a3a22";
    ctx.beginPath(); ctx.arc(hx, hy, this.r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e6b58f";
    ctx.beginPath(); ctx.arc(hx + this.fx * 2, hy + this.fy * 2, this.r * 0.3, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }
}
