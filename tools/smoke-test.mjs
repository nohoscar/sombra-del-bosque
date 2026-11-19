// Prueba rapida sin navegador: carga el juego con un canvas falso y recorre
// el prologo y la Noche 1 por guion, para atrapar errores de codigo.
// Uso: node tools/smoke-test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "public");
const files = ["js/input.js", "js/difficulty.js", "js/audio.js", "js/cinematic.js", "js/menu.js", "js/td/level.js",
  "js/td/player.js", "js/td/slender.js", "js/td/story.js", "js/td/game.js"];

const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 100 });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const mkCanvas = () => ({ width: 1024, height: 576, getContext: () => ctx2d });
const sandbox = {
  console, Math, Date, performance: { now: () => Date.now() },
  window: { addEventListener() {} },
  document: { createElement: () => mkCanvas(), addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame() {}, setTimeout, clearTimeout,
};
vm.createContext(sandbox);
const src = files.map((f) => readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n") +
  "\n;globalThis.__api = { Input, TDLevel, TDGame, Story, Sound, Cinematic };";
vm.runInContext(src, sandbox, { filename: "juego.js" });
const { Input, TDLevel, TDGame, Story, Cinematic } = sandbox.__api;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  OK   " : "  FALLO ") + msg); if (!cond) fails++; };
const game = new TDGame(mkCanvas());
const step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { Input.update(); game.update(dt); game.draw(); } };
const press = (a) => { Input.press(a); step(1); Input.release(a); };
const tp = (x, y) => { game.player.x = x; game.player.y = y; };
const closeNote = () => { if (game.state === "note") game.resumeFromNote(); };

console.log("\nPROLOGO");
game.beginNight(0);
ok(TDLevel.cols === 24 && TDLevel.rows === 16, "mapa de la casa 24x16");
ok(!TDLevel.circleHitsWall(game.player.x, game.player.y, game.player.r), "el jugador no empieza dentro de una pared");
step(400);
for (const n of TDLevel.notes) ok(!TDLevel.circleHitsWall(n.x, n.y, 18), `pista '${n.id}' alcanzable`);
const lin = TDLevel.batteries[0];
ok(lin && !TDLevel.circleHitsWall(lin.x, lin.y, 18), "linterna alcanzable");
// Ruta real desde el inicio hasta cada cosa (BFS)
const st = TDLevel.tileAtPx(game.player.x, game.player.y);
for (const t of [...TDLevel.notes, lin, TDLevel.exit]) {
  const tt = TDLevel.tileAtPx(t.x, t.y);
  ok(TDLevel.findPath(st.c, st.r, tt.c, tt.r) !== null, `hay camino a (${tt.c},${tt.r})`);
}
tp(TDLevel.exit.x, TDLevel.exit.y); press("interact");
ok(game.state === "playing", "la salida esta cerrada sin pistas");
for (const id of ["contestadora", "dibujo", "caja"]) {
  const n = TDLevel.notes.find((x) => x.id === id);
  tp(n.x, n.y); step(2); press("interact");
  ok(game.state === "note", `abre la pista '${id}'`); closeNote(); step(30);
}
tp(262, 5 * TDLevel.TILE); step(2);
ok(Story.flags.ventana, "susto de la ventana se dispara");
step(200);
tp(lin.x, lin.y); step(3);
ok(Story.flags.linterna && game.player.battery > 0, "recoge la linterna");
tp(TDLevel.exit.x, TDLevel.exit.y); step(2); press("interact");
ok(game.state === "nightcomplete", "sale de la casa");

console.log("\nNOCHE 1");
game.beginNight(1);
ok(game.dormant, "el Esbelto empieza dormido");
step(300);
const n1 = TDLevel.notes;
for (let k = 0; k < 2; k++) { tp(n1[k].x, n1[k].y); step(2); press("interact"); closeNote(); step(5); }
step(60 * 6);
ok(!game.dormant, "despues del primer encuentro, despierta");
let maxT = 0;
for (let i = 0; i < 60 * 20; i++) { Input.keys.right = i % 200 < 100; Input.keys.down = i % 300 < 150; step(1); maxT = Math.max(maxT, game.static); if (game.state !== "playing") break; }
Input.keys = {};
ok(true, `20 s jugando sin errores (estado: ${game.state}, estatica max ${Math.round(maxT)})`);

console.log("\nNOCHE 1: RIO Y BALIZA");
{
  game.beginNight(1);
  ok(TDLevel.water.size > 20 && TDLevel.bridge.size >= 6, `hay rio (${TDLevel.water.size}) y puente (${TDLevel.bridge.size})`);
  const s0 = TDLevel.tileAtPx(TDLevel.start.x, TDLevel.start.y);
  const bz = TDLevel.props.find((q) => q.kind === "baliza");
  for (const t of [...TDLevel.notes.map((n) => n.tile), bz.tile, TDLevel.exit.tile, ...TDLevel.batteries.map((b) => TDLevel.tileAtPx(b.x, b.y))])
    ok(TDLevel.findPath(s0.c, s0.r, t.c, t.r) !== null, `  se llega a (${t.c},${t.r}) cruzando el puente`);
  game.slenders.forEach((s) => { s.x = 40; s.y = 40; s.speed = 0; s.blinkCd = 1e9; });
  for (const n of TDLevel.notes) n.collected = true;
  tp(TDLevel.exit.x, TDLevel.exit.y); step(2); press("interact");
  ok(game.state === "playing", "sin baliza no se puede salir");
  tp(bz.x, bz.y + 30); Input.press("interact"); step(60 * 2.3); Input.release("interact"); step(2);
  ok(bz.lit, "mantener E prende la baliza");
  ok(game.slenders.some((s) => s.state === "chase"), "  y el viene por ti");
  game.slenders.forEach((s) => { s.state = "patrol"; s.detection = 0; });
  tp(TDLevel.exit.x, TDLevel.exit.y); step(2); press("interact");
  ok(game.state === "nightcomplete", `con la baliza prendida, sales (estado: ${game.state})`);
}

console.log("\nGUARDADO A MEDIO CAMINO");
{
  game.clearCheckpoint();
  game.beginNight(2);
  game.slenders.forEach((s) => { s.x = 40; s.y = 40; s.speed = 0; s.blinkCd = 1e9; });
  for (let k = 0; k < 2; k++) { const n = TDLevel.notes[k]; tp(n.x, n.y); step(2); press("interact"); closeNote(); step(3); }
  game._lose(); ok(game.state === "gameover", "mueres");
  game.retry();
  ok(TDLevel.notes.filter((n) => n.collected).length === 2, "al reintentar, conservas las 2 notas");
  game.clearCheckpoint(); game.beginNight(2);
  ok(TDLevel.notes.every((n) => !n.collected), "nueva partida: empieza de cero");
}

console.log("\nNOCHE 2");
game.beginNight(2);
const fog = TDLevel.props[0];
ok(fog && !TDLevel.circleHitsWall(fog.x + 60, fog.y, 18), "la fogata tiene espacio alrededor");
{ const s0 = TDLevel.tileAtPx(game.player.x, game.player.y), ft = TDLevel.tileAtPx(fog.x + 60, fog.y);
  ok(TDLevel.findPath(s0.c, s0.r, ft.c, ft.r) !== null, "hay camino a la fogata"); }
step(120);
game.slenders.forEach((s) => { s.x = 40; s.y = 40; s.speed = 0; s.blinkCd = 1e9; });  // lejos, para probar el guion
tp(fog.x + 120, fog.y); step(3); step(80);
ok(Story.flags.cinta, "la cinta de la fogata suena al acercarse");
for (let k = 0; k < 3; k++) { const n = TDLevel.notes[k]; tp(n.x, n.y); step(2); press("interact"); closeNote(); step(5); }
step(60 * 7);
ok(Story.flags.llamado, "la voz falsa de Tommy te llama");
ok(game.state === "playing", `sigue jugando tras el susto (estado: ${game.state})`);
{
  const cabs = TDLevel.props.filter((q) => q.kind === "cabana");
  ok(cabs.length === 4, "hay 4 cabanas");
  const s0 = TDLevel.tileAtPx(TDLevel.start.x, TDLevel.start.y);
  for (const [i, cb] of cabs.entries()) {
    const dt0 = TDLevel.tileAtPx(cb.door.x, cb.door.y);
    ok(!TDLevel.circleHitsWall(cb.door.x, cb.door.y, 16) && TDLevel.findPath(s0.c, s0.r, dt0.c, dt0.r) !== null, `la puerta de la cabana ${i + 1} se alcanza`);
  }
  for (const n of TDLevel.notes) n.collected = true;
  tp(TDLevel.exit.x, TDLevel.exit.y); step(2); press("interact");
  ok(game.state === "playing", "no puedes salir sin revisar las cabanas");
  for (const [i, cb] of cabs.entries()) {
    tp(cb.door.x, cb.door.y); step(2); press("interact"); step(2);
    ok(!!TDLevel.room, `entras a la cabana ${i + 1}`);
    ok(TDLevel.beds.length === (i === 3 ? 2 : 3), `  tiene ${TDLevel.beds.length} literas`);
    const st = TDLevel.tileAtPx(game.player.x, game.player.y);
    for (const b of TDLevel.beds) {
      const t = TDLevel.tileAtPx(b.x, b.y);
      ok(TDLevel.findPath(st.c, st.r, t.c, t.r) !== null && !TDLevel.circleHitsWall(b.x, b.y, 18), "  litera alcanzable");
      tp(b.x, b.y); step(2); press("interact"); step(3);
    }
    if (i === 3) {
      step(60 * 6);
      ok(game.slenders.length === 1 && game.slenders[0].state === "chase", "en la ultima, el aparece adentro");
      ok(game.state === "playing", "  y te da tiempo de huir");
      game.slenders[0].speed = 0;
    }
    const ex = TDLevel.exit, s2 = TDLevel.tileAtPx(game.player.x, game.player.y), et = TDLevel.tileAtPx(ex.x, ex.y);
    ok(TDLevel.findPath(s2.c, s2.r, et.c, et.r) !== null, "  la puerta del cuarto se alcanza");
    tp(ex.x, ex.y); step(2); press("interact"); step(2);
    ok(!TDLevel.room && cb.checked, "  sales y queda revisada");
  }
  ok(cabs.every((q) => q.checked), "se revisan las 4 cabanas");
  step(60 * 7);
  console.log("    debug:", game.state, "estatica", Math.round(game.static), "atrapado", game.slenders.map((s) => [s.caught, s.state, Math.round(Math.hypot(s.x - game.player.x, s.y - game.player.y))]));
  for (const b of TDLevel.batteries) { const bt = TDLevel.tileAtPx(b.x, b.y); ok(TDLevel.grid[bt.r][bt.c] === 0, "bateria fuera de las paredes"); }
  tp(TDLevel.exit.x, TDLevel.exit.y); step(2); press("interact");
  ok(game.state === "nightcomplete", `con todo revisado, sales del campamento (estado: ${game.state})`);
  game.beginNight(2);
  const s1 = TDLevel.tileAtPx(TDLevel.start.x, TDLevel.start.y);
  for (const n of TDLevel.notes) { const t = TDLevel.tileAtPx(n.x, n.y); ok(TDLevel.findPath(s1.c, s1.r, t.c, t.r) !== null, `nota en (${t.c},${t.r}) se alcanza`); }
  { const t = TDLevel.exit.tile; ok(TDLevel.findPath(s1.c, s1.r, t.c, t.r) !== null, "la salida se alcanza"); }
}

console.log("\nEL ESBELTO");
{
  game.beginNight(3);
  const s = game.slenders[0], p = game.player;
  s.state = "chase"; s.detection = 100;
  ok(s.onLit() === true && s.stun > 0, "la linterna lo congela");
  ok(s.onLit() === false, "no se puede congelar seguido");
  const x0 = s.x; s.update(0.5, p); ok(s.x === x0, "congelado no se mueve");
  // Esconderte justo enfrente: te encuentra
  s.stun = 0; s.state = "chase"; s.detection = 100;
  p.hidden = true; s.lastX = p.x; s.lastY = p.y; s.x = p.x + 20; s.y = p.y;
  s.update(1 / 60, p);
  ok(s.caught, "si te escondes frente a el, te encuentra");
  // No lo miras: aparece mas cerca
  p.hidden = false; s.caught = false; s.state = "chase"; s.stun = 0; s.blinkCd = 0;
  let moved = 0;
  for (let k = 0; k < 20 && !moved; k++) {
    const a = (Math.random() - 0.5) * 1.2; p.fx = -1; p.fy = 0; s.x = p.x + Math.cos(a) * 450; s.y = p.y + Math.sin(a) * 450;
    if (TDLevel.circleHitsWall(s.x, s.y, 14)) continue;
    const before = Math.hypot(s.x - p.x, s.y - p.y); s.blinkCd = 0;
    if (s.blink(p, false, 1 / 60)) moved = before - Math.hypot(s.x - p.x, s.y - p.y);
  }
  ok(moved > 50, `si no lo miras, aparece mas cerca (${Math.round(moved)} px)`);
  s.blinkCd = 0; ok(s.blink(p, true, 1 / 60) === null, "si lo miras, no se mueve de golpe");
}
ok(TDLevel.prints !== undefined, "datos de huellas listos");
game.beginNight(1);
ok(TDLevel.prints.length > 40 && TDLevel.prints.some((f) => f.big), `Noche 1 tiene rastro de huellas (${TDLevel.prints.length})`);

console.log("\nNOCHES 3-5 (carga y 10 s)");
for (let i = 3; i < TDLevel.totalNights; i++) { game.beginNight(i); step(600); ok(true, `${TDLevel.label} corre`); }

console.log("\nMENU");
{
  const MS = vm.runInContext("MenuScene", sandbox);
  const cv = mkCanvas(); MS.init(cv);
  for (const prog of [0, 1, 3]) { MS.progress = prog; for (let i = 0; i < 120; i++) { MS.update(1 / 60); MS.draw(cv.getContext()); } }
  ok(true, "el menu se dibuja con avance 0, 1 y 3");
  MS.slender = null; MS.nextSlender = 0; MS.mx = -500; MS.my = -500; MS.moved = 99; MS.update(1 / 60);
  ok(!!MS.slender, "el Esbelto aparece entre los pinos");
  for (let i = 0; i < 90; i++) MS.update(1 / 60);
  const s = MS.slender, par = (MS.mx / 1024 - 0.5) * 24;
  MS.mx = s.x - par; MS.my = s.y - s.h * 0.6; MS.moved = 5; MS.update(1 / 60);
  ok(!MS.slender && MS.glitch > 0, "si lo alumbras, desaparece con chispazo");
}

console.log("\nCINEMATICAS");
const ctx = mkCanvas().getContext();
for (const [name, sc] of [["OPENING", Cinematic.OPENING], ["LETRERO", Cinematic.titleCard({ title: "El Campamento", text: "linea", stamp: "01:17", label: "NOCHE 2" })], ["MUERTE", Cinematic.DEATH], ...Object.entries(Cinematic.INTERLUDES).map(([k, v]) => ["INTER " + k, v]), ["ENDING", Cinematic.ENDING]]) {
  let done = false; Cinematic.play(sc, () => (done = true));
  for (let i = 0; i < 60 * 60 && !done; i++) { Input.update(); Cinematic.update(1 / 60); Cinematic.draw(ctx, 1024, 576); }
  ok(done, `${name} termina`);
}

console.log(fails ? `\n${fails} FALLO(S)\n` : "\nTodo bien.\n");
process.exit(fails ? 1 : 0);
