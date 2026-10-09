// Serveur local : fichiers de public/ + /api/room, avec les salles en mémoire (ou Supabase si HM_SECRET est défini).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/room.js";

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const port = +(process.env.PORT || 3000);

createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/room") return handler(req, res);
  let f = path.join(PUB, decodeURIComponent(u.pathname));
  if (!f.startsWith(PUB)) { res.statusCode = 403; return res.end(); }
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!existsSync(f)) { res.statusCode = 404; return res.end("introuvable"); }
  res.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream");
  res.end(readFileSync(f));
}).listen(port, () => console.log(`http://127.0.0.1:${port}`));
