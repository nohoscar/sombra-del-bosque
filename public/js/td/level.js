// Prototipo cenital: nivel basado en grilla de tiles.
// Bosque 2D con obstáculos (árboles/rocas), arbustos para esconderse,
// notas, generador y salida. Caminos hacia objetivos garantizados.
const TDLevel = {
  TILE: 52,
  cols: 48,
  rows: 30,
  grid: [],          // 0 = piso, 1 = pared
  bushes: new Set(), // "r,c" tiles donde esconderse
  notes: [],
  generators: [],
  batteries: [],
  exit: null,
  start: { x: 0, y: 0 },

  get worldW() { return this.cols * this.TILE; },
  get worldH() { return this.rows * this.TILE; },

  _rng: 1,
  _rand() { this._rng = (this._rng * 9301 + 49297) % 233280; return this._rng / 233280; },

  center(c, r) { return { x: c * this.TILE + this.TILE / 2, y: r * this.TILE + this.TILE / 2 }; },
  tileAtPx(x, y) { return { c: Math.floor(x / this.TILE), r: Math.floor(y / this.TILE) }; },

  isWallTile(c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.grid[r][c] === 1;
  },
  isWallPx(x, y) {
    const c = Math.floor(x / this.TILE), r = Math.floor(y / this.TILE);
    return this.isWallTile(c, r);
  },

  // Colisión círculo (centro x,y, radio rad) contra tiles de pared
  circleHitsWall(x, y, rad) {
    const minC = Math.floor((x - rad) / this.TILE), maxC = Math.floor((x + rad) / this.TILE);
    const minR = Math.floor((y - rad) / this.TILE), maxR = Math.floor((y + rad) / this.TILE);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (!this.isWallTile(c, r)) continue;
        // AABB del tile
        const tx = c * this.TILE, ty = r * this.TILE;
        const nx = Math.max(tx, Math.min(x, tx + this.TILE));
        const ny = Math.max(ty, Math.min(y, ty + this.TILE));
        const dx = x - nx, dy = y - ny;
        if (dx * dx + dy * dy < rad * rad) return true;
      }
    }
    return false;
  },

  // Línea de visión: recorre en pasos y falla si cruza una pared
  lineOfSight(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / (this.TILE * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isWallPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  },

  _clearRadius(c, r, rad) {
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        const nc = c + dc, nr = r + dr;
        if (nc > 0 && nr > 0 && nc < this.cols - 1 && nr < this.rows - 1) this.grid[nr][nc] = 0;
      }
  },

  // Carva un corredor de 1 tile entre dos tiles (garantiza acceso)
  _carve(c0, r0, c1, r1) {
    let c = c0, r = r0;
    let guard = 0;
    while ((c !== c1 || r !== r1) && guard++ < 500) {
      if (c !== c1) c += Math.sign(c1 - c);
      else if (r !== r1) r += Math.sign(r1 - r);
      if (c > 0 && r > 0 && c < this.cols - 1 && r < this.rows - 1) this.grid[r][c] = 0;
    }
  },

  generate(seed) {
    this._rng = (seed + 1) * 7919 + 3;
    const C = this.cols, R = this.rows;

    // Piso + borde de pared
    this.grid = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < C; c++) row.push(r === 0 || c === 0 || r === R - 1 || c === C - 1 ? 1 : 0);
      this.grid.push(row);
    }

    // Inicio (arriba-izq) y salida (abajo-der)
    this.start = this.center(3, 3);
    const exitC = C - 4, exitR = R - 4;
    this.exit = { ...this.center(exitC, exitR), tile: { c: exitC, r: exitR } };

    // Clústers de árboles/rocas (dispersos)
    const clusters = Math.floor(C * R * 0.05);
    for (let i = 0; i < clusters; i++) {
      const cc = 2 + Math.floor(this._rand() * (C - 4));
      const cr = 2 + Math.floor(this._rand() * (R - 4));
      // no bloquear el inicio
      if (Math.abs(cc - 3) < 4 && Math.abs(cr - 3) < 4) continue;
      const size = 1 + Math.floor(this._rand() * 3);
      for (let dr = 0; dr < size; dr++)
        for (let dc = 0; dc < size; dc++) {
          const nc = cc + dc, nr = cr + dr;
          if (nc > 0 && nr > 0 && nc < C - 1 && nr < R - 1) this.grid[nr][nc] = 1;
        }
    }

    // Objetos: notas (3), generador (1), baterías (2)
    const spots = [
      { c: Math.floor(C * 0.5), r: 3 },
      { c: C - 5, r: Math.floor(R * 0.4) },
      { c: 4, r: R - 5 },
    ];
    this.notes = spots.map((s, i) => {
      this._clearRadius(s.c, s.r, 1);
      return { ...this.center(s.c, s.r), tile: s, collected: false, kind: TD_NOTES[i].kind, title: TD_NOTES[i].title, text: TD_NOTES[i].text };
    });

    const genSpots = [
      { c: Math.floor(C * 0.28), r: Math.floor(R * 0.55) },
      { c: Math.floor(C * 0.52), r: Math.floor(R * 0.32) },
      { c: Math.floor(C * 0.72), r: Math.floor(R * 0.62) },
    ];
    this.generators = genSpots.map((s) => {
      this._clearRadius(s.c, s.r, 1);
      return { ...this.center(s.c, s.r), tile: s, active: false, timer: 0, radius: 185 };
    });

    this._clearRadius(exitC, exitR, 1);

    this.batteries = [
      { c: Math.floor(C * 0.3), r: Math.floor(R * 0.7) },
      { c: Math.floor(C * 0.7), r: Math.floor(R * 0.25) },
    ].map((b) => { this._clearRadius(b.c, b.r, 0); return { ...this.center(b.c, b.r), taken: false }; });

    // Garantiza acceso: corredores desde el inicio a cada objetivo
    const startTile = { c: 3, r: 3 };
    this.notes.forEach((n) => this._carve(startTile.c, startTile.r, n.tile.c, n.tile.r));
    this.generators.forEach((g) => this._carve(startTile.c, startTile.r, g.tile.c, g.tile.r));
    this._carve(startTile.c, startTile.r, exitC, exitR);

    // Arbustos (escondites) en piso libre
    this.bushes = new Set();
    let placed = 0;
    let tries = 0;
    while (placed < 34 && tries++ < 800) {
      const c = 2 + Math.floor(this._rand() * (C - 4));
      const r = 2 + Math.floor(this._rand() * (R - 4));
      if (this.grid[r][c] !== 0) continue;
      if (Math.abs(c - 3) < 3 && Math.abs(r - 3) < 3) continue;
      this.bushes.add(r + "," + c);
      placed++;
    }
  },

  isBushPx(x, y) {
    const c = Math.floor(x / this.TILE), r = Math.floor(y / this.TILE);
    return this.bushes.has(r + "," + c);
  },

  canExit() {
    // La salida ahora solo depende de reunir las notas.
    const pagesLeft = this.notes.filter((n) => !n.collected).length;
    return { ok: pagesLeft === 0, pagesLeft };
  },
};

// Notas de la Noche 1 (reusa el tono de la version lateral)
const TD_NOTES = [
  { kind: "aviso", title: "AVISO DEL PARQUE (tachado)",
    text: "PROHIBIDO EL PASO PASADO EL ANOCHECER.\n\n[grabado con navaja]: 'no sirve. el no usa el sendero.'" },
  { kind: "policial", title: "REPORTE 041-A / Willow Creek",
    text: "Menor: T., 9 anos. Visto por ultima vez en el km 3.\nHallado: una gorra, colgada a 2 metros.\nHuella acompanante: descalza, 47 cm. [sic]" },
  { kind: "diario", title: "ALEX",
    text: "Las huellas de Tommy van junto a otras, mas grandes.\nPasos de tres metros. Ningun hombre camina asi.\nCada tanto, dejan de tocar el suelo." },
];
