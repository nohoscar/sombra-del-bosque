// Punto de entrada: inicializa todo, conecta la UI y corre el bucle principal.
window.addEventListener("load", () => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  Input.init();
  const game = new Game(canvas);

  // Pantallas
  const startScreen = document.getElementById("start-screen");
  const nightScreen = document.getElementById("night-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const winScreen = document.getElementById("win-screen");
  const noteScreen = document.getElementById("note-screen");

  const notePaper = document.getElementById("note-paper");
  const noteTitle = document.getElementById("note-title");
  const noteText = document.getElementById("note-text");
  const nightLabel = document.getElementById("night-label");
  const nightTitle = document.getElementById("night-title");
  const nightText = document.getElementById("night-text");
  const nightBtn = document.getElementById("night-btn");
  const winText = document.getElementById("win-text");
  const gameoverText = document.getElementById("gameover-text");

  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");

  // --- Audio: se inicializa con el primer gesto del usuario (autoplay policy) ---
  const initAudioOnce = () => {
    Sound.init();
    Sound.resume();
    window.removeEventListener("pointerdown", initAudioOnce);
    window.removeEventListener("keydown", initAudioOnce);
  };
  window.addEventListener("pointerdown", initAudioOnce);
  window.addEventListener("keydown", initAudioOnce);

  // Efecto de "lectura" letra por letra para las notas
  let typeTimer = null;
  let noteTyping = false;
  const typeNote = (el, text) => {
    clearInterval(typeTimer);
    el.textContent = "";
    noteTyping = true;
    let i = 0;
    typeTimer = setInterval(() => {
      if (i < text.length) {
        el.textContent += text[i++];
        if (i % 2 === 0) Sound.readTick();
      } else {
        clearInterval(typeTimer);
        noteTyping = false;
      }
    }, 26);
  };
  const finishNote = (el, text) => { clearInterval(typeTimer); el.textContent = text; noteTyping = false; };

  // --- Selector de dificultad ---
  const diffBtns = document.querySelectorAll(".diff-btn");
  const diffDesc = document.getElementById("diff-desc");
  const setDiff = (name) => {
    Difficulty.set(name);
    diffBtns.forEach((b) => b.classList.toggle("active", b.dataset.diff === name));
    diffDesc.textContent = Difficulty.get().desc;
  };
  diffBtns.forEach((b) => b.addEventListener("click", () => setDiff(b.dataset.diff)));
  setDiff("normal");

  // --- Guardado ---
  const SAVE_KEY = "sombra_del_bosque_progreso";
  const loadProgress = () => {
    const v = parseInt(localStorage.getItem(SAVE_KEY) || "0", 10);
    return isNaN(v) ? 0 : Math.max(0, Math.min(v, Level.totalNights - 1));
  };
  const saveProgress = (nightIndex) => {
    const cur = loadProgress();
    if (nightIndex > cur) localStorage.setItem(SAVE_KEY, String(nightIndex));
  };

  const continueBtn = document.getElementById("continue-btn");
  const refreshContinue = () => {
    const unlocked = loadProgress();
    if (unlocked > 0) {
      continueBtn.textContent = `CONTINUAR (NOCHE ${unlocked + 1})`;
      show(continueBtn);
    } else {
      hide(continueBtn);
    }
  };
  refreshContinue();

  // Muestra la intro de una noche; al continuar, arranca esa noche
  function showNightIntro(i) {
    const info = Level.getInfo(i);
    nightLabel.textContent = `NOCHE ${info.num} DE ${Level.totalNights}`;
    nightTitle.textContent = info.name;
    nightText.textContent = info.intro;
    nightBtn.textContent = info.num === 1 ? "ENTRAR AL BOSQUE" : "CONTINUAR";
    show(nightScreen);
    nightBtn.onclick = () => {
      hide(nightScreen);
      // Si hay un interludio para esta noche, se reproduce antes de empezar
      const inter = Cinematic.INTERLUDES[i];
      if (inter) Cinematic.play(inter, () => game.beginNight(i));
      else game.beginNight(i);
    };
  }

  // Eventos del juego -> UI
  const KIND_LABEL = {
    diario: "DIARIO", policial: "REPORTE", grabacion: "GRABACION",
    dibujo: "DIBUJO", cripta: "INSCRIPCION", aviso: "CARTEL",
  };
  let currentNoteText = "";
  game.on("note", (doc) => {
    const kind = doc.kind || "diario";
    notePaper.className = "note-paper note-" + kind;
    const label = KIND_LABEL[kind] || "";
    noteTitle.textContent = (label ? label + "  \u2014  " : "") + (doc.title || "");
    currentNoteText = doc.text;
    show(noteScreen);
    typeNote(noteText, doc.text);   // se "lee" letra por letra
    Sound.startReading();           // susurro ininteligible de fondo
  });

  game.on("nightcomplete", (data) => {
    saveProgress(data.completed);
    nightLabel.textContent = "SOBREVIVISTE";
    nightTitle.textContent = `Noche ${data.completed} superada`;
    nightText.textContent =
      "El sol asoma un instante entre los arboles y vuelve a ocultarse.\n" +
      "Otra noche cae. El bosque despierta, mas hambriento que antes.";
    nightBtn.textContent = "AFRONTAR LA SIGUIENTE NOCHE";
    show(nightScreen);
    nightBtn.onclick = () => {
      hide(nightScreen);
      showNightIntro(data.completed);
    };
  });

  game.on("gameover", (data) => {
    gameoverText.textContent =
      `Caiste en la Noche ${data.night}. El bosque te reclamo, como a los demas.`;
    // Breve escena de ser atrapado y luego la pantalla de derrota
    Cinematic.play(Cinematic.DEATH, () => show(gameoverScreen));
  });

  game.on("win", () => {
    // Cinemática de final feliz y luego la pantalla de victoria
    Cinematic.play(Cinematic.ENDING, () => {
      winText.textContent = Level.finalText;
      show(winScreen);
    });
  });

  // Botones
  document.getElementById("start-btn").addEventListener("click", () => {
    hide(startScreen);
    // Nueva partida: reproduce la cinemática de apertura y luego la Noche 1
    Cinematic.play(Cinematic.OPENING, () => showNightIntro(0));
  });
  continueBtn.addEventListener("click", () => {
    hide(startScreen);
    showNightIntro(loadProgress());
  });
  document.getElementById("retry-btn").addEventListener("click", () => {
    hide(gameoverScreen);
    game.retry();
  });
  document.getElementById("win-btn").addEventListener("click", () => {
    hide(winScreen);
    refreshContinue();
    show(startScreen);
  });
  document.getElementById("note-btn").addEventListener("click", () => {
    if (noteTyping) {
      // Primer clic: revela el texto completo de inmediato
      finishNote(noteText, currentNoteText);
      return;
    }
    hide(noteScreen);
    Sound.stopReading();
    game.resumeFromNote();
  });

  // Avanzar / saltar cinemática
  canvas.addEventListener("click", () => { if (Cinematic.active) Cinematic.advance(); });
  window.addEventListener("keydown", (e) => {
    if (Cinematic.active && e.code === "Escape") Cinematic.skipAll();
    if (e.code === "KeyM") Sound.toggleMute();
  });

  // Bucle principal con delta-time
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    Input.update();

    if (Cinematic.active) {
      Cinematic.update(dt);
      Cinematic.draw(ctx, canvas.width, canvas.height);
    } else {
      game.update(dt);
      game.draw();
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
