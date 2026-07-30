// Flujo completo del juego cenital: menú, dificultad, guardado, cinemáticas,
// noches, interludios, finales, lectura de notas, pausa y controles táctiles.
window.addEventListener("load", () => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  Input.init();
  const game = new TDGame(canvas);

  const $ = (id) => document.getElementById(id);
  const startScreen = $("start-screen");
  const nightScreen = $("night-screen");
  const pauseScreen = $("pause-screen");
  const gameoverScreen = $("gameover-screen");
  const winScreen = $("win-screen");
  const noteScreen = $("note-screen");
  const notePaper = $("note-paper");
  const noteTitle = $("note-title");
  const noteText = $("note-text");
  const nightLabel = $("night-label");
  const nightTitle = $("night-title");
  const nightText = $("night-text");
  const nightBtn = $("night-btn");
  const winText = $("win-text");
  const gameoverText = $("gameover-text");
  const pauseBtn = $("pause-btn");

  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");

  // Audio por gesto
  const initAudioOnce = () => {
    Sound.init(); Sound.resume();
    window.removeEventListener("pointerdown", initAudioOnce);
    window.removeEventListener("keydown", initAudioOnce);
  };
  window.addEventListener("pointerdown", initAudioOnce);
  window.addEventListener("keydown", initAudioOnce);

  // Lectura de notas letra por letra
  let typeTimer = null, noteTyping = false, currentText = "";
  const KIND = { diario: "DIARIO", policial: "REPORTE", grabacion: "GRABACION", dibujo: "DIBUJO", cripta: "INSCRIPCION", aviso: "CARTEL" };
  const typeNote = (el, text) => {
    clearInterval(typeTimer); el.textContent = ""; noteTyping = true; let i = 0;
    typeTimer = setInterval(() => {
      if (i < text.length) { el.textContent += text[i++]; if (i % 2 === 0) Sound.readTick(); }
      else { clearInterval(typeTimer); noteTyping = false; }
    }, 26);
  };

  // Dificultad
  const diffBtns = document.querySelectorAll(".diff-btn");
  const diffDesc = $("diff-desc");
  const setDiff = (name) => {
    Difficulty.set(name);
    diffBtns.forEach((b) => b.classList.toggle("active", b.dataset.diff === name));
    diffDesc.textContent = Difficulty.get().desc;
  };
  diffBtns.forEach((b) => b.addEventListener("click", () => setDiff(b.dataset.diff)));
  setDiff("normal");

  // Guardado
  const SAVE_KEY = "sombra_td_progreso";
  const loadProgress = () => {
    const v = parseInt(localStorage.getItem(SAVE_KEY) || "0", 10);
    return isNaN(v) ? 0 : Math.max(0, Math.min(v, TDLevel.totalNights - 1));
  };
  const saveProgress = (n) => { if (n > loadProgress()) localStorage.setItem(SAVE_KEY, String(n)); };
  const continueBtn = $("continue-btn");
  const refreshContinue = () => {
    const u = loadProgress();
    if (u > 0) { continueBtn.textContent = `CONTINUAR (NOCHE ${u + 1})`; show(continueBtn); }
    else hide(continueBtn);
  };
  refreshContinue();

  function showNightIntro(i) {
    const info = TDLevel.getInfo(i);
    nightLabel.textContent = `NOCHE ${info.num} DE ${TDLevel.totalNights}`;
    nightTitle.textContent = info.name;
    nightText.textContent = info.intro;
    nightBtn.textContent = info.num === 1 ? "ENTRAR AL BOSQUE" : "CONTINUAR";
    show(nightScreen);
    nightBtn.onclick = () => {
      hide(nightScreen);
      const inter = Cinematic.INTERLUDES[i];
      if (inter) Cinematic.play(inter, () => game.beginNight(i));
      else game.beginNight(i);
    };
  }

  // Eventos del juego
  game.on("note", (doc) => {
    const kind = doc.kind || "diario";
    notePaper.className = "note-paper note-" + kind;
    noteTitle.textContent = (KIND[kind] ? KIND[kind] + "  \u2014  " : "") + (doc.title || "");
    currentText = doc.text;
    show(noteScreen);
    typeNote(noteText, doc.text);
    Sound.startReading();
  });
  game.on("nightcomplete", (d) => {
    saveProgress(d.completed);
    nightLabel.textContent = "SOBREVIVISTE";
    nightTitle.textContent = `Noche ${d.completed} superada`;
    nightText.textContent = "El sol asoma un instante entre los arboles y vuelve a ocultarse.\nOtra noche cae. El bosque despierta, mas hambriento que antes.";
    nightBtn.textContent = "SIGUIENTE NOCHE";
    show(nightScreen);
    nightBtn.onclick = () => { hide(nightScreen); showNightIntro(d.completed); };
  });
  game.on("gameover", (d) => {
    Cinematic.play(Cinematic.DEATH, () => {
      gameoverText.textContent = `Caiste en la Noche ${d.night}. El bosque te reclamo, como a los demas.`;
      show(gameoverScreen);
    });
  });
  game.on("win", () => {
    Cinematic.play(Cinematic.ENDING, () => { winText.textContent = TDLevel.finalText; show(winScreen); });
  });

  // Botones
  $("start-btn").addEventListener("click", () => { hide(startScreen); Cinematic.play(Cinematic.OPENING, () => showNightIntro(0)); });
  continueBtn.addEventListener("click", () => { hide(startScreen); showNightIntro(loadProgress()); });
  $("retry-btn").addEventListener("click", () => { hide(gameoverScreen); game.retry(); });
  $("win-btn").addEventListener("click", () => { hide(winScreen); refreshContinue(); show(startScreen); });
  $("note-btn").addEventListener("click", () => {
    if (noteTyping) { clearInterval(typeTimer); noteText.textContent = currentText; noteTyping = false; return; }
    hide(noteScreen); Sound.stopReading(); game.resumeFromNote();
  });

  // Pausa
  const doPause = () => { if (game.state !== "playing") return; game.setPaused(true); show(pauseScreen); };
  const doResume = () => { game.setPaused(false); hide(pauseScreen); };
  pauseBtn.addEventListener("click", doPause);
  $("resume-btn").addEventListener("click", doResume);
  $("restart-night-btn").addEventListener("click", () => { hide(pauseScreen); game.retry(); });
  $("mute-btn").addEventListener("click", () => Sound.toggleMute());
  $("tomenu-btn").addEventListener("click", () => {
    hide(pauseScreen); Sound.stopAmbience(); game.state = "menu"; show(startScreen); refreshContinue();
  });

  window.addEventListener("keydown", (e) => {
    if (Cinematic.active && e.code === "Escape") { Cinematic.skipAll(); return; }
    if (e.code === "KeyM") Sound.toggleMute();
    if (e.code === "KeyP" || e.code === "Escape") {
      if (game.paused) doResume();
      else if (game.state === "playing") doPause();
    }
  });

  // --- Controles táctiles ---
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  if (isTouch) $("touch-controls").classList.add("on");
  const joy = $("joystick"), knob = $("joystick-knob");
  let joyId = null, joyCx = 0, joyCy = 0, joyR = 1;
  const updateJoy = (t) => {
    let dx = t.clientX - joyCx, dy = t.clientY - joyCy;
    const d = Math.hypot(dx, dy);
    if (d > joyR) { dx = dx / d * joyR; dy = dy / d * joyR; }
    Input.setAxis(dx / joyR, dy / joyR);
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };
  joy.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0]; joyId = t.identifier;
    const rect = joy.getBoundingClientRect();
    joyCx = rect.left + rect.width / 2; joyCy = rect.top + rect.height / 2; joyR = rect.width / 2;
    updateJoy(t);
  }, { passive: false });
  joy.addEventListener("touchmove", (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joyId) updateJoy(t); }, { passive: false });
  const endJoy = (e) => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; Input.setAxis(0, 0); knob.style.transform = "translate(-50%, -50%)"; } };
  joy.addEventListener("touchend", endJoy);
  joy.addEventListener("touchcancel", endJoy);
  const bindBtn = (id, action) => {
    const el = $(id);
    el.addEventListener("touchstart", (e) => { e.preventDefault(); Input.press(action); }, { passive: false });
    const up = (e) => { e.preventDefault(); Input.release(action); };
    el.addEventListener("touchend", up); el.addEventListener("touchcancel", up);
  };
  bindBtn("btn-action", "interact");
  bindBtn("btn-light", "flashlight");
  bindBtn("btn-run", "run");

  // Bucle principal
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    Input.update();
    if (Cinematic.active) { Cinematic.update(dt); Cinematic.draw(ctx, canvas.width, canvas.height); }
    else { game.update(dt); game.draw(); }
    pauseBtn.classList.toggle("on", game.state === "playing" && !game.paused && !Cinematic.active);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
