// Jugador cenital: movimiento 8 direcciones con colisión, linterna, esconderse.
class TDPlayer {
  constructor() { this.reset(); }

  reset() {
    this.x = TDLevel.start.x;
    this.y = TDLevel.start.y;
    this.r = 18;
    this.fx = 1; this.fy = 0;     // dirección a la que mira
    this.side = 1;                // 1 der, -1 izq (para dibujar de pie)
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
    // Joystick táctil (analógico)
    if (Math.abs(Input.moveX) > 0.05 || Math.abs(Input.moveY) > 0.05) {
      ix += Input.moveX; iy += Input.moveY;
    }

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
      if (Math.abs(ix) > 0.15) this.side = ix > 0 ? 1 : -1;
    }

    // Stamina
    if (this.running && this.moving) this.stamina = Math.max(0, this.stamina - 42 * dt);
    else this.stamina = Math.min(100, this.stamina + 24 * dt);

    // Linterna
    if (Input.wasPressed("flashlight") && (this.battery > 0 || this.flashlight)) this.flashlight = !this.flashlight;
    if (this.flashlight) {
      const drain = (typeof Difficulty !== "undefined") ? Difficulty.get().batteryDrain : 1;
      this.battery = Math.max(0, this.battery - 5 * drain * dt);
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

  // Dibujo en perspectiva 3/4: figura de pie, anclada por los pies en (x, y+14)
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const s = this.side;
    const step = Math.sin(this.walkPhase) * 3;

    ctx.save();
    if (this.hidden) ctx.globalAlpha = 0.45;

    // Sombra en el piso
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(x, y + 15, 15, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Piernas (jeans) con paso
    ctx.fillStyle = "#274574";
    ctx.fillRect(x - 7, y + 2, 6, 13 + step);
    ctx.fillRect(x + 1, y + 2, 6, 13 - step);
    // Zapatillas rojas
    ctx.fillStyle = "#c23a3a";
    ctx.fillRect(x - 8, y + 13 + step, 8, 4);
    ctx.fillRect(x + 1, y + 13 - step, 8, 4);

    // Torso (hoodie verde)
    ctx.fillStyle = "#2f7d43";
    ctx.fillRect(x - 9, y - 14, 18, 18);
    ctx.fillStyle = "#256b38";
    ctx.fillRect(x - 6, y - 10, 12, 13);
    // Brazos
    ctx.fillStyle = "#2f7d43";
    ctx.fillRect(x - 12, y - 12, 4, 14);
    ctx.fillRect(x + 8, y - 12, 4, 14);

    // Cabeza
    ctx.fillStyle = "#e6b58f";
    ctx.beginPath(); ctx.arc(x, y - 21, 7, 0, Math.PI * 2); ctx.fill();
    // Pelo castaño (media cabeza)
    ctx.fillStyle = "#5a3a22";
    ctx.beginPath(); ctx.arc(x, y - 22, 7, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 7, y - 23, 14, 3);
    // Ojo/mirada hacia el lado
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x + (s > 0 ? 2 : -4), y - 22, 2, 2);

    ctx.restore();
  }
}
