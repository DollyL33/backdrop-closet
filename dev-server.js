// Local server for `npm run dev`. Serves public/ and runs the api/ functions
// the way Vercel does. Not deployed.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.resolve("public");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const ROUTES = {
  "/api/read-clothes": () => import("./api/read-clothes.js"),
};

async function runApi(req, res, load) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: { ...req.headers, "x-forwarded-for": req.socket.remoteAddress },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const handler = (await load())[req.method];
  const response = handler ? await handler(request) : new Response("Method not allowed", { status: 405 });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function sendFile(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(PUBLIC, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

http
  .createServer(async (req, res) => {
    const load = ROUTES[new URL(req.url, "http://x").pathname];
    try {
      await (load ? runApi(req, res, load) : sendFile(req, res));
    } catch (err) {
      console.error(err);
      res.writeHead(500).end("Server error");
    }
  })
  .on("error", (err) => {
    if (err.code !== "EADDRINUSE") throw err;
    console.error(`Port ${PORT} is busy. Closet may already be running in another terminal (stop it with Ctrl+C), or run: PORT=3001 npm run dev`);
    process.exit(1);
  })
  .listen(PORT, () => console.log(`Backdrop Closet is running at http://localhost:${PORT}`));
