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
  onProp(g, prop) { const s = this.chapters[this.ch]; if (s && s.onProp) s.onProp(g, this, prop); },

  // Texto de la meta que se ve arriba a la izquierda
  goal(g) {
    const s = this.chapters[this.ch];
    if (s && s.goal) return s.goal(g, this);
    return (TDLevel.def && TDLevel.def.goal) || "Junta las notas y escapa";
  },

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
        if (got === TDLevel.notes.length) S.after(1, () => g.hint("Busca la baliza del sendero", 4));
      },
      // La baliza: ilumina el camino a la salida... y le avisa que estas aqui
      onProp(g, S, pr) {
        if (pr.kind !== "baliza") return;
        Sound.hit();
        g.static = Math.min(100, g.static + 20);
        g.say("Ya se donde esta la salida. Y el ya sabe donde estoy.", 4.5, "n1_baliza_on");
        let best = null, bd = Infinity;
        for (const s of g.slenders) { const d = Math.hypot(s.x - pr.x, s.y - pr.y); if (d < bd) { bd = d; best = s; } }
        if (best) { g.wake(); best.enrage(); best.blinkCd = 2; }
      },
      goal(g) {
        const left = TDLevel.notes.filter((n) => !n.collected).length;
        if (left) return `Sigue las huellas de Tommy (${TDLevel.notes.length - left}/${TDLevel.notes.length})`;
        const bz = TDLevel.props.find((q) => q.kind === "baliza");
        if (bz && !bz.lit) return "Prende la baliza del sendero";
        return "Sigue el camino iluminado hasta la salida";
      },
      exitBlock(g) {
        const left = TDLevel.notes.filter((n) => !n.collected).length;
        if (left) return `Faltan ${left} nota(s)`;
        const bz = TDLevel.props.find((q) => q.kind === "baliza");
        if (bz && !bz.lit) return "Esta muy oscuro. Prende la baliza primero.";
        return null;
      },
    },

    // ---------------- NOCHE 2: el campamento ----------------
    2: {
      start(g, S) {
        S.after(1.0, () => g.say("El campamento Willow. Cerrado hace anos. Y la fogata... sigue encendida.", 5, "n2_inicio"));
      },
      update(g, S) {
        const p = g.player, f = TDLevel.props[0];
        // La cinta de la fogata suena sola cuando te acercas
        if (f && !S.flags.cinta && Math.hypot(p.x - f.x, p.y - f.y) < 230) {
          S.flags.cinta = true;
          Sound.silence(0.8);
          S.after(0.8, () => g.say("'Canten mas fuerte, ninos... Si lo ven... no lo miren a la cara.'", 6, "n2_cinta"));
        }
        // Al juntar 3 pistas, alguien te llama con la voz de Tommy
        if (S.flags.llamar && !S.flags.llamado && g.state === "playing" && !TDLevel.room) {
          S.flags.llamado = true;
          Sound.silence(1.2);
          S.after(1.2, () => {
            // A un lado del jugador, donde haya piso a la vista
            const a = Math.atan2(p.fy, p.fx) + (Math.random() < 0.5 ? 1.5 : -1.5);
            let pt = null;
            for (let d = 300; d > 100 && !pt; d -= 25) {
              const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
              if (!TDLevel.circleHitsWall(x, y, 14) && TDLevel.lineOfSight(p.x, p.y, x, y)) pt = { x, y };
            }
            pt = pt || S._pointAhead(g, 260) || { x: p.x + 220, y: p.y };
            const side = Math.sign((pt.x - p.x) || 1);
            g.say("'Alex... por aqui. Ven.'", 3.5, "n2_tommy", side * 0.9);
            S.after(1.6, () => { g.appear(pt.x, pt.y, 2.2); g.flickerLight(2.2); g.static = Math.min(100, g.static + 30); Sound.hit(); });
            S.after(4.6, () => g.say("Esa no es la voz de Tommy.", 3, "n2_nolo"));
          });
        }
      },
      onNote(g, S, note) {
        if (note.id === "dibujo") Sound.theme(true);
        const got = TDLevel.notes.filter((n) => n.collected).length;
        if (got >= 3) S.flags.llamar = true;
      },
      onProp(g, S, pr) {
        const cabs = TDLevel.props.length ? TDLevel.props : g._outside.lvl.props;
        const n = cabs.filter((q) => q.kind === "cabana" && q.checked).length;
        if (n < 4) { g.say(["Tres literas.", "Seis.", "Nueve."][n - 1], 2.5, "n2_cab" + n); return; }
        // La ultima cabana: la cuenta no cuadra... la puerta se cierra y algo esta en la esquina
        g.say("Once. Solo once camas... y en la lista hay doce nombres.", 5, "n2_literas");
        S.after(4.2, () => {
          Sound.silence(1.0);
          S.after(1.0, () => {
            Sound.hit();
            g.flickerLight(2.6);
            g.static = Math.min(100, g.static + 36);
            const T = TDLevel.TILE;
            g.spawnInRoom(7.5 * T, 1.6 * T);   // donde faltaba la litera
            g.hint("Sal de la cabana. Ya.", 3);
          });
        });
      },
      goal(g) {
        if (TDLevel.room) return `Cuenta las literas (${TDLevel.beds.filter((b) => b.counted).length}/${TDLevel.beds.length})`;
        const cabs = TDLevel.props.filter((q) => q.kind === "cabana");
        const left = cabs.filter((q) => !q.checked).length;
        const notes = TDLevel.notes.filter((n) => !n.collected).length;
        if (left) return `Revisa las cabanas (${cabs.length - left}/${cabs.length}) y junta las notas`;
        if (notes) return `Junta las notas (faltan ${notes})`;
        return "Escapa del campamento";
      },
      exitBlock(g) {
        const left = TDLevel.props.filter((q) => q.kind === "cabana" && !q.checked).length;
        const notes = TDLevel.notes.filter((n) => !n.collected).length;
        if (left) return `Faltan ${left} cabana(s) por revisar`;
        if (notes) return `Faltan ${notes} nota(s)`;
        return null;
      },
    },
  },
};
