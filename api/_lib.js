// Shared server helpers: config, run tokens and limits, Claude, fal, mock mode.
import crypto from "node:crypto";

const env = process.env;
export const MOCK = env.MOCK === "1" || !env.ANTHROPIC_API_KEY || !env.FAL_KEY;
const CLAUDE_MODEL = env.CLAUDE_MODEL || "claude-sonnet-5-5";
const FAL_IMAGE_MODEL = env.FAL_IMAGE_MODEL || "fal-ai/flux-2-pro";
const FAL_EDIT_MODEL = env.FAL_EDIT_MODEL || "fal-ai/nano-banana-2/edit";
export const MODELS = { claude: CLAUDE_MODEL, image: FAL_IMAGE_MODEL, edit: FAL_EDIT_MODEL };

/* ---------------- http ---------------- */
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
export async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const t = Buffer.concat(chunks).toString("utf8");
  return t ? JSON.parse(t) : {};
}
export function handler(fn) {
  return async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
    try {
      const b = await body(req);
      const out = await fn(b, req);
      send(res, 200, out);
    } catch (e) {
      const status = e.status || 500;
      console.error(e);
      send(res, status, { error: e.publicMessage || "Something went wrong on the server. Try again." });
    }
  };
}
function fail(status, publicMessage) { const e = new Error(publicMessage); e.status = status; e.publicMessage = publicMessage; return e; }

/* ---------------- storage for limits ---------------- */
let redis = null;
const rUrl = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
const rTok = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
if (rUrl && rTok) {
  try { const { Redis } = await import("@upstash/redis"); redis = new Redis({ url: rUrl, token: rTok }); } catch { redis = null; }
}
const mem = new Map();
async function incr(key, ttlSec) {
  if (redis) { const n = await redis.incr(key); if (n === 1) await redis.expire(key, ttlSec); return n; }
  const now = Date.now(), cur = mem.get(key);
  if (!cur || cur.exp < now) { mem.set(key, { n: 1, exp: now + ttlSec * 1000 }); return 1; }
  cur.n++; return cur.n;
}

/* ---------------- run tokens ---------------- */
const SECRET = env.RUN_SECRET || crypto.createHash("sha256").update((env.ANTHROPIC_API_KEY || "") + (env.FAL_KEY || "") + "proofline").digest("hex");
const b64u = (s) => Buffer.from(s).toString("base64url");
function sign(payload) { const p = b64u(JSON.stringify(payload)); return p + "." + crypto.createHmac("sha256", SECRET).update(p).digest("base64url"); }
function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) throw fail(401, "Your session expired. Start a new run.");
  const [p, sig] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) throw fail(401, "Your session expired. Start a new run.");
  const data = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (data.exp < Date.now()) throw fail(401, "This run timed out after an hour. Start a new run.");
  return data;
}
function ipOf(req) { return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim(); }
const today = () => new Date().toISOString().slice(0, 10);

export async function openSession(b, req) {
  const owner = !!env.OWNER_PASSCODE && b.passcode === env.OWNER_PASSCODE;
  const perDay = Number(env.LIVE_RUNS_PER_DAY || 20), perIp = Number(env.LIVE_RUNS_PER_IP || 2);
  let left = null;
  if (!owner && !MOCK) {
    const d = today(), ip = crypto.createHash("sha256").update(ipOf(req)).digest("hex").slice(0, 16);
    const n = await incr(`live:${d}`, 86400), m = await incr(`live:${d}:${ip}`, 86400);
    if (n > perDay) throw fail(429, "Today's live runs are used up. Watch an example run, or come back tomorrow.");
    if (m > perIp) throw fail(429, `You've used your ${perIp} live runs for today. Watch an example run, or come back tomorrow.`);
    left = Math.max(0, perIp - m);
  }
  const token = sign({ id: crypto.randomUUID(), owner, exp: Date.now() + 3600e3, img: owner ? 1e6 : 24, ai: owner ? 1e6 : 30 });
  return { token, owner, mode: MOCK ? "mock" : "live", left, limits: { perDay, perIp }, persistentLimits: !!redis, models: MODELS };
}
export async function spend(req, kind) {
  const t = verify(req.headers["x-run-token"]);
  if (t.owner) return t;
  const n = await incr(`run:${t.id}:${kind}`, 3600);
  if (n > t[kind]) throw fail(429, kind === "img" ? "This run hit its image limit. Start a new run to keep going." : "This run hit its AI limit. Start a new run to keep going.");
  return t;
}

/* ---------------- Claude ---------------- */
let anthropic = null;
async function claudeClient() {
  if (!anthropic) { const { default: Anthropic } = await import("@anthropic-ai/sdk"); anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }); }
  return anthropic;
}
function parseDataUrl(d) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(d || "");
  if (!m) return null;
  return { media_type: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2] };
}
export function extractJson(t) {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < s) throw fail(502, "The AI's answer came back in a format I couldn't read. Try again.");
  return JSON.parse(t.slice(s, e + 1));
}
export async function askClaude({ system, text, images = [], maxTokens = 3000 }) {
  const c = await claudeClient();
  const content = [];
  for (const im of images) { const p = parseDataUrl(im.data || im); if (p) { if (im.label) content.push({ type: "text", text: im.label }); content.push({ type: "image", source: { type: "base64", ...p } }); } }
  content.push({ type: "text", text });
  const r = await c.messages.create({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content }] });
  const out = r.content.filter((x) => x.type === "text").map((x) => x.text).join("");
  return extractJson(out);
}

/* ---------------- fal ---------------- */
let falMod = null;
async function falClient() {
  if (!falMod) { const { fal } = await import("@fal-ai/client"); fal.config({ credentials: env.FAL_KEY }); falMod = fal; }
  return falMod;
}
const FLUX_SIZE = { feed: { width: 1024, height: 1280 }, story: { width: 800, height: 1424 }, banner: { width: 1440, height: 752 } };
const EDIT_AR = { feed: "4:5", story: "9:16", banner: "16:9" };
async function toFalUrl(fal, ref) {
  if (/^https?:\/\//.test(ref)) return ref;
  const p = parseDataUrl(ref);
  if (!p) throw fail(400, "One of the reference images couldn't be read.");
  const blob = new Blob([Buffer.from(p.data, "base64")], { type: p.media_type });
  return await fal.storage.upload(blob);
}
async function urlToDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw fail(502, "The image was made but couldn't be downloaded. Try again.");
  const type = r.headers.get("content-type") || "image/jpeg";
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}
export async function falImage({ prompt, fmt, refs = [], seed }) {
  const fal = await falClient();
  let model, input;
  if (refs.length) {
    model = FAL_EDIT_MODEL;
    const image_urls = await Promise.all(refs.slice(0, 6).map((r) => toFalUrl(fal, r)));
    input = { prompt, image_urls, aspect_ratio: EDIT_AR[fmt] || "auto", resolution: "1K", output_format: "jpeg", num_images: 1 };
  } else {
    model = FAL_IMAGE_MODEL;
    input = { prompt, image_size: FLUX_SIZE[fmt] || FLUX_SIZE.feed, output_format: "jpeg", safety_tolerance: "2", enable_safety_checker: true };
    if (Number.isInteger(seed)) input.seed = seed;
  }
  let r;
  try { r = await fal.subscribe(model, { input, logs: false }); }
  catch (e) { console.error(e); throw fail(502, "The image model didn't respond. Try again in a moment."); }
  const img = r?.data?.images?.[0];
  if (!img?.url) throw fail(502, "The image model returned no image. Try a different note or try again.");
  return { image: await urlToDataUrl(img.url), model, seed: r.data.seed ?? null };
}

/* ---------------- mock mode ---------------- */
const MOCK_SIZE = { feed: [1024, 1280], story: [800, 1424], banner: [1440, 752] };
export function mockImage(fmt, palette = {}, salt = "x", extra = "") {
  const [w, h] = MOCK_SIZE[fmt] || MOCK_SIZE.feed;
  let s = [...salt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const a = palette.accent || "#f0a43a", b = palette.bg || "#123f3c", c = palette.accent2 || "#d6eadf";
  const blobs = Array.from({ length: 7 }, () => `<circle cx="${(rnd() * w) | 0}" cy="${(rnd() * h) | 0}" r="${(80 + rnd() * 260) | 0}" fill="${[a, c, "#ffffff"][(rnd() * 3) | 0]}" opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"/>`).join("");
  const ice = /ice/i.test(extra) ? Array.from({ length: 3 }, (_, i) => `<rect x="${w * (0.15 + i * 0.3)}" y="${h * 0.3 + i * 40}" width="${w * 0.12}" height="${w * 0.12}" rx="18" fill="#e9f6fb" opacity=".85" transform="rotate(${-15 + i * 14} ${w * (0.2 + i * 0.3)} ${h * 0.35})"/>`).join("") : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient><filter id="f"><feGaussianBlur stdDeviation="40"/></filter></defs><rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#f)">${blobs}</g><rect x="${w * 0.38}" y="${h * 0.42}" width="${w * 0.24}" height="${h * 0.42}" rx="${w * 0.05}" fill="#7a3f14" opacity=".9"/><rect x="${w * 0.38}" y="${h * 0.56}" width="${w * 0.24}" height="${h * 0.1}" fill="#f5f0e6"/>${ice}</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
