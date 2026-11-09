// Local server that mirrors Vercel: static files from the project root, /api/* from api/*.js.
// Usage: npm run dev   (reads .env if present)   |   npm run dev:mock
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".env"))) {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
const port = Number(process.env.PORT || 3000);

http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.startsWith("/api/")) {
    const name = p.slice(5).replace(/[^a-z0-9-]/gi, "");
    const file = path.join(root, "api", name + ".js");
    if (!name || name.startsWith("_") || !fs.existsSync(file)) { res.statusCode = 404; return res.end("{}"); }
    const mod = await import(url.pathToFileURL(file).href);
    return mod.default(req, res);
  }
  let file = path.join(root, p === "/" ? "index.html" : p);
  if (!file.startsWith(root) || file.includes(`${path.sep}api${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Proofline running at http://localhost:${port}`));
