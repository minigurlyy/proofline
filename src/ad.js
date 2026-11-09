// Ad renderer: generated image underneath, brand-kit typography and copy set in code on top.
import { FONT_PAIRS, loadPair } from "./fonts.js";

export const FMT = {
  feed: { name: "Feed 4:5", ratio: "4x5", px: [1080, 1350], limit: 48 },
  story: { name: "Story 9:16", ratio: "9x16", px: [1080, 1920], limit: 40 },
  banner: { name: "Banner 1.91:1", ratio: "1200x628", px: [1200, 628], limit: 40 },
};
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---- color ---- */
export function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return [0, 0, 0]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function lum([r, g, b]) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
export function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);

export function textColors(kit, tone) {
  const p = kit.palette || {};
  const light = hexRgb(p.light || "#ffffff"), ink = hexRgb(p.ink || "#111111");
  return tone === "light" ? { txt: light, scrim: ink } : { txt: ink, scrim: light };
}

export function adHTML(v, kit, run, opts = {}) {
  const pair = loadPair(kit.fontPair);
  const p = kit.palette || {};
  const { txt, scrim } = textColors(kit, v.textTone);
  const accent = hexRgb(p.accent || "#f0a43a");
  const ctaInk = contrast(accent, hexRgb(p.ink || "#111")) >= contrast(accent, hexRgb(p.light || "#fff")) ? p.ink : p.light;
  const logo = run.assets?.find((a) => a.role === "logo");
  const logoFilter = kit.logoColor === "original" ? "none" : v.textTone === "light" ? "brightness(0) invert(1)" : "brightness(0)";
  const style = [
    `--p-bg:${v.image || contrast(txt, hexRgb(p.bg)) >= 3 ? p.bg : "rgb(" + scrim.join(",") + ")"}`, `--p-accent:${p.accent}`, `--cta-ink:${ctaInk}`, `--txt:rgb(${txt.join(",")})`, `--srgb:${scrim.map(Math.round).join(",")}`,
    `--scrim:${v.scrim ?? 0.55}`, `--fd:'${pair.display}',Georgia,serif`, `--fb:'${pair.body}',system-ui,sans-serif`, `--fdw:${pair.dw}`, `--fds:${pair.ds}`,
  ].join(";");
  const cls = ["ad", "f-" + v.fmt, "L-" + (v.layout || "top"), opts.safe ? "show-safe" : ""].join(" ");
  const legal = (run.plan?.brief?.mandatory || []).filter(Boolean).join(" ");
  const brand = logo ? `<span class="brand"><img src="${logo.data}" alt="" style="filter:${logoFilter}"></span>` : `<span class="brand">${esc(kit.name || run.plan?.brief?.brand || "")}</span>`;
  return `<div class="${cls}" style="${style}" role="img" aria-label="${esc(FMT[v.fmt].name)} ad: ${esc(v.headline)}">
    ${v.image ? `<img class="ph" src="${v.image}" alt="">` : ""}<div class="scrim"></div>${v.layout !== "bottom" ? '<div class="ft"></div>' : ""}
    <div class="in"><div class="copy">${brand}<p class="hl">${esc(v.headline)}</p>${v.sub && (v.fmt !== "story" || v.layout !== "center") ? `<p class="sub">${esc(v.sub)}</p>` : ""}</div>
    <div class="adfoot"><span class="cta">${esc(v.cta)}</span>${legal ? `<span class="legal">${esc(legal)}</span>` : ""}</div></div>
    ${v.fmt === "story" ? '<div class="safe t"></div><div class="safe b"></div>' : ""}</div>`;
}

/* ---- measured contrast of the copy against the actual image ---- */
const imgCache = new Map();
function loadImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const pr = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  imgCache.set(src, pr); return pr;
}
export async function measureContrast(v, kit) {
  if (!v.image) return null;
  const img = await loadImg(v.image);
  const W = 90, H = Math.round(W * img.naturalHeight / img.naturalWidth) || 110;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H);
  let x0 = 0, x1 = W, y0 = 0, y1 = H;
  if (v.fmt === "banner") { x1 = Math.round(W * 0.55); y0 = Math.round(H * 0.2); y1 = Math.round(H * 0.8); }
  else if (v.layout === "bottom") { y0 = Math.round(H * 0.6); }
  else if (v.layout === "center") { y0 = Math.round(H * 0.38); y1 = Math.round(H * 0.62); x0 = Math.round(W * 0.15); x1 = Math.round(W * 0.85); }
  else { y0 = Math.round(H * (v.fmt === "story" ? 0.14 : 0.06)); y1 = Math.round(H * 0.36); }
  const d = x.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  // judge against the brighter/darker 85th percentile, not the average: text breaks on the busy spots
  const { txt, scrim } = textColors(kit, v.textTone);
  const a = (v.scrim ?? 0.55) * 0.8;
  let worst = 99, list = [];
  for (let i = 0; i < d.length; i += 4) list.push(contrast(txt, mix([d[i], d[i + 1], d[i + 2]], scrim, a)));
  list.sort((p, q) => p - q);
  worst = list[Math.floor(list.length * 0.15)] ?? 99;
  return Math.round(worst * 10) / 10;
}

/* ---- export ---- */
export async function renderPng(v, kit, run, stage) {
  const [w, h] = FMT[v.fmt].px;
  stage.innerHTML = `<div style="width:${w}px;height:${h}px">${adHTML(v, kit, run)}</div>`;
  const node = stage.firstElementChild.firstElementChild;
  node.style.width = w + "px"; node.style.height = h + "px"; node.style.borderRadius = "0";
  await document.fonts.ready;
  await Promise.all([...node.querySelectorAll("img")].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
  const blob = await window.htmlToImage.toBlob(node, { width: w, height: h, pixelRatio: 1, cacheBust: false });
  stage.innerHTML = "";
  return blob;
}
export { FONT_PAIRS };
