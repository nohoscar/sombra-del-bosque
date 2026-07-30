// Vista cenital: gestor de 5 noches. Cada noche tiene su ubicación, tamaño,
// densidad de bosque, generadores, enemigos, notas crípticas y ambiente propios.
const TDLevel = {
  TILE: 52,
  current: 0,
  totalNights: 5,

  // Estado activo
  cols: 48, rows: 30,
  name: "", intro: "",
  grid: [],
  bushes: new Set(),
  notes: [],
  generators: [],
  batteries: [],
  exit: null,
  start: { x: 0, y: 0 },
  slenderConfigs: [],
  ambient: null,

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
  isWallPx(x, y) { return this.isWallTile(Math.floor(x / this.TILE), Math.floor(y / this.TILE)); },

  circleHitsWall(x, y, rad) {
    const minC = Math.floor((x - rad) / this.TILE), maxC = Math.floor((x + rad) / this.TILE);
    const minR = Math.floor((y - rad) / this.TILE), maxR = Math.floor((y + rad) / this.TILE);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (!this.isWallTile(c, r)) continue;
        const tx = c * this.TILE, ty = r * this.TILE;
        const nx = Math.max(tx, Math.min(x, tx + this.TILE));
        const ny = Math.max(ty, Math.min(y, ty + this.TILE));
        const dx = x - nx, dy = y - ny;
        if (dx * dx + dy * dy < rad * rad) return true;
      }
    }
    return false;
  },

  lineOfSight(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / (this.TILE * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isWallPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  },

  isBushPx(x, y) {
    const c = Math.floor(x / this.TILE), r = Math.floor(y / this.TILE);
    return this.bushes.has(r + "," + c);
  },

  // Búsqueda de camino (BFS sobre la grilla). Devuelve lista de centros de tile
  // desde el siguiente paso hasta el destino, o null si no hay ruta.
  findPath(sc, sr, tc, tr) {
    const C = this.cols, R = this.rows;
    if (tc < 0 || tr < 0 || tc >= C || tr >= R || this.grid[tr][tc] === 1) return null;
    if (sc === tc && sr === tr) return [];
    const key = (c, r) => r * C + c;
    const came = new Int32Array(C * R).fill(-1);
    const seen = new Uint8Array(C * R);
    const q = [[sc, sr]];
    seen[key(sc, sr)] = 1;
    let found = false, head = 0, iter = 0;
    while (head < q.length && iter++ < 6000) {
      const [c, r] = q[head++];
      if (c === tc && r === tr) { found = true; break; }
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dc, dr] of nb) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= C || nr >= R) continue;
        if (this.grid[nr][nc] === 1) continue;
        const k = key(nc, nr);
        if (seen[k]) continue;
        seen[k] = 1; came[k] = key(c, r); q.push([nc, nr]);
      }
    }
    if (!found) return null;
    const path = [];
    let k = key(tc, tr);
    const startK = key(sc, sr);
    while (k !== startK && k >= 0) {
      const c = k % C, r = (k - c) / C;
      path.push(this.center(c, r));
      k = came[k];
    }
    path.reverse();
    return path;
  },

  _clearRadius(c, r, rad) {
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        const nc = c + dc, nr = r + dr;
        if (nc > 0 && nr > 0 && nc < this.cols - 1 && nr < this.rows - 1) this.grid[nr][nc] = 0;
      }
  },

  _carve(c0, r0, c1, r1) {
    let c = c0, r = r0, guard = 0;
    while ((c !== c1 || r !== r1) && guard++ < 800) {
      if (c !== c1) c += Math.sign(c1 - c);
      else if (r !== r1) r += Math.sign(r1 - r);
      if (c > 0 && r > 0 && c < this.cols - 1 && r < this.rows - 1) this.grid[r][c] = 0;
    }
  },

  getInfo(i) { const d = this._defs[i]; return { num: i + 1, name: d.name, intro: d.intro }; },

  load(i) {
    this.current = i;
    const d = this._defs[i];
    this.cols = d.cols; this.rows = d.rows;
    this.name = d.name; this.intro = d.intro;
    this.ambient = d.ambient;
    this._rng = (i + 1) * 7919 + 13;
    const C = this.cols, R = this.rows;

    // Piso + borde
    this.grid = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < C; c++) row.push((r === 0 || c === 0 || r === R - 1 || c === C - 1) ? 1 : 0);
      this.grid.push(row);
    }

    this.start = this.center(3, 3);
    const exitC = C - 4, exitR = R - 4;
    this.exit = { ...this.center(exitC, exitR), tile: { c: exitC, r: exitR } };

    // Clústers de árboles/rocas (densidad crece por noche)
    const clusters = Math.floor(C * R * d.density);
    for (let k = 0; k < clusters; k++) {
      const cc = 2 + Math.floor(this._rand() * (C - 4));
      const cr = 2 + Math.floor(this._rand() * (R - 4));
      if (Math.abs(cc - 3) < 4 && Math.abs(cr - 3) < 4) continue;
      const size = 1 + Math.floor(this._rand() * 3);
      for (let dr = 0; dr < size; dr++)
        for (let dc = 0; dc < size; dc++) {
          const nc = cc + dc, nr = cr + dr;
          if (nc > 0 && nr > 0 && nc < C - 1 && nr < R - 1) this.grid[nr][nc] = 1;
        }
    }

    // Notas (5) repartidas
    const noteFr = [[0.5, 0.12], [0.85, 0.42], [0.15, 0.52], [0.72, 0.78], [0.32, 0.9]];
    this.notes = d.notes.map((note, k) => {
      const f = noteFr[k % noteFr.length];
      const c = Math.max(2, Math.min(C - 3, Math.round(C * f[0])));
      const r = Math.max(2, Math.min(R - 3, Math.round(R * f[1])));
      this._clearRadius(c, r, 1);
      return { ...this.center(c, r), tile: { c, r }, collected: false, kind: note.kind, title: note.title, text: note.text };
    });

    // Generadores
    const genFr = [[0.28, 0.55], [0.52, 0.30], [0.72, 0.62], [0.4, 0.82], [0.86, 0.24]];
    this.generators = [];
    for (let g = 0; g < d.gens; g++) {
      const f = genFr[g % genFr.length];
      const c = Math.max(2, Math.min(C - 3, Math.round(C * f[0])));
      const r = Math.max(2, Math.min(R - 3, Math.round(R * f[1])));
      this._clearRadius(c, r, 1);
      this.generators.push({ ...this.center(c, r), tile: { c, r }, active: false, timer: 0, radius: 190 });
    }

    this._clearRadius(exitC, exitR, 1);

    // Enemigos (posiciones repartidas)
    const slFr = [[0.55, 0.5], [0.78, 0.28], [0.3, 0.72], [0.62, 0.85], [0.85, 0.55]];
    this.slenderConfigs = d.slenders.map((s, k) => {
      const f = slFr[k % slFr.length];
      return {
        x: Math.round(C * f[0]) * this.TILE, y: Math.round(R * f[1]) * this.TILE,
        speed: s.speed, viewDist: s.viewDist, persistence: s.persistence,
      };
    });

    // Baterías (según dificultad)
    this.batteries = this._genBatteries(i);

    // Garantiza acceso
    const st = { c: 3, r: 3 };
    this.notes.forEach((n) => this._carve(st.c, st.r, n.tile.c, n.tile.r));
    this.generators.forEach((g) => this._carve(st.c, st.r, g.tile.c, g.tile.r));
    this._carve(st.c, st.r, exitC, exitR);

    // Arbustos (escondites) repartidos
    this.bushes = new Set();
    let placed = 0, tries = 0;
    const target = Math.floor(C * R * 0.03);
    while (placed < target && tries++ < 2000) {
      const c = 2 + Math.floor(this._rand() * (C - 4));
      const r = 2 + Math.floor(this._rand() * (R - 4));
      if (this.grid[r][c] !== 0) continue;
      if (Math.abs(c - 3) < 3 && Math.abs(r - 3) < 3) continue;
      this.bushes.add(r + "," + c);
      placed++;
    }
  },

  _genBatteries(night) {
    let count = night <= 1 ? 3 : 2;
    if (typeof Difficulty !== "undefined") count += Difficulty.get().batteryBonus;
    count = Math.max(0, count);
    const fr = [[0.35, 0.7], [0.7, 0.25], [0.2, 0.35], [0.6, 0.6]];
    const list = [];
    for (let k = 0; k < count; k++) {
      const f = fr[k % fr.length];
      const c = Math.max(2, Math.min(this.cols - 3, Math.round(this.cols * f[0])));
      const r = Math.max(2, Math.min(this.rows - 3, Math.round(this.rows * f[1])));
      this._clearRadius(c, r, 0);
      list.push({ ...this.center(c, r), taken: false });
    }
    return list;
  },

  canExit() {
    const pagesLeft = this.notes.filter((n) => !n.collected).length;
    return { ok: pagesLeft === 0, pagesLeft };
  },

  // ================= LAS 5 NOCHES =================
  _defs: [
    {
      name: "El Sendero", cols: 44, rows: 28, density: 0.045, gens: 2,
      ambient: { tint: "rgba(40,60,90,0.05)", dark: 0.60 },
      slenders: [{ speed: 100, viewDist: 300, persistence: 0.55 }],
      notes: [
        { kind: "aviso", title: "AVISO DEL PARQUE (tachado)", text: "PROHIBIDO EL PASO PASADO EL ANOCHECER.\n\n[grabado con navaja]: 'no sirve. el no usa el sendero.'" },
        { kind: "policial", title: "REPORTE 041-A / Willow Creek", text: "Menor: T., 9 anos. Visto por ultima vez en el km 3.\nHallado: una gorra, colgada a 2 metros.\nHuella acompanante: descalza, 47 cm. [sic]" },
        { kind: "diario", title: "ALEX", text: "Las huellas de Tommy van junto a otras, mas grandes.\nPasos de tres metros. Ningun hombre camina asi.\nCada tanto, dejan de tocar el suelo." },
        { kind: "grabacion", title: "GRABACION 01 (dictafono danado)", text: "'...dia catorce de busqueda... ///\n...nunca hay cuerpos, jamas hay ///\n...los perros no ladran, se sientan y miran ///\n[estatica larga]" },
        { kind: "diario", title: "ALEX", text: "La baliza del sendero esta apagada.\nSi la enciendo vere el camino.\nPero el tambien me vera a mi.\nUna sola noche. Puedo con una noche." },
      ],
    },
    {
      name: "El Campamento", cols: 52, rows: 32, density: 0.05, gens: 3,
      ambient: { tint: "rgba(50,50,80,0.07)", dark: 0.62 },
      slenders: [{ speed: 108, viewDist: 320, persistence: 0.72 }],
      notes: [
        { kind: "aviso", title: "CAMPAMENTO WILLOW - CERRADO 2004", text: "'Por la seguridad de nuestros campistas,\nel campamento no reabrira.'\n\n[a mano]: 'mentira. lo cerraron por los que faltan.'" },
        { kind: "diario", title: "BITACORA - Consejera R., 1998", text: "Noche 6. Los ninos dibujan al 'hombre flaco' de los pinos.\nLes dije que no existe.\nHoy conte las literas. Falta una.\nNadie recuerda a quien pertenecia." },
        { kind: "grabacion", title: "CINTA DE FOGATA (danada)", text: "'...canten mas fuerte, ninos... ///\n...si lo ven, no lo miren a la ///\n[risas de ninos] ///\n[silencio muy largo]" },
        { kind: "policial", title: "ANEXO FORENSE - 1985", text: "Tronco con 34 nombres tallados.\nCaligrafias infantiles distintas.\nUltima talla, reciente, sin herramienta: 'TOMMY'." },
        { kind: "dibujo", title: "DIBUJO INFANTIL (sin firma)", text: "Ninos en circulo. En el centro, una figura sin cara.\nEn las esquinas: 1971 . 1985 . 1998 . 2004.\nLa figura es identica en todas.\nAbajo: 'el nos cuida ahora'." },
      ],
    },
    {
      name: "La Estacion", cols: 58, rows: 36, density: 0.055, gens: 3,
      ambient: { tint: "rgba(60,45,70,0.09)", dark: 0.64 },
      slenders: [
        { speed: 112, viewDist: 330, persistence: 0.88 },
        { speed: 112, viewDist: 330, persistence: 0.88 },
      ],
      notes: [
        { kind: "policial", title: "EXPEDIENTE 000 - INDICE", text: "Desapariciones 'Willow Creek', 1953 - hoy.\nMenores: 40. Adultos que entraron: 12.\nHallados: 0." },
        { kind: "diario", title: "BITACORA - Guardabosques Miller", text: "Intente fotografiarlo. Las fotos salen veladas,\nsalvo una mancha alta y blanca al fondo.\nSe acerca cada vez que parpadeo." },
        { kind: "grabacion", title: "RADIO - ultima transmision", text: "'...base, responda... ///\nno es un animal ///\nesta en la habitacion, esta en la ///\n[portadora abierta]" },
        { kind: "policial", title: "FICHA 1971-C (amarillenta)", text: "Menor desaparecido, 1971.\nApellido: el mismo que el tuyo.\nAl margen: 'la familia volvera. siempre vuelve.'" },
        { kind: "diario", title: "MILLER - la ultima hoja", text: "No se lleva a cualquiera.\nVuelve por las mismas sangres.\nTommy no fue casualidad. Y tu tampoco." },
      ],
    },
    {
      name: "El Claro", cols: 64, rows: 40, density: 0.06, gens: 4,
      ambient: { tint: "rgba(80,35,45,0.11)", dark: 0.66 },
      slenders: [
        { speed: 118, viewDist: 345, persistence: 1.0 },
        { speed: 118, viewDist: 345, persistence: 1.0 },
      ],
      notes: [
        { kind: "diario", title: "ALEX", text: "Circulos de piedra, uno dentro de otro.\nEn cada piedra: un nombre y un ano.\nEl aire no se mueve. Ni el miedo." },
        { kind: "cripta", title: "INSCRIPCION EN PIEDRA", text: "'No mueren. Se guardan.\nSe vuelven susurro, dibujo, huella.\nEl bosque los colecciona.'" },
        { kind: "diario", title: "ALEX", text: "El nombre de Tommy esta tallado, fresco, sin ano.\nAun estoy a tiempo.\nSi rompo su circulo, quiza lo suelte." },
        { kind: "grabacion", title: "SUSURRO (al quebrar una piedra)", text: "'...gracias ///\npuedo irme ya? ///\n[voz de nina, se apaga]'\nY el bosque entero contuvo el aliento." },
        { kind: "cripta", title: "ADVERTENCIA CENTRAL", text: "'Quien libere a los ninos ocupara su lugar...\no cruzara la puerta antes del primer sol.\nEl corazon despierta.'" },
      ],
    },
    {
      name: "El Corazon", cols: 72, rows: 44, density: 0.065, gens: 4,
      ambient: { tint: "rgba(90,20,25,0.14)", dark: 0.68 },
      slenders: [
        { speed: 126, viewDist: 360, persistence: 1.2 },
        { speed: 126, viewDist: 360, persistence: 1.2 },
        { speed: 126, viewDist: 360, persistence: 1.2 },
      ],
      notes: [
        { kind: "diario", title: "ALEX", text: "Los arboles rezuman savia oscura.\nTodo late despacio, como un corazon.\nEstoy dentro de el ahora." },
        { kind: "grabacion", title: "VOZ DE TOMMY (nitida)", text: "'Sabia que vendrias. Siempre vienes.\nPero esta vez trajiste el alba contigo, hermano.'" },
        { kind: "grabacion", title: "TOMMY", text: "'No mires atras. No te detengas.\nLa puerta se abre un solo instante: cuando sale el sol.'" },
        { kind: "diario", title: "ALEX", text: "Cuento tres sombras. O es una, repetida.\nYa no importa contarlas.\nSolo importa la puerta." },
        { kind: "grabacion", title: "TOMMY", text: "'Si cruzas, el ciclo se rompe. Todos libres. Tu tambien.\nCorre, Alex. Yo te sostengo la puerta.'" },
      ],
    },
  ],

  finalText:
    "Cruzaste la puerta justo cuando el sol asomo entre los arboles.\n" +
    "Por primera vez en anos, el bosque quedo en silencio.\n\n" +
    "Junto a ti, la sombra de un nino sonrio...\n" +
    "y se deshizo en la luz de la manana.\n\n" +
    "Tommy es libre. El ciclo se rompio.\n\nFIN",
};
