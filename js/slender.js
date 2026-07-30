// El Esbelto. IA de estados: patrulla -> sospecha -> persigue -> atrapa.
// Se configura por noche (velocidad, alcance de visión, persistencia).
class Slender {
  constructor(config) {
    this.config = config || {};
    this.reset();
  }

  reset() {
    const c = this.config;
    const d = Difficulty.get();
    this.x = c.x ?? 1300;
    this.y = 420;
    this.w = 30;
    this.h = 80;
    this.facing = -1;
    this.speed = (c.speed ?? 70) * d.slenderSpeed;
    this.viewDist = (c.viewDist ?? 300) * d.view;
    this.viewHeight = (c.viewHeight ?? 90) * d.view;
    this.persistence = c.persistence ?? 0.7; // qué tan difícil es que te pierda de vista
    this.hideLose = d.hideLose;               // multiplicador de "perderte" al esconderte
    this.patrolMin = c.patrolMin ?? 1000;
    this.patrolMax = c.patrolMax ?? 2300;
    this.state = "patrol";     // patrol | suspicious | chase
    this.detection = 0;        // 0..100
    this.target = null;        // punto de ruido a investigar
    this.caught = false;
    this.flicker = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  canSee(player) {
    if (player.hidden) return false;
    const dx = player.cx - this.cx;
    const dy = player.cy - this.cy;
    if (Math.sign(dx) !== this.facing) return false;
    if (Math.abs(dx) > this.viewDist) return false;
    if (Math.abs(dy) > this.viewHeight) return false;
    return true;
  }

  update(dt, player) {
    this.flicker += dt;

    const dist = Math.abs(player.cx - this.cx);
    const sees = this.canSee(player);
    const noiseReach = 240 * player.noise;
    const hearsNoise = dist < noiseReach && !player.hidden;

    switch (this.state) {
      case "patrol": {
        this.x += this.facing * this.speed * dt;
        if (this.x < this.patrolMin) { this.x = this.patrolMin; this.facing = 1; }
        if (this.x > this.patrolMax) { this.x = this.patrolMax; this.facing = -1; }

        if (sees) this.detection += 60 * dt;
        else if (hearsNoise) {
          this.detection += 25 * dt;
          this.facing = Math.sign(player.cx - this.cx) || this.facing;
        } else {
          this.detection = Math.max(0, this.detection - 30 * dt);
        }

        if (this.detection >= 100) this._enterChase();
        else if (this.detection > 45) this.state = "suspicious";
        break;
      }

      case "suspicious": {
        this.facing = Math.sign(player.cx - this.cx) || this.facing;
        if (sees) this.detection += 70 * dt;
        else if (hearsNoise) this.detection += 30 * dt;
        else this.detection -= 40 * dt;

        if (this.detection >= 100) this._enterChase();
        else if (this.detection <= 20) this.state = "patrol";
        break;
      }

      case "chase": {
        this.facing = Math.sign(player.cx - this.cx) || this.facing;

        if (player.hidden) {
          // ESCONDIDO: nunca te atrapa. Se acerca al ultimo rastro y lo pierde.
          if (dist > 90) this.x += this.facing * this.speed * 1.2 * dt;
          // Pierde el rastro (más lento con alta persistencia, ajustado por dificultad)
          this.detection -= (65 * this.hideLose / this.persistence) * dt;
          if (this.detection <= 25) {
            this.state = "patrol";
            this.patrolMin = Math.max(200, this.x - 500);
            this.patrolMax = Math.min(Level.width - 200, this.x + 500);
          }
        } else {
          // A LA VISTA: persigue rápido y puede atraparte
          this.x += this.facing * (this.speed * 2.1) * dt;
          this.detection = 100;
          if (dist < 34 && Math.abs(player.cy - this.cy) < 60) this.caught = true;
        }
        break;
      }
    }

    // Investigar ruido (piedra)
    if (this.target && this.state !== "chase") {
      const tdx = this.target.x - this.cx;
      if (Math.abs(tdx) < 20) {
        this.target = null;
      } else {
        this.facing = Math.sign(tdx);
        this.x += this.facing * this.speed * 1.3 * dt;
      }
    }

    this.detection = Math.max(0, Math.min(100, this.detection));
  }

  // Cuánto miedo aporta este enemigo por segundo (el juego toma el máximo)
  getFearRate(player) {
    // Escondido: aporta muy poco miedo (te sentís más seguro)
    if (player.hidden) return 0;
    const dist = Math.abs(player.cx - this.cx);
    let fear = 0;
    if (dist < 420) fear += (1 - dist / 420) * 40;
    if (this.state === "chase") fear += 55;
    else if (this.state === "suspicious") fear += 18;
    return fear;
  }

  hearRock(point) {
    if (this.state === "chase") return;
    if (Math.abs(point.x - this.cx) > 650) return; // demasiado lejos para oírla
    this.target = point;
    this.state = "suspicious";
    this.detection = Math.max(this.detection, 30);
    this.facing = Math.sign(point.x - this.cx) || this.facing;
  }

  _enterChase() {
    this.state = "chase";
    this.detection = 100;
  }

  draw(ctx) {
    const chasing = this.state === "chase";
    const shake = chasing ? Math.sin(this.flicker * 40) * 1.5 : 0;
    const float = Math.sin(this.flicker * 1.5) * 2;
    const x = Math.round(this.x + shake);
    const y = Math.round(this.y + float);
    const w = this.w;
    const h = this.h;

    ctx.save();

    // Cono de visión (solo si no persigue)
    if (!chasing) {
      const color = this.state === "suspicious"
        ? "rgba(200,60,60,0.12)"
        : "rgba(180,180,200,0.07)";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy - 10);
      ctx.lineTo(this.cx + this.facing * this.viewDist, this.cy - this.viewHeight);
      ctx.lineTo(this.cx + this.facing * this.viewDist, this.cy + this.viewHeight);
      ctx.closePath();
      ctx.fill();
    }

    // Aura oscura envolvente
    const aura = ctx.createRadialGradient(x + w / 2, y + h / 2, 6, x + w / 2, y + h / 2, 70);
    aura.addColorStop(0, chasing ? "rgba(20,0,0,0.5)" : "rgba(0,0,0,0.35)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.fillRect(x - 60, y - 20, w + 120, h + 60);

    // Tentáculos (se despliegan y agitan al perseguir)
    const tentCount = chasing ? 4 : 2;
    const reach = chasing ? 46 : 20;
    ctx.strokeStyle = "#0a0a0d";
    ctx.lineWidth = 3;
    for (let i = 0; i < tentCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const baseX = x + w / 2;
      const baseY = y + 26 + i * 6;
      const wave = Math.sin(this.flicker * (chasing ? 6 : 2) + i) * (chasing ? 14 : 6);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(
        baseX + side * reach * 0.6, baseY + wave,
        baseX + side * reach, baseY - 10 + wave
      );
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    // Piernas (pantalón negro)
    ctx.fillStyle = "#0d0d10";
    ctx.fillRect(x + 4, y + h - 30, 8, 30);
    ctx.fillRect(x + w - 12, y + h - 30, 8, 30);

    // Traje (torso alargado con degradado sutil)
    const suit = ctx.createLinearGradient(x, y, x + w, y);
    suit.addColorStop(0, "#0f0f13");
    suit.addColorStop(0.5, "#1a1a1f");
    suit.addColorStop(1, "#0f0f13");
    ctx.fillStyle = suit;
    ctx.fillRect(x + 2, y + 20, w - 4, h - 46);

    // Camisa + corbata roja
    ctx.fillStyle = "#e8e8ea";
    ctx.fillRect(x + w / 2 - 5, y + 22, 10, h - 50);
    ctx.fillStyle = "#a01f1f";
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 3, y + 24);
    ctx.lineTo(x + w / 2 + 3, y + 24);
    ctx.lineTo(x + w / 2, y + 48);
    ctx.closePath();
    ctx.fill();

    // Brazos largos y finos
    ctx.fillStyle = "#141418";
    ctx.fillRect(x - 3, y + 22, 5, h - 40);
    ctx.fillRect(x + w - 2, y + 22, 5, h - 40);
    // Manos pálidas
    ctx.fillStyle = "#dcdce0";
    ctx.fillRect(x - 4, y + h - 22, 6, 9);
    ctx.fillRect(x + w - 2, y + h - 22, 6, 9);

    // Cabeza blanca sin rostro con leve brillo
    ctx.fillStyle = "#eef0f2";
    ctx.fillRect(x + 6, y, w - 12, 22);
    ctx.fillStyle = "#e0e2e6";
    ctx.fillRect(x + 8, y + 2, w - 16, 18);
    // Sombra tenue donde estaría el rostro
    ctx.fillStyle = "rgba(120,120,130,0.25)";
    ctx.fillRect(x + 11, y + 7, w - 22, 9);

    ctx.restore();
  }
}
