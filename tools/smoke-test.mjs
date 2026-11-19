// Prueba rapida sin navegador: carga el juego con un canvas falso y recorre
// el prologo y la Noche 1 por guion, para atrapar errores de codigo.
// Uso: node tools/smoke-test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "public");
const files = ["js/input.js", "js/difficulty.js", "js/audio.js", "js/cinematic.js", "js/td/level.js",
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

console.log("\nNOCHE 2");
game.beginNight(2);
const fog = TDLevel.props[0];
ok(fog && !TDLevel.circleHitsWall(fog.x + 60, fog.y, 18), "la fogata tiene espacio alrededor");
{ const s0 = TDLevel.tileAtPx(game.player.x, game.player.y), ft = TDLevel.tileAtPx(fog.x + 60, fog.y);
  ok(TDLevel.findPath(s0.c, s0.r, ft.c, ft.r) !== null, "hay camino a la fogata"); }
step(120);
game.slenders.forEach((s) => { s.x = 40; s.y = 40; s.speed = 0; });  // lejos, para probar el guion
tp(fog.x + 120, fog.y); step(3); step(80);
ok(Story.flags.cinta, "la cinta de la fogata suena al acercarse");
for (let k = 0; k < 3; k++) { const n = TDLevel.notes[k]; tp(n.x, n.y); step(2); press("interact"); closeNote(); step(5); }
step(60 * 7);
ok(Story.flags.llamado, "la voz falsa de Tommy te llama");
ok(game.state === "playing", `sigue jugando tras el susto (estado: ${game.state})`);

console.log("\nNOCHES 3-5 (carga y 10 s)");
for (let i = 3; i < TDLevel.totalNights; i++) { game.beginNight(i); step(600); ok(true, `${TDLevel.label} corre`); }

console.log("\nCINEMATICAS");
const ctx = mkCanvas().getContext();
for (const [name, sc] of [["OPENING", Cinematic.OPENING], ...Object.entries(Cinematic.INTERLUDES).map(([k, v]) => ["INTER " + k, v]), ["ENDING", Cinematic.ENDING]]) {
  let done = false; Cinematic.play(sc, () => (done = true));
  for (let i = 0; i < 60 * 60 && !done; i++) { Input.update(); Cinematic.update(1 / 60); Cinematic.draw(ctx, 1024, 576); }
  ok(done, `${name} termina`);
}

console.log(fails ? `\n${fails} FALLO(S)\n` : "\nTodo bien.\n");
process.exit(fails ? 1 : 0);
