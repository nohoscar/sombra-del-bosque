// Servidor estático mínimo para desarrollo (sin dependencias).
// Necesario para que el navegador cargue los .mp3 vía fetch (file:// los bloquea).
// Uso:  node tools/serve.mjs   ->   http://localhost:8000
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PORT = process.env.PORT || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = path.join(ROOT, path.normalize(urlPath));

    // Evita salir de la raíz
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404); return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end("Server error");
  }
}).listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
