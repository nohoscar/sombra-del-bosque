// Arranque del prototipo cenital: bucle, overlays y lectura de notas.
window.addEventListener("load", () => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  Input.init();
  const game = new TDGame(canvas);

  const startScreen = document.getElementById("start-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const winScreen = document.getElementById("win-screen");
  const noteScreen = document.getElementById("note-screen");
  const notePaper = document.getElementById("note-paper");
  const noteTitle = document.getElementById("note-title");
  const noteText = document.getElementById("note-text");

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

  // Lectura letra por letra
  let typeTimer = null, noteTyping = false, currentText = "";
  const KIND = { diario: "DIARIO", policial: "REPORTE", grabacion: "GRABACION", dibujo: "DIBUJO", cripta: "INSCRIPCION", aviso: "CARTEL" };
  const typeNote = (el, text) => {
    clearInterval(typeTimer); el.textContent = ""; noteTyping = true; let i = 0;
    typeTimer = setInterval(() => {
      if (i < text.length) { el.textContent += text[i++]; if (i % 2 === 0) Sound.readTick(); }
      else { clearInterval(typeTimer); noteTyping = false; }
    }, 26);
  };

  game.on("note", (doc) => {
    const kind = doc.kind || "diario";
    notePaper.className = "note-paper note-" + kind;
    noteTitle.textContent = (KIND[kind] ? KIND[kind] + "  \u2014  " : "") + (doc.title || "");
    currentText = doc.text;
    show(noteScreen);
    typeNote(noteText, doc.text);
    Sound.startReading();
  });
  game.on("gameover", () => show(gameoverScreen));
  game.on("win", () => show(winScreen));

  document.getElementById("start-btn").addEventListener("click", () => { hide(startScreen); game.start(); });
  document.getElementById("retry-btn").addEventListener("click", () => { hide(gameoverScreen); game.start(); });
  document.getElementById("win-btn").addEventListener("click", () => { hide(winScreen); game.start(); });
  document.getElementById("note-btn").addEventListener("click", () => {
    if (noteTyping) { clearInterval(typeTimer); noteText.textContent = currentText; noteTyping = false; return; }
    hide(noteScreen); Sound.stopReading(); game.resumeFromNote();
  });

  window.addEventListener("keydown", (e) => { if (e.code === "KeyM") Sound.toggleMute(); });

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    Input.update();
    game.update(dt);
    game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
