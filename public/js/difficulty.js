// Opciones del jugador (se guardan en el navegador)
const Settings = {
  lessFlash: (() => { try { return localStorage.getItem("sombra_menos_destellos") === "1"; } catch (e) { return false; } })(),
  setLessFlash(v) {
    this.lessFlash = !!v;
    try { localStorage.setItem("sombra_menos_destellos", v ? "1" : "0"); } catch (e) {}
  },
};

// Sistema de dificultad. Multiplicadores que afectan al enemigo, la batería y el miedo.
const Difficulty = {
  current: "normal",

  presets: {
    facil: {
      label: "FACIL",
      desc: "El Esbelto es lento y de vista corta. Mucha bateria. Ideal para explorar la historia.",
      slenderSpeed: 0.8,
      view: 0.85,
      hideLose: 1.7,     // qué tan rápido te pierde al esconderte (mayor = más rápido)
      batteryDrain: 0.6, // consumo de linterna
      batteryBonus: 1,   // pilas extra por nivel
      fearMul: 0.7,
      genCharges: 3,     // usos de generadores (zonas de luz)
      litDuration: 11,   // segundos que dura encendido
      blink: 1.8,        // que tan seguido aparece de golpe (mayor = menos seguido)
    },
    normal: {
      label: "NORMAL",
      desc: "Equilibrio pensado para el juego. Recomendado en tu primera partida.",
      slenderSpeed: 1.0,
      view: 1.0,
      hideLose: 1.0,
      batteryDrain: 1.0,
      batteryBonus: 0,
      fearMul: 1.0,
      genCharges: 2,
      litDuration: 9,
      blink: 1,
    },
    dificil: {
      label: "DIFICIL",
      desc: "Rapido, de vista larga y persistente. Bateria escasa. El bosque no perdona.",
      slenderSpeed: 1.22,
      view: 1.18,
      hideLose: 0.7,
      batteryDrain: 1.35,
      batteryBonus: -1,
      fearMul: 1.3,
      genCharges: 1,
      litDuration: 7,
      blink: 0.7,
    },
  },

  set(name) {
    if (this.presets[name]) this.current = name;
  },

  get() {
    return this.presets[this.current];
  },
};
