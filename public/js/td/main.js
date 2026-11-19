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
    if (!startScreen.classList.contains("hidden")) Sound.menuStart();
    window.removeEventListener("pointerdown", initAudioOnce);
    window.removeEventListener("keydown", initAudioOnce);
  };
  window.addEventListener("pointerdown", initAudioOnce);
  window.addEventListener("keydown", initAudioOnce);
  MenuScene.init(canvas);

  // Paneles del menu (dificultad y controles)
  const menuMain = document.querySelector(".menu-left");
  const openPanel = (id) => { menuMain.classList.add("hidden"); show($(id)); };
  const closePanels = () => { hide($("panel-diff")); hide($("panel-controls")); menuMain.classList.remove("hidden"); };
  $("diff-open").addEventListener("click", () => openPanel("panel-diff"));
  $("controls-open").addEventListener("click", () => openPanel("panel-controls"));
  // Menos destellos: para quien es sensible a las luces que parpadean
  const refreshFlash = () => { $("flash-current").textContent = Settings.lessFlash ? "MENOS" : "NORMAL"; };
  $("flash-toggle").addEventListener("click", () => { Settings.setLessFlash(!Settings.lessFlash); refreshFlash(); });
  refreshFlash();
  document.querySelectorAll(".panel-back").forEach((b) => b.addEventListener("click", closePanels));
  const backToMenu = () => { closePanels(); show(startScreen); refreshContinue(); Sound.menuStart(); };

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
    $("diff-current").textContent = Difficulty.get().label;
  };
  diffBtns.forEach((b) => b.addEventListener("click", () => setDiff(b.dataset.diff)));
  setDiff("normal");

  // Guardado
  const SAVE_KEY = "sombra_historia_v1";
  const loadProgress = () => {
    const v = parseInt(localStorage.getItem(SAVE_KEY) || "0", 10);
    return isNaN(v) ? 0 : Math.max(0, Math.min(v, TDLevel.totalNights - 1));
  };
  const saveProgress = (n) => { if (n > loadProgress()) localStorage.setItem(SAVE_KEY, String(n)); };
  const continueBtn = $("continue-btn");
  const refreshContinue = () => {
    const u = loadProgress();
    MenuScene.progress = u;
    if (u > 0) { continueBtn.textContent = `CONTINUAR (${TDLevel.getInfo(u).label})`; show(continueBtn); }
    else hide(continueBtn);
  };
  refreshContinue();

  // Hora que marca la cinta en cada capitulo
  const STAMPS = ["MAR 17 NOV 1998  11:48 p.m.", "MIE 18 NOV 1998  12:31 a.m.", "MIE 18 NOV 1998  01:17 a.m.",
    "MIE 18 NOV 1998  02:09 a.m.", "MIE 18 NOV 1998  03:33 a.m.", "MIE 18 NOV 1998  05:58 a.m."];

  // Entre capitulos: narracion (si hay), luego el letrero de cinta, y el juego entra desde negro
  function showNightIntro(i) {
    const info = TDLevel.getInfo(i);
    const card = Cinematic.titleCard({
      label: info.num === 0 ? "PROLOGO" : `NOCHE ${info.num} DE ${TDLevel.totalNights - 1}`,
      title: info.name, text: info.intro || "", stamp: STAMPS[i] || "", hold: 6,
    });
    Cinematic.play([...(Cinematic.INTERLUDES[i] || []), ...card], () => game.beginNight(i));
  }

  // Eventos del juego
  game.on("note", (doc) => {
    const kind = doc.kind || "diario";
    notePaper.className = "note-paper note-" + kind;
    noteTitle.textContent = (KIND[kind] ? KIND[kind] + "  \u2014  " : "") + (doc.title || "");
    currentText = doc.text;
    show(noteScreen);
    typeNote(noteText, doc.text);
    if (doc.voice && Sound.hasVoice(doc.voice)) Sound.playVoice(doc.voice);
    else Sound.startReading();
  });
  game.on("nightcomplete", (d) => {
    saveProgress(d.completed);
    const done = TDLevel.getInfo(d.completed - 1);
    const card = Cinematic.titleCard({
      label: d.completed === 1 ? "PROLOGO" : "SOBREVIVISTE",
      title: d.completed === 1 ? "Tommy no esta" : `${done.label} superada`,
      text: done.outro || "", stamp: "", hold: 6,
      voice: TDLevel._defs[d.completed - 1].outroVoice,
    });
    Cinematic.play(card, () => showNightIntro(d.completed));
  });
  game.on("gameover", (d) => {
    Cinematic.play(Cinematic.DEATH, () => {
      gameoverText.textContent = `Caiste en ${TDLevel.getInfo(d.night - 1).label}. El bosque te reclamo, como a los demas.`;
      show(gameoverScreen);
    });
  });
  game.on("win", () => {
    Cinematic.play(Cinematic.ENDING, () => { winText.textContent = TDLevel.finalText; show(winScreen); });
  });

  // Botones
  $("start-btn").addEventListener("click", () => { hide(startScreen); Sound.menuStop(); game.clearCheckpoint(); Cinematic.play(Cinematic.OPENING, () => showNightIntro(0)); });
  continueBtn.addEventListener("click", () => { hide(startScreen); Sound.menuStop(); showNightIntro(loadProgress()); });
  $("retry-btn").addEventListener("click", () => { hide(gameoverScreen); game.retry(); });
  nightBtn.addEventListener("click", () => Sound.stopVoice());
  $("win-btn").addEventListener("click", () => { hide(winScreen); game.state = "menu"; backToMenu(); });
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
    hide(pauseScreen); Sound.stopAmbience(); game.state = "menu"; backToMenu();
  });

  // Si cambias de pestana o llega una llamada, el juego se pausa solo
  document.addEventListener("visibilitychange", () => { if (document.hidden) doPause(); });
  window.addEventListener("blur", () => doPause());

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
    else {
      game.update(dt); game.draw();
      if (game.state === "menu") { MenuScene.update(dt); MenuScene.draw(ctx); }
    }
    pauseBtn.classList.toggle("on", game.state === "playing" && !game.paused && !Cinematic.active);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Para probar: abrir con #prueba-1 empieza directo en esa noche (0 = prologo).
  // #prueba-cabana entra a la ultima cabana; #prueba-esbelto lo pone frente a tu linterna;
  // #prueba-letrero muestra el letrero de la Noche 2.
  const h = location.hash || "";
  const m = /^#prueba-(\d)$/.exec(h);
  if (m) { hide(startScreen); game.beginNight(Math.min(+m[1], TDLevel.totalNights - 1)); }
  if (h === "#prueba-cabana") {
    hide(startScreen); game.beginNight(2);
    const cabs = TDLevel.props.filter((q) => q.kind === "cabana");
    cabs.slice(0, 3).forEach((q) => (q.checked = true));
    game.enterRoom(cabs[3]); game.player.flashlight = true; game.fadeIn = 0;
  }
  if (h === "#prueba-esbelto") {
    hide(startScreen); game.beginNight(3); game.fadeIn = 0;
    const p = game.player, s = game.slenders[0];
    p.flashlight = true; p.fx = 1; p.fy = 0;
    for (let d = 200; d > 90; d -= 10) if (!TDLevel.circleHitsWall(p.x + d, p.y, 14)) { s.x = p.x + d; s.y = p.y; break; }
    s.state = "chase"; s.blinkCd = 999; s.stunCd = 999; s.speed = 0; s.vis = 1; game.faceCd = 999;
  }
  if (h === "#prueba-rio") {
    hide(startScreen); game.beginNight(1); game.fadeIn = 0;
    const [r, c] = [...TDLevel.bridge][0].split(",").map(Number);
    const pt = TDLevel.center(c + 1, r - 2);
    game.player.x = pt.x; game.player.y = pt.y; game.player.flashlight = true; game.player.fx = 0; game.player.fy = 1;
    game._camera(true);
  }
  if (h === "#prueba-letrero") {
    hide(startScreen);
    Cinematic.play(Cinematic.titleCard({ label: "NOCHE 2 DE 5", title: "El Campamento", text: TDLevel._defs[2].intro, stamp: STAMPS[2] }), () => {});
  }
});
