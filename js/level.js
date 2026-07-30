// Gestor de niveles: 5 "noches", cada una con su propia trama y ubicación.
// Mapas largos con escondites/plataformas procedurales y notas crípticas tipadas.
const Level = {
  groundY: 500,
  height: 576,
  current: 0,
  totalNights: 5,

  // --- Estado activo de la noche cargada ---
  width: 0,
  name: "",
  intro: "",
  platforms: [],
  bushes: [],
  trees: [],
  pages: [],
  generators: [],
  batteries: [],
  props: [],
  ambient: null,
  exit: null,
  slenderConfigs: [],

  load(i) {
    this.current = i;
    const d = this._defs[i];
    const W = d.width;
    this.width = W;
    this.name = d.name;
    this.intro = d.intro;
    this.exit = { x: W - 180, y: 380, w: 70, h: 120 };
    this.platforms = [{ x: 0, y: this.groundY, w: W, h: 76 }, ...this._genPlatforms(W, i)];
    this.bushes = this._genBushes(W, i);

    // Notas repartidas de forma pareja a lo largo del mapa (siempre alcanzables)
    const n = d.notes.length;
    this.pages = d.notes.map((note, k) => ({
      x: Math.round(W * (0.12 + 0.74 * (n === 1 ? 0.5 : k / (n - 1)))),
      y: 440,
      collected: false,
      kind: note.kind,
      title: note.title,
      text: note.text,
    }));

    // Generadores repartidos en la zona media
    const g = d.gens;
    this.generators = [];
    for (let j = 0; j < g; j++) {
      const fx = g === 1 ? 0.5 : 0.28 + 0.46 * (j / (g - 1));
      this.generators.push({ x: Math.round(W * fx), y: 440, w: 60, h: 60, active: false });
    }

    // Enemigos (patrullas definidas como fracción del ancho)
    this.slenderConfigs = d.slenders.map((s) => ({
      x: Math.round(W * (s.pMin + s.pMax) / 2),
      patrolMin: Math.round(W * s.pMin),
      patrolMax: Math.round(W * s.pMax),
      speed: s.speed, viewDist: s.viewDist, viewHeight: s.viewHeight, persistence: s.persistence,
    }));

    this.trees = this._genTrees(W, i);
    this.batteries = this._genBatteries(W, i);
    this.props = this._genProps(W, i);
    this.ambient = this.ambientFor(i);
  },

  // Escondites garantizados a lo largo de todo el mapa (~cada 470px)
  _genBushes(width, night) {
    const bushes = [];
    let rng = (night + 1) * 6151 + 7;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    let x = 300;
    while (x < width - 300) {
      bushes.push({ x: Math.round(x), w: 130 + Math.round(rand() * 40) });
      x += 400 + rand() * 160;
    }
    return bushes;
  },

  // Plataformas flotantes decorativas (para verticalidad y variedad)
  _genPlatforms(width, night) {
    const plats = [];
    let rng = (night + 5) * 3571 + 13;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    const count = Math.floor(width / 850);
    for (let k = 0; k < count; k++) {
      const x = 400 + rand() * (width - 900);
      const y = 340 + Math.round(rand() * 80);
      plats.push({ x: Math.round(x), y, w: 140 + Math.round(rand() * 50), h: 20 });
    }
    return plats;
  },

  _genBatteries(width, night) {
    let count = night <= 1 ? 2 : 1;
    count += Difficulty.get().batteryBonus;
    count = Math.max(0, count);
    const list = [];
    for (let k = 0; k < count; k++) {
      const fx = (k + 1) / (count + 1);
      list.push({ x: Math.round(width * fx) + (k % 2 ? 90 : -90), y: 452, taken: false });
    }
    return list;
  },

  _genProps(width, night) {
    const props = [];
    let rng = (night + 3) * 7919 + 17;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    let x = 120;
    while (x < width - 100) {
      const r = rand();
      if (r < 0.3) props.push({ type: "rock", x, size: 8 + rand() * 10 });
      else if (r < 0.55) props.push({ type: "mushroom", x, n: 1 + Math.floor(rand() * 3) });
      else if (r < 0.72) props.push({ type: "log", x, w: 60 + rand() * 50 });
      else props.push({ type: "grass", x, n: 2 + Math.floor(rand() * 4) });
      x += 130 + rand() * 190;
    }
    return props;
  },

  ambientFor(night) {
    const moods = [
      { tint: "rgba(40,60,90,0.06)", fog: 1.0 },
      { tint: "rgba(50,50,80,0.08)", fog: 1.2 },
      { tint: "rgba(60,45,70,0.10)", fog: 1.4 },
      { tint: "rgba(80,35,45,0.12)", fog: 1.6 },
      { tint: "rgba(90,20,25,0.16)", fog: 2.0 },
    ];
    return moods[Math.min(night, moods.length - 1)];
  },

  reset() { this.load(this.current); },

  getInfo(i) {
    const d = this._defs[i];
    return { num: i + 1, name: d.name, intro: d.intro };
  },

  canExit() {
    const pagesLeft = this.pages.filter((p) => !p.collected).length;
    const gensOff = this.generators.filter((g) => !g.active).length;
    return { ok: pagesLeft === 0 && gensOff === 0, pagesLeft, gensOff };
  },

  _genTrees(width, seed) {
    const trees = [];
    let rng = seed * 9301 + 49297;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    let x = 60;
    while (x < width) {
      trees.push({ x, s: 0.75 + rand() * 0.5 });
      x += 180 + rand() * 180;
    }
    return trees;
  },

  // ================= LAS 5 NOCHES =================
  // Cada nota: kind (diario|policial|grabacion|dibujo|cripta|aviso), title (fuente), text.
  _defs: [
    // ---------- NOCHE 1: EL SENDERO ----------
    {
      name: "El Sendero",
      width: 3400,
      intro:
        "Willow Creek. Tu hermano Tommy desaparecio siguiendo este sendero.\n" +
        "Su rastro empieza aqui, en el borde del bosque.\n\n" +
        "Reune los fragmentos del camino y enciende la baliza para avanzar.\n" +
        "Silencio: algo camina solo cuando tu caminas.",
      gens: 1,
      slenders: [{ pMin: 0.26, pMax: 0.62, speed: 56, viewDist: 240, viewHeight: 85, persistence: 0.5 }],
      notes: [
        { kind: "aviso", title: "AVISO DEL PARQUE (tachado)",
          text: "PROHIBIDO EL PASO PASADO EL ANOCHECER.\n\n[grabado abajo con navaja]:\n'no sirve. el no usa el sendero.'" },
        { kind: "policial", title: "REPORTE 041-A / Willow Creek",
          text: "Menor: T., 9 anos. Visto por ultima vez en el km 3.\nHallado: una gorra, colgada a 2 metros de altura.\nSin signos de forcejeo.\nHuella acompanante: descalza, 47 cm. [sic]" },
        { kind: "diario", title: "ALEX",
          text: "Las huellas de Tommy van junto a otras, mas grandes.\nDan pasos de tres metros. Ningun hombre camina asi.\nCada tanto, simplemente... dejan de tocar el suelo." },
        { kind: "grabacion", title: "GRABACION 01 (dictafono danado)",
          text: "'...dia catorce de busqueda... ///\n...nunca hay cuerpos, jamas hay ///\n...los perros no ladran, se sientan y miran ///\n[estatica larga]" },
        { kind: "diario", title: "ALEX",
          text: "La baliza del sendero esta apagada.\nSi la enciendo, vere el camino.\nPero el tambien me vera a mi.\nUna sola noche. Puedo con una noche." },
      ],
    },

    // ---------- NOCHE 2: EL CAMPAMENTO ----------
    {
      name: "El Campamento",
      width: 4200,
      intro:
        "El sendero muere en un viejo campamento de verano,\n" +
        "cerrado hace decadas tras varias desapariciones.\n\n" +
        "Alguien acampo aqui hace muy poco.\n" +
        "Devuelve la energia a las casetas para cruzar. El Esbelto ya te busca.",
      gens: 2,
      slenders: [{ pMin: 0.2, pMax: 0.82, speed: 72, viewDist: 285, viewHeight: 95, persistence: 0.72 }],
      notes: [
        { kind: "aviso", title: "CAMPAMENTO WILLOW - CERRADO 2004",
          text: "'Por la seguridad de nuestros campistas,\nel campamento no reabrira.'\n\n[encima, a mano]: 'mentira. lo cerraron\npor los que faltan.'" },
        { kind: "diario", title: "BITACORA - Consejera R., 1998",
          text: "Noche 6. Los ninos dibujan al 'hombre flaco' de los pinos.\nLes dije que no existe.\nHoy conte las literas. Falta una.\nNadie recuerda a quien pertenecia." },
        { kind: "grabacion", title: "CINTA DE FOGATA (danada)",
          text: "'...canten mas fuerte, ninos... ///\n...si lo ven, no lo miren a la ///\n[risas de ninos] ///\n[silencio muy largo]" },
        { kind: "policial", title: "ANEXO FORENSE - 1985",
          text: "Tronco con 34 nombres tallados.\nCaligrafias infantiles distintas.\nAntiguedad de las tallas: entre 1 y 60 anos.\nUltima talla, reciente, sin herramienta: 'TOMMY'." },
        { kind: "dibujo", title: "DIBUJO INFANTIL (sin firma)",
          text: "Muchos ninos tomados de la mano, en circulo.\nEn el centro, una figura alta y negra sin cara.\nEn las esquinas: 1971 . 1985 . 1998 . 2004.\nLa figura es identica en todas.\nAbajo: 'el nos cuida ahora'." },
      ],
    },

    // ---------- NOCHE 3: LA ESTACION ----------
    {
      name: "La Estacion",
      width: 4800,
      intro:
        "La vieja estacion de guardabosques. Aqui se guardaban los registros.\n\n" +
        "Restaura la energia para llegar al archivo y a la radio.\n" +
        "Dos siluetas rondan los pasillos del bosque, y ya no te olvidan.",
      gens: 2,
      slenders: [
        { pMin: 0.16, pMax: 0.52, speed: 78, viewDist: 300, viewHeight: 100, persistence: 0.86 },
        { pMin: 0.52, pMax: 0.86, speed: 78, viewDist: 300, viewHeight: 100, persistence: 0.86 },
      ],
      notes: [
        { kind: "policial", title: "EXPEDIENTE 000 - INDICE",
          text: "Desapariciones 'Willow Creek', 1953 - hoy.\nMenores: 40. Adultos que entraron a buscarlos: 12.\nHallados: 0.\nEstado del caso: permanentemente abierto." },
        { kind: "diario", title: "BITACORA - Guardabosques Miller",
          text: "Intente fotografiarlo. Todas las fotos salen veladas,\nsalvo una mancha alta y blanca al fondo.\nMe sigue hace tres noches.\nSe acerca cada vez que parpadeo." },
        { kind: "grabacion", title: "RADIO - ultima transmision",
          text: "'...base, responda... ///\nno es un animal ///\nesta en la habitacion, esta en la ///\nno vengan a buscar ///\n[portadora abierta]" },
        { kind: "policial", title: "FICHA 1971-C (amarillenta)",
          text: "Menor desaparecido, 1971.\nApellido: el mismo que el tuyo.\nUn hermano del abuelo del que nunca se hablo.\nAl margen: 'la familia volvera. siempre vuelve.'" },
        { kind: "diario", title: "MILLER - hoja suelta, la ultima",
          text: "No se lleva a cualquiera.\nVuelve por las mismas sangres, como cerrando algo.\nTommy no fue casualidad.\nY el hermano que viene a buscarlo, tampoco." },
      ],
    },

    // ---------- NOCHE 4: EL CLARO ----------
    {
      name: "El Claro",
      width: 5400,
      intro:
        "El claro de los circulos de piedra. Cada piedra, un nombre.\n" +
        "Cada nombre, un nino que el bosque guarda.\n\n" +
        "Alimenta las balizas y rompe el circulo para liberarlos...\n" +
        "si te atreves. El bosque despertara, y despertara furioso.",
      gens: 3,
      slenders: [
        { pMin: 0.15, pMax: 0.5, speed: 86, viewDist: 330, viewHeight: 110, persistence: 1.0 },
        { pMin: 0.5, pMax: 0.86, speed: 86, viewDist: 330, viewHeight: 110, persistence: 1.0 },
      ],
      notes: [
        { kind: "diario", title: "ALEX",
          text: "Circulos de piedra, uno dentro de otro.\nEn cada piedra: un nombre y un ano.\nEl aire no se mueve. Ni las hojas. Ni el miedo." },
        { kind: "cripta", title: "INSCRIPCION EN PIEDRA",
          text: "'No mueren. Se guardan.\nSe vuelven susurro, dibujo, huella.\nEl bosque no pierde a sus ninos.\nLos colecciona.'" },
        { kind: "diario", title: "ALEX",
          text: "El nombre de Tommy esta tallado, fresco, sin ano todavia.\nAun estoy a tiempo.\nSi rompo su circulo, quiza lo suelte." },
        { kind: "grabacion", title: "SUSURRO (al quebrar una piedra)",
          text: "'...gracias ///\npuedo irme ya? ///\n[voz de nina, se apaga]'\n\nY entonces el bosque entero contuvo el aliento." },
        { kind: "cripta", title: "ADVERTENCIA CENTRAL",
          text: "'Quien libere a los ninos ocupara su lugar...\no cruzara la puerta antes del primer rayo de sol.\nEl corazon esta guardado.\nEl corazon, ahora, despierta.'" },
      ],
    },

    // ---------- NOCHE 5: EL CORAZON ----------
    {
      name: "El Corazon",
      width: 6200,
      intro:
        "El corazon del bosque. La ultima noche.\n\n" +
        "Reune las ultimas voces, alimenta las balizas\n" +
        "y cruza la puerta al alba para romper el ciclo.\n" +
        "Tres sombras te buscan. Tommy te guia. No mires atras.",
      gens: 3,
      slenders: [
        { pMin: 0.14, pMax: 0.42, speed: 94, viewDist: 350, viewHeight: 120, persistence: 1.2 },
        { pMin: 0.42, pMax: 0.66, speed: 94, viewDist: 350, viewHeight: 120, persistence: 1.2 },
        { pMin: 0.66, pMax: 0.9, speed: 94, viewDist: 350, viewHeight: 120, persistence: 1.2 },
      ],
      notes: [
        { kind: "diario", title: "ALEX",
          text: "Los arboles rezuman savia oscura.\nTodo late despacio, como un corazon.\nCreo que estoy dentro de el ahora." },
        { kind: "grabacion", title: "VOZ DE TOMMY (nitida)",
          text: "'Sabia que vendrias. Siempre vienes.\nPero esta vez trajiste el alba contigo, hermano.'" },
        { kind: "grabacion", title: "TOMMY",
          text: "'No mires atras. Hagas lo que hagas, no te detengas.\nLa puerta se abre un solo instante:\ncuando sale el sol.'" },
        { kind: "diario", title: "ALEX",
          text: "Cuento tres sombras. O es una, repetida.\nYa no importa contarlas.\nSolo importa llegar a la puerta." },
        { kind: "grabacion", title: "TOMMY",
          text: "'Si cruzas, el ciclo se rompe. Todos libres. Tu tambien.\nCorre, Alex. Yo te sostengo la puerta.'" },
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
