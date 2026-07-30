// El jugador: Alex. Física de plataformas robusta, correr, agacharse, saltar,
// linterna con batería. Arte mejorado con animación de caminado.
class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 80;
    this.y = 440;
    this.w = 34;
    this.h = 58;
    this.standH = 58;
    this.crouchH = 40;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = 1;
    this.crouching = false;
    this.stamina = 100;
    this.running = false;
    this.hidden = false;
    this.flashlight = false;
    this.battery = 100;       // batería de la linterna (0..100)
    this.noise = 0;
    this.walkCycle = 0;
    this.rocks = 3;
    this.blinkTimer = 0;
    this.corruption = 0;   // 0..1, lo fija el juego según la estática
    this.glitchTimer = 0;  // duración restante de un error de movimiento
    this.glitchKind = 0;   // 0=control invertido, 1=tropiezo, 2=temblor
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt) {
    const WALK = 130;
    const RUN = 240;
    const GRAVITY = 900;
    const JUMP = 360;

    // --- Agacharse: cambia altura anclando los pies (evita colarse/flotar) ---
    const wantCrouch = Input.isDown("down") || Input.isDown("crouch");
    const targetH = wantCrouch ? this.crouchH : this.standH;
    if (targetH !== this.h) {
      const feet = this.y + this.h;
      this.h = targetH;
      this.y = feet - this.h; // los pies quedan en el mismo lugar
    }
    this.crouching = wantCrouch;

    // --- Movimiento horizontal ---
    const wantsRun = Input.isDown("run") && !this.crouching && this.stamina > 0;
    this.running = false;
    let speed = this.crouching ? WALK * 0.5 : WALK;
    if (wantsRun && (Input.isDown("left") || Input.isDown("right"))) {
      speed = RUN;
      this.running = true;
    }

    let moving = false;
    if (Input.isDown("left")) { this.vx = -speed; this.facing = -1; moving = true; }
    else if (Input.isDown("right")) { this.vx = speed; this.facing = 1; moving = true; }
    else this.vx = 0;

    // --- Stamina ---
    if (this.running && moving) this.stamina = Math.max(0, this.stamina - 45 * dt);
    else this.stamina = Math.min(100, this.stamina + 25 * dt);

    // --- Errores de movimiento por estática alta (corrupción) ---
    if (this.glitchTimer > 0) {
      this.glitchTimer -= dt;
      if (this.glitchKind === 0) this.vx = -this.vx;            // control invertido
      else if (this.glitchKind === 1) this.vx = 0;              // tropiezo / congelado
      else this.vx += (Math.random() - 0.5) * 180;             // temblor errático
    } else if (this.corruption > 0.35 && Math.random() < this.corruption * 0.05) {
      this.glitchTimer = 0.18 + Math.random() * 0.22;
      this.glitchKind = Math.floor(Math.random() * 3);
    }

    // --- Salto ---
    if (Input.wasPressed("jump") && this.onGround && !this.crouching) {
      this.vy = -JUMP;
      this.onGround = false;
    }

    // --- Linterna (toggle solo si hay batería) ---
    if (Input.wasPressed("flashlight") && (this.battery > 0 || this.flashlight)) {
      this.flashlight = !this.flashlight;
    }
    if (this.flashlight) {
      this.battery = Math.max(0, this.battery - 8 * Difficulty.get().batteryDrain * dt);
      if (this.battery <= 0) this.flashlight = false;
    }

    // --- Física vertical con colisión robusta (sin tunneling) ---
    this.vy += GRAVITY * dt;
    if (this.vy > 700) this.vy = 700;

    this.x += this.vx * dt;
    if (this.x < 0) this.x = 0;
    if (this.x + this.w > Level.width) this.x = Level.width - this.w;

    const prevFeet = this.y + this.h;
    this.y += this.vy * dt;
    let feet = this.y + this.h;

    this.onGround = false;
    for (const p of Level.platforms) {
      const withinX = this.x + this.w > p.x + 4 && this.x < p.x + p.w - 4;
      if (withinX && this.vy >= 0 && prevFeet <= p.y + 6 && feet >= p.y) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.onGround = true;
        break;
      }
    }

    // --- Red de seguridad: si por algo cae fuera del mundo, lo devolvemos al suelo ---
    if (this.y + this.h > Level.height + 40) {
      this.y = Level.groundY - this.h;
      this.vy = 0;
      this.onGround = true;
    }

    // --- Escondite ---
    this.hidden = false;
    if (this.crouching) {
      for (const b of Level.bushes) {
        if (this.cx > b.x && this.cx < b.x + b.w) { this.hidden = true; break; }
      }
    }

    // --- Ruido ---
    this.noise = 0;
    if (moving && this.running) this.noise = 1.0;
    else if (moving && !this.crouching) this.noise = 0.4;
    else if (moving && this.crouching) this.noise = 0.1;
    if (this.flashlight) this.noise = Math.max(this.noise, 0.5);
    if (this.hidden) this.noise *= 0.3;

    // --- Animación ---
    if (moving && this.onGround) this.walkCycle += dt * (this.running ? 16 : 9);
    else this.walkCycle = 0;
    this.blinkTimer += dt;
  }

  throwRock() {
    if (this.rocks <= 0) return null;
    this.rocks--;
    return true;
  }

  addBattery(amt) { this.battery = Math.min(100, this.battery + amt); }

  draw(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const w = this.w;
    const h = this.h;
    const f = this.facing;
    const swing = Math.sin(this.walkCycle) * 5;
    const crouch = this.crouching;

    ctx.save();
    if (this.hidden) ctx.globalAlpha = 0.4;

    // Sombra en el suelo
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 2, w * 0.55, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Piernas (jeans) con balanceo
    ctx.fillStyle = "#274574";
    ctx.fillRect(x + 7, y + h - 20, 8, 20);
    ctx.fillRect(x + w - 15, y + h - 20, 8, 20);
    ctx.fillStyle = "#2e5088";
    ctx.fillRect(x + 7 + swing * 0.5, y + h - 11, 8, 11);
    ctx.fillRect(x + w - 15 - swing * 0.5, y + h - 11, 8, 11);
    // Zapatillas rojas
    ctx.fillStyle = "#c23a3a";
    ctx.fillRect(x + 4 + swing * 0.5, y + h - 4, 13, 4);
    ctx.fillRect(x + w - 17 - swing * 0.5, y + h - 4, 13, 4);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(x + 5 + swing * 0.5, y + h - 4, 4, 2);

    // Torso hoodie verde
    const torsoTop = y + 15;
    const torsoH = (h - 34);
    ctx.fillStyle = "#2f7d43";
    ctx.fillRect(x + 3, torsoTop, w - 6, torsoH);
    // Sombra/bolsillo central
    ctx.fillStyle = "#256b38";
    ctx.fillRect(x + 9, torsoTop + 6, w - 18, torsoH - 8);
    // Cordones del hoodie
    ctx.fillStyle = "#d8d8d0";
    ctx.fillRect(x + w / 2 - 4, torsoTop + 1, 2, 8);
    ctx.fillRect(x + w / 2 + 2, torsoTop + 1, 2, 8);

    // Brazos con balanceo (más marcado al correr)
    ctx.fillStyle = "#2f7d43";
    const armSwing = this.running ? swing * 1.4 : swing * 0.7;
    ctx.fillRect(x - 1, torsoTop + 1 + armSwing, 6, torsoH - 4);
    ctx.fillRect(x + w - 5, torsoTop + 1 - armSwing, 6, torsoH - 4);
    // Manos
    ctx.fillStyle = "#e6b58f";
    ctx.fillRect(x - 1, torsoTop + torsoH - 5 + armSwing, 6, 5);
    ctx.fillRect(x + w - 5, torsoTop + torsoH - 5 - armSwing, 6, 5);

    // Cabeza
    const headY = y + (crouch ? 1 : 0);
    ctx.fillStyle = "#e6b58f";
    ctx.fillRect(x + 9, headY, w - 18, 15);
    // Oreja
    ctx.fillStyle = "#d8a882";
    ctx.fillRect(f === 1 ? x + 8 : x + w - 10, headY + 6, 2, 4);
    // Pelo castaño
    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(x + 7, headY - 3, w - 14, 8);
    ctx.fillRect(x + (f === 1 ? 6 : w - 11), headY + 1, 5, 6);
    ctx.fillStyle = "#4a2f1b";
    ctx.fillRect(x + 9, headY - 2, w - 18, 3);
    // Ceja preocupada + ojo (parpadeo)
    const blink = (this.blinkTimer % 4) > 3.9;
    ctx.fillStyle = "#1a1a1a";
    const eyeX = f === 1 ? x + w - 15 : x + 11;
    if (!blink) ctx.fillRect(eyeX, headY + 6, 3, 4);
    ctx.fillRect(eyeX - (f === 1 ? 1 : -1), headY + 4, 5, 1);

    ctx.restore();
  }
}
