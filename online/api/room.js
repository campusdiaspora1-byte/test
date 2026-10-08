// API des salles (fonction Vercel). GET : vue de la salle. POST : action.
import { toJSON } from "../lib/engine.mjs";
import { HttpError, chat, createRoom, joinRoom, rematch, respond, roomView, setDeck, surrender } from "../lib/rooms.mjs";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    let out;
    if (req.method === "GET") {
      const u = new URL(req.url, "http://x");
      out = await roomView(u.searchParams.get("code"), u.searchParams.get("token"), +(u.searchParams.get("from") || 0), +(u.searchParams.get("v") || 0));
    } else if (req.method === "POST") {
      const b = await readBody(req);
      switch (b.action) {
        case "create": out = await createRoom(b.name); break;
        case "join": out = await joinRoom(b.code, b.name, b.token); break;
        case "deck": out = await setDeck(b.code, b.token, b.deck); break;
        case "respond": out = await respond(b.code, b.token, b.response); break;
        case "surrender": out = await surrender(b.code, b.token); break;
        case "rematch": out = await rematch(b.code, b.token); break;
        case "chat": out = await chat(b.code, b.token, b.text); break;
        default: throw new HttpError(400, "Action inconnue.");
      }
    } else throw new HttpError(405, "Méthode non autorisée.");
    res.statusCode = 200;
    res.end(toJSON(out));
  } catch (e) {
    res.statusCode = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error(e);
    res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : "Erreur du serveur : " + e.message }));
  }
}
