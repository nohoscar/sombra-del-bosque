// Modo historia: guion de cada capitulo (eventos, dialogos, sustos).
// El motor (game.js) llama a estos ganchos; aqui vive todo lo que "pasa".
const Story = {
  ch: 0,
  timers: [],
  flags: {},

  start(g, i) {
    this.ch = i;
    this.timers = [];
    this.flags = {};
    const s = this.chapters[i];
    if (s && s.start) s.start(g, this);
  },

  after(sec, fn) { this.timers.push({ t: sec, fn }); },

  update(g, dt) {
    for (const tm of this.timers) tm.t -= dt;
    const due = this.timers.filter((tm) => tm.t <= 0);
    this.timers = this.timers.filter((tm) => tm.t > 0);
    due.forEach((tm) => tm.fn());
    const s = this.chapters[this.ch];
    if (s && s.update) s.update(g, this, dt);
  },

  onNote(g, note) { const s = this.chapters[this.ch]; if (s && s.onNote) s.onNote(g, this, note); },
  onItem(g, item) { const s = this.chapters[this.ch]; if (s && s.onItem) s.onItem(g, this, item); },

  // Devuelve un texto si la salida sigue bloqueada, o null si ya se puede salir
  exitBlock(g) {
    const s = this.chapters[this.ch];
    if (s && s.exitBlock) return s.exitBlock(g, this);
    const st = TDLevel.canExit();
    return st.pagesLeft > 0 ? `Faltan ${st.pagesLeft} nota(s)` : null;
  },
  exitPrompt() {
    const s = this.chapters[this.ch];
    return (s && s.exitPrompt) || "E: escapar";
  },

  // Busca un punto de piso visible frente al jugador (para apariciones)
  _pointAhead(g, dist) {
    const p = g.player;
    for (let d = dist; d > 90; d -= 20) {
      for (const turn of [0, 0.35, -0.35, 0.7, -0.7]) {
        const a = Math.atan2(p.fy, p.fx) + turn;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!TDLevel.circleHitsWall(x, y, 14) && TDLevel.lineOfSight(p.x, p.y, x, y)) return { x, y };
      }
    }
    return null;
  },

  chapters: {
    // ---------------- PRÓLOGO: la casa ----------------
    0: {
      exitPrompt: "E: salir al bosque",
      start(g, S) {
        Sound.setMusic("home");
        S.after(1.2, () => g.say("Tommy? ...Ya estas dormido?", 3.5, "pr_tommy"));
        S.after(5.5, () => g.hint("WASD / Flechas: moverte   ·   E: examinar", 6));
      },
      update(g, S) {
        const p = g.player;
        // La ventana del cuarto de Tommy (casillas 4-5 de la pared de arriba)
        if (S.flags.dibujo && !S.flags.ventana && g.state === "playing" && p.y < 6 * TDLevel.TILE && Math.abs(p.x - 260) < 150) {
          S.flags.ventana = true;
          Sound.silence(1.3);
          S.after(1.3, () => {
            g.appear(262, 88, 2.4);
            g.flickerLight(2.4);
            g.static = Math.min(100, g.static + 32);
            Sound.hit();
          });
          S.after(3.9, () => g.say("Habia alguien alla afuera. Junto a los pinos.", 4, "pr_ventana"));
          S.after(8.5, () => { if (!S.flags.caja) g.hint("Papa guarda sus cosas en su cuarto...", 4); });
        }
      },
      onNote(g, S, note) {
        S.flags[note.id] = true;
        if (note.id === "dibujo") Sound.theme();
      },
      onItem(g, S, item) {
        if (item.id === "linterna") {
          S.flags.linterna = true;
          S.after(0.3, () => g.say("La linterna de papa.", 2.5, "pr_linterna"));
          S.after(3, () => g.hint("F: prender / apagar la linterna", 5));
        }
      },
      exitBlock(g, S) {
        const left = TDLevel.notes.filter((n) => !n.collected).length;
        if (left > 0) return "Algo no esta bien. Revisa la casa.";
        if (!S.flags.linterna) return "Necesito una linterna. Papa guarda una en la cocina.";
        if (!S.flags.listo) {
          S.flags.listo = true;
          g.say("Las huellas van hacia el bosque. Tengo que ir por el.", 4, "pr_salir");
        }
        return null;
      },
    },

    // ---------------- NOCHE 1: el sendero ----------------
    1: {
      start(g, S) {
        Sound.setMusic("calm");
        S.after(1.0, () => g.say("Las huellas siguen el sendero. Las de Tommy... y otras.", 4.5, "n1_inicio"));
        S.after(6.5, () => g.hint("Junta las 5 notas   ·   SHIFT: correr   ·   Arbustos: esconderte", 6));
      },
      update(g, S) {
        const p = g.player;
        if (p.hidden && !S.flags.arbusto) {
          S.flags.arbusto = true;
          g.say("Aqui no me ve. Creo.", 2.5, "n1_arbusto");
        }
        // Primer encuentro: despues de la segunda nota, cuando vuelves a jugar
        if (S.flags.avistar && !S.flags.avistado && g.state === "playing") {
          S.flags.avistado = true;
          Sound.silence(1.5);
          S.after(1.5, () => {
            const pt = S._pointAhead(g, 260) || { x: p.x + 200, y: p.y };
            g.appear(pt.x, pt.y, 2.6);
            g.flickerLight(2.6);
            g.static = Math.min(100, g.static + 38);
            Sound.hit();
            g.say("...Ahi esta.", 2.2, "n1_ahi");
          });
          S.after(4.3, () => {
            g.wake();
            g.hint("Ya te busca. Que no te vea.", 4);
          });
        }
      },
      onNote(g, S) {
        const got = TDLevel.notes.filter((n) => n.collected).length;
        if (got >= 2) S.flags.avistar = true;
      },
    },
  },
};
