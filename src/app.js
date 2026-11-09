import { FMT, esc, adHTML, measureContrast, renderPng, hexRgb, contrast } from "./ad.js";
import { FONT_PAIRS, loadPair } from "./fonts.js";
import { EXAMPLE_BRIEFS } from "./examples.js";

const $ = (id) => document.getElementById(id);
const STEPS = [["Brief", "you"], ["Plan", "you"], ["Directions", "you"], ["Generate", "agent"], ["Review", "you"], ["Deliver", "agent"]];
const ROLES = { product: "Product photo", logo: "Logo", style: "Style reference" };
const params = new URLSearchParams(location.search);
if (params.get("record") === "1") document.body.classList.add("record");
if (params.get("owner")) { try { localStorage.setItem("pl-owner", params.get("owner")); } catch {} params.delete("owner"); history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "")); }
const ownerPass = (() => { try { return localStorage.getItem("pl-owner") || ""; } catch { return ""; } })();

let S;
function fresh() {
  return { v: 2, mode: null, token: null, owner: false, step: 1, maxStep: 1, brief: "", assets: [], plan: null, kit: null, answers: {},
    formats: { feed: true, story: true, banner: true }, directions: [], gen: {}, variants: [], sel: null, log: [], t0: Date.now(), images: 0, models: null };
}

/* ---------------- utilities ---------------- */
function toast(msg, ms = 4200) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function stamp() { const s = Math.round((Date.now() - S.t0) / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function log(who, text) { S.log.push({ who, text, t: stamp(), step: S.step }); renderLog(); }
function renderLog(upTo) {
  const items = S.log.filter((e) => upTo == null || e.step <= upTo);
  $("log").innerHTML = items.map((e) => `<li class="${e.who}"><time>${e.t}</time><span><i class="who ${e.who}"></i>${esc(e.text)}</span></li>`).join("");
  $("log").scrollTop = $("log").scrollHeight;
  $("cAgent").textContent = "agent " + items.filter((e) => e.who === "agent").length;
  $("cYou").textContent = "you " + items.filter((e) => e.who === "you").length;
}
function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "brand"; }
const fmtsOn = () => Object.keys(FMT).filter((f) => S.formats[f]);

async function api(name, body) {
  const r = await fetch("/api/" + name, { method: "POST", headers: { "Content-Type": "application/json", ...(S.token ? { "x-run-token": S.token } : {}) }, body: JSON.stringify(body || {}) });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(data.error || `The ${name} step failed. Try again.`); e.status = r.status; throw e; }
  return data;
}
async function ensureSession() {
  if (S.token) return true;
  try {
    const s = await api("session", { passcode: ownerPass });
    Object.assign(S, { token: s.token, owner: s.owner, mode: s.mode, models: s.models });
    setModeChip(s);
    return true;
  } catch (e) { toast(e.message, 6000); return false; }
}
function setModeChip(s) {
  const c = $("modeChip"); c.hidden = false;
  if (S.mode === "replay") { c.className = "pill replay"; c.textContent = "Example run"; return; }
  if (s.mode === "mock") { c.className = "pill mock"; c.textContent = "Mock mode"; c.title = "No API keys configured: images and AI answers are placeholders."; return; }
  c.className = "pill live"; c.id = "modeChip";
  c.textContent = s.owner ? "Live · owner" : s.left != null ? `Live · ${s.left} run${s.left === 1 ? "" : "s"} left today` : "Live";
}

/* ---------------- steps ---------------- */
function renderSteps() {
  $("steps").innerHTML = STEPS.map(([n, w], i) => `<button ${i + 1 > S.maxStep ? "disabled" : ""} class="${S.step === i + 1 ? "on" : ""}" data-s="${i + 1}" aria-current="${S.step === i + 1 ? "step" : "false"}"><span class="n">${i + 1}</span>${n}<i class="who ${w}"></i></button>`).join("");
}
$("steps").onclick = (e) => { const b = e.target.closest("button"); if (b && !b.disabled) go(+b.dataset.s); };
function go(n) {
  S.step = n; S.maxStep = Math.max(S.maxStep, n);
  document.querySelectorAll(".view").forEach((v, i) => v.classList.toggle("on", i + 1 === n));
  renderSteps();
  ({ 1: renderBrief, 2: renderPlan, 3: renderDirs, 4: renderGen, 5: renderReview, 6: renderDeliver })[n]?.();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- 1 brief ---------------- */
$("exBriefs").innerHTML = EXAMPLE_BRIEFS.map((e, i) => `<button class="opt" data-ex="${i}">${esc(e.label)}</button>`).join("");
$("exBriefs").onclick = (e) => { const b = e.target.closest("[data-ex]"); if (!b || S.mode === "replay") return; $("brief").value = EXAMPLE_BRIEFS[+b.dataset.ex].brief; S.brief = $("brief").value; renderBrief(); };
$("brief").oninput = () => { S.brief = $("brief").value; renderBriefHint(); };
function renderBrief() {
  if ($("brief").value !== S.brief) $("brief").value = S.brief;
  $("brief").readOnly = S.mode === "replay";
  $("assets").innerHTML = S.assets.map((a) => `<div class="asset"><img src="${a.data}" alt="${esc(a.name)}"><div class="ar"><select data-role="${a.id}" aria-label="Asset role" ${S.mode === "replay" ? "disabled" : ""}>${Object.entries(ROLES).map(([k, n]) => `<option value="${k}" ${a.role === k ? "selected" : ""}>${n}</option>`).join("")}</select>${S.mode === "replay" ? "" : `<button data-rm="${a.id}" aria-label="Remove ${esc(a.name)}">×</button>`}</div></div>`).join("");
  renderBriefHint();
}
function renderBriefHint() {
  const ok = S.brief.trim().length >= 20;
  $("readBrief").disabled = !ok && S.mode !== "replay";
  $("readBrief").textContent = S.mode === "replay" ? "Next" : "Read brief";
  $("briefHint").textContent = S.mode === "replay" ? "This is a recorded example run." : ok ? "The agent will structure it, match a brand kit and ask about anything unclear." : "Paste a brief or pick an example to start.";
}
$("assets").onchange = (e) => { const id = e.target.dataset.role; if (id) S.assets.find((a) => a.id === id).role = e.target.value; };
$("assets").onclick = (e) => { const id = e.target.dataset.rm; if (id) { S.assets = S.assets.filter((a) => a.id !== id); renderBrief(); } };
function downscale(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const i = new Image(); i.onload = () => {
      const max = 1280, k = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement("canvas");
      c.width = Math.round(i.width * k); c.height = Math.round(i.height * k);
      c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
      const png = file.type === "image/png";
      res(c.toDataURL(png ? "image/png" : "image/jpeg", 0.88));
    }; i.onerror = rej; i.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
async function addFiles(files) {
  if (S.mode === "replay") return;
  for (const f of [...files].slice(0, 4 - S.assets.length)) {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast(`${f.name} isn't a PNG, JPEG or WebP image.`); continue; }
    const data = await downscale(f);
    const role = /logo/i.test(f.name) ? "logo" : S.assets.some((a) => a.role === "product") ? "style" : "product";
    S.assets.push({ id: crypto.randomUUID().slice(0, 8), name: f.name, role, data });
  }
  renderBrief();
}
$("fileIn").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
const drop = $("drop");
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); };

$("readBrief").onclick = async () => {
  if (S.mode === "replay") return go(2);
  const b = $("readBrief"); b.disabled = true; b.textContent = "Reading…";
  if (!(await ensureSession())) { b.disabled = false; b.textContent = "Read brief"; return; }
  S.t0 = Date.now(); S.log = []; S.maxStep = 1; S.plan = null; S.directions = []; S.gen = {}; S.variants = [];
  log("you", `Submitted the brief${S.assets.length ? ` with ${S.assets.length} asset${S.assets.length > 1 ? "s" : ""}` : ""}`);
  try {
    const plan = await api("plan", { brief: S.brief, assets: S.assets.map(({ role, name, data }) => ({ role, name, data })) });
    S.plan = plan; S.kit = JSON.parse(JSON.stringify(plan.brandKit)); S.kit.logoColor = S.kit.logoColor || "auto";
    S.answers = {};
    const fm = plan.brief?.formatsMentioned?.length ? plan.brief.formatsMentioned : Object.keys(FMT);
    S.formats = Object.fromEntries(Object.keys(FMT).map((f) => [f, fm.includes(f)]));
    log("agent", "Structured the brief and built a brand kit" + (S.assets.length ? " from your assets" : ""));
    if (plan.questions?.length) log("agent", `Asked ${plan.questions.length} question${plan.questions.length > 1 ? "s" : ""} before starting`);
    go(2);
  } catch (e) { toast(e.message, 6000); log("agent", "Couldn't read the brief: " + e.message); }
  b.disabled = false; renderBriefHint();
};

/* ---------------- 2 plan ---------------- */
const FIELDS = [["brand", "Brand"], ["product", "Product"], ["launch", "Launch"], ["goal", "Goal"], ["audience", "Audience"], ["keyMessage", "Key message"], ["offer", "Offer"], ["tone", "Tone"]];
function renderPlan() {
  const p = S.plan; if (!p) return;
  const ro = S.mode === "replay";
  $("planFields").innerHTML = FIELDS.filter(([k]) => p.brief?.[k]).map(([k, n]) => `<dt>${n}</dt><dd>${esc(p.brief[k])}</dd>`).join("") +
    (p.brief?.mandatory?.length ? `<dt>Must include</dt><dd>${p.brief.mandatory.map((m) => `"${esc(m)}"`).join("<br>")}</dd>` : "");
  $("assetsRead").innerHTML = p.assetsRead?.length ? `<div class="q">${p.assetsRead.map((a) => `<p><span class="chip agent">${esc(ROLES[a.role] || a.role)}</span> ${esc(a.summary)}</p>`).join("")}</div>` : "";
  const k = S.kit, pal = k.palette;
  const pair = loadPair(k.fontPair);
  const hasLogo = S.assets.some((a) => a.role === "logo");
  $("kit").innerHTML = `<div class="swatches">${["bg", "ink", "light", "accent", "accent2"].map((key) => `<label class="sw"><input type="color" data-pal="${key}" value="${pal[key] || "#000000"}" ${ro ? "disabled" : ""} aria-label="${key} color">${key}</label>`).join("")}</div>
    <div class="fontsel"><select id="fontPick" ${ro ? "disabled" : ""} aria-label="Type pairing">${Object.entries(FONT_PAIRS).map(([id, f]) => `<option value="${id}" ${id === k.fontPair ? "selected" : ""}>${f.name}</option>`).join("")}</select>
    <span class="fontprev" style="font-family:'${pair.display}';font-weight:${pair.dw};font-style:${pair.ds}">${esc(k.name || p.brief?.brand || "Aa")}</span></div>
    ${hasLogo ? `<div class="fontsel"><span class="hint">Logo color</span><select id="logoColor" ${ro ? "disabled" : ""}><option value="auto" ${k.logoColor !== "original" ? "selected" : ""}>Match the copy (white or black)</option><option value="original" ${k.logoColor === "original" ? "selected" : ""}>Original colors</option></select></div>` : ""}
    <p class="hint" style="margin:12px 0 0">${esc(k.voice || "")}${k.source ? ` · <i>${esc(k.source)}</i>` : ""}</p>`;
  $("questions").innerHTML = (p.questions || []).map((q) => `<div class="q"><p><span class="chip ${q.kind === "claim" ? "warn" : "agent"}">${q.kind}</span> ${esc(q.text)}</p><div class="opts">${q.options.map((o, i) => `<button class="opt" data-q="${q.id}" data-i="${i}" aria-pressed="${S.answers[q.id] === i}" ${ro ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div></div>`).join("");
  $("fmtOpts").innerHTML = Object.entries(FMT).map(([f, d]) => `<button class="opt" data-f="${f}" aria-pressed="${!!S.formats[f]}" ${ro ? "disabled" : ""}>${d.name}</button>`).join("");
  const unanswered = (p.questions || []).filter((q) => S.answers[q.id] == null).length;
  $("confirmPlan").disabled = !ro && (unanswered > 0 || !fmtsOn().length);
  $("confirmPlan").textContent = ro ? "Next" : "Confirm plan";
  $("planHint").textContent = ro ? "" : unanswered ? `Answer ${unanswered} question${unanswered > 1 ? "s" : ""} to continue.` : !fmtsOn().length ? "Keep at least one format." : "Looks right? The agent will propose directions next.";
}
$("kit").oninput = (e) => { const key = e.target.dataset.pal; if (key) { S.kit.palette[key] = e.target.value; } };
$("kit").onchange = (e) => {
  if (e.target.dataset.pal) log("you", `Changed the ${e.target.dataset.pal} color`);
  if (e.target.id === "fontPick") { S.kit.fontPair = e.target.value; log("you", `Switched type to ${FONT_PAIRS[e.target.value].name}`); renderPlan(); }
  if (e.target.id === "logoColor") { S.kit.logoColor = e.target.value; }
};
$("questions").onclick = (e) => { const b = e.target.closest("[data-q]"); if (!b) return; S.answers[b.dataset.q] = +b.dataset.i; renderPlan(); };
$("fmtOpts").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; S.formats[b.dataset.f] = !S.formats[b.dataset.f]; renderPlan(); };
$("confirmPlan").onclick = async () => {
  if (S.mode === "replay") return go(3);
  const b = $("confirmPlan"); b.disabled = true; b.textContent = "Writing directions…";
  const answers = Object.fromEntries((S.plan.questions || []).map((q) => [q.text, q.options[S.answers[q.id]]]));
  (S.plan.questions || []).forEach((q) => log("you", `Answered: ${q.options[S.answers[q.id]]}`));
  log("you", `Confirmed the plan: ${fmtsOn().map((f) => FMT[f].name).join(", ")}`);
  try {
    const r = await api("directions", { plan: { brief: S.plan.brief, brandKit: S.kit }, answers, hasProduct: S.assets.some((a) => a.role === "product"), hasStyle: S.assets.some((a) => a.role === "style") });
    S.directions = (r.directions || []).slice(0, 3).map((d, i) => ({ ...d, id: d.id || "ABC"[i], on: true, note: "" }));
    log("agent", "Proposed 3 directions, each with a model plan");
    go(3);
  } catch (e) { toast(e.message, 6000); }
  b.disabled = false; b.textContent = "Confirm plan";
};

/* ---------------- 3 directions ---------------- */
function previewVariant(d) { return { fmt: "banner", headline: d.headline, sub: d.sub, cta: d.cta, layout: d.layout, textTone: d.textTone, scrim: 0, image: S.gen[d.id]?.master || null }; }
function renderDirs() {
  const ro = S.mode === "replay";
  $("dirs").innerHTML = S.directions.map((d) => `<article class="dir ${d.on ? "" : "off"}">
    <div class="sw2">${adHTML(previewVariant(d), S.kit, S)}</div>
    <div class="body"><span class="chip">Direction ${d.id}</span><h3>${esc(d.name)}</h3><p class="hook" style="margin:0">${esc(d.hook)}</p>
    <ul>${(d.modelPlan || []).map(([a, b]) => `<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join("")}</ul>
    <textarea class="note" data-note="${d.id}" rows="2" placeholder="Note to steer it, e.g. warmer light, more negative space" ${ro ? "readonly" : ""}>${esc(d.note)}</textarea>
    <div class="row"><label class="toggle"><input type="checkbox" data-on="${d.id}" ${d.on ? "checked" : ""} ${ro ? "disabled" : ""}> Include</label><span class="chip">${esc(d.layout)} · ${esc(d.textTone)} type</span></div></div></article>`).join("");
  const n = S.directions.filter((d) => d.on).length, f = fmtsOn().length;
  $("genBtn").disabled = !ro && !n;
  $("genBtn").textContent = ro ? "Next" : n ? `Generate ${n * f} variants` : "Choose a direction";
  $("genHint").textContent = ro ? "" : n ? `${n} direction${n > 1 ? "s" : ""} × ${f} format${f > 1 ? "s" : ""} · about ${n * (2 + Math.max(0, f - (S.formats.feed ? 1 : 0)))} images` : "";
}
$("dirs").onchange = (e) => { const id = e.target.dataset.on; if (id) { S.directions.find((d) => d.id === id).on = e.target.checked; renderDirs(); } };
$("dirs").oninput = (e) => { const id = e.target.dataset.note; if (id) S.directions.find((d) => d.id === id).note = e.target.value; };
$("genBtn").onclick = () => {
  if (S.mode === "replay") return go(4);
  const on = S.directions.filter((d) => d.on);
  log("you", `Chose direction${on.length > 1 ? "s" : ""} ${on.map((d) => d.id).join(", ")}`);
  on.filter((d) => d.note.trim()).forEach((d) => log("you", `Steered ${d.id}: "${d.note.trim()}"`));
  S.gen = {}; S.variants = [];
  go(4); runGeneration();
};

/* ---------------- 4 generate ---------------- */
const productRefs = () => S.assets.filter((a) => a.role === "product").map((a) => a.data);
const styleRefs = () => S.assets.filter((a) => a.role === "style").map((a) => a.data);
function copyArea(d) { return d.layout === "bottom" ? "lower third" : d.layout === "center" ? "middle band" : "upper third"; }
function masterPrompt(d) {
  let p = d.imagePrompt;
  if (d.note?.trim()) p += ` Art direction from the designer: ${d.note.trim()}.`;
  if (styleRefs().length) p += " Match the mood, color and lighting of the style reference images.";
  return p + ` Keep calm, uncluttered negative space in the ${copyArea(d)} for text. No text, letters, logos or watermarks.`;
}
function recomposePrompt(d, fmt) {
  return `Recompose this exact image for a ${fmt === "story" ? "tall 9:16 vertical" : "wide 16:9 horizontal"} format. Keep the same subject, product, lighting, palette and style; extend the scene naturally. ${fmt === "banner" ? "Place the subject in the right half and keep the left half calm for text." : `Keep calm negative space in the ${copyArea(d)} for text.`} No text, letters, logos or watermarks.`;
}
async function genImage(body, label) {
  const r = await api("image", { ...body, palette: S.kit.palette });
  S.images++;
  if (label) log("agent", label.replace("{model}", shortModel(r.model)));
  return r;
}
function shortModel(m = "") { return /flux-2-pro/.test(m) ? "FLUX.2 Pro" : /nano-banana-2/.test(m) ? "Nano Banana 2 Edit" : /mock/.test(m) ? "mock model" : m.split("/").pop(); }
async function runDirection(d) {
  const g = (S.gen[d.id] = { status: "Generating 2 candidates", cands: [null, null], scores: null, best: null, master: null, formats: {}, issues: [] });
  renderGen();
  const refs = [...productRefs(), ...styleRefs()];
  const prompt = masterPrompt(d);
  const cands = await Promise.all([0, 1].map(async (i) => {
    const r = await genImage({ prompt, fmt: "feed", refs, salt: d.id + i });
    g.cands[i] = r.image; renderGen(); return r;
  }));
  log("agent", `${d.id}: made 2 candidates with ${shortModel(cands[0].model)}${refs.length ? " from your reference images" : ""}`);
  g.status = "Scoring candidates";
  renderGen();
  let sc;
  try { sc = await api("score", { images: g.cands, direction: d, brandKit: S.kit, product: productRefs()[0] }); }
  catch (e) { sc = { scores: [], best: 0, issues: [] }; log("agent", `${d.id}: couldn't score (${e.message}); kept candidate 1`); }
  g.scores = sc.scores || []; g.best = Math.min(Math.max(0, sc.best | 0), 1); g.master = g.cands[g.best]; g.issues = sc.issues || [];
  log("agent", `${d.id}: Claude picked candidate ${g.best + 1}${g.scores[g.best] ? ` (${g.scores[g.best].score}/10, ${g.scores[g.best].why})` : ""}`);
  g.status = "Adapting to formats"; renderGen();
  await Promise.all(fmtsOn().filter((f) => f !== "feed").map(async (f) => {
    g.formats[f] = "pending"; renderGen();
    const r = await genImage({ prompt: recomposePrompt(d, f), fmt: f, refs: [g.master, ...productRefs()], salt: d.id + f });
    g.formats[f] = r.image; renderGen();
  }));
  if (fmtsOn().some((f) => f !== "feed")) log("agent", `${d.id}: recomposed for ${fmtsOn().filter((f) => f !== "feed").map((f) => FMT[f].name).join(" and ")}`);
  g.status = "Done"; renderGen();
  for (const f of fmtsOn()) {
    S.variants.push({ id: `${d.id}-${f}`, dir: d.id, fmt: f, image: f === "feed" ? g.master : g.formats[f], headline: d.headline, sub: d.sub, cta: d.cta, layout: d.layout, textTone: d.textTone, scrim: 0.55,
      status: "pending", version: 1, aiIssues: f === "feed" ? g.issues.map((x, i) => ({ ...x, id: "ai" + i })) : [], claimOK: false, contrast: null, change: null });
  }
}
async function runGeneration() {
  $("toReview").disabled = true;
  const on = S.directions.filter((d) => d.on);
  const results = await Promise.allSettled(on.map((d) => runDirection(d)));
  results.forEach((r, i) => { if (r.status === "rejected") { S.gen[on[i].id].status = "Failed: " + r.reason.message; log("agent", `${on[i].id}: stopped. ${r.reason.message}`); } });
  renderGen();
  await Promise.all(S.variants.map(async (v) => { v.contrast = await measureContrast(v, S.kit).catch(() => null); }));
  const n = S.variants.reduce((a, v) => a + flags(v).length, 0);
  log("agent", `Checked ${S.variants.length} variants: ${n} issue${n === 1 ? "" : "s"} found`);
  $("toReview").disabled = !S.variants.length;
  if (!S.variants.length) toast("Nothing was generated. Check the errors above and try again.", 6000);
}
function renderGen() {
  if (S.step !== 4) return;
  const on = S.directions.filter((d) => S.gen[d.id]);
  $("gen").innerHTML = on.map((d) => {
    const g = S.gen[d.id];
    const cand = (img, i) => img ? `<div class="cand ${g.best === i ? "best" : ""}"><img src="${img}" alt="Candidate ${i + 1}">${g.scores?.[i] ? `<span class="sc">${g.scores[i].score}/10</span>` : ""}</div>` : `<div class="cand wait">making…</div>`;
    const fm = Object.entries(g.formats).map(([f, img]) => img === "pending" ? `<div class="cand wait ${f === "story" ? "w916" : "w169"}"></div>` : `<div class="cand fmt"><img src="${img}" alt="${FMT[f].name}"></div>`).join("");
    const why = g.scores?.length ? `<p class="why">${g.scores.map((s, i) => `Candidate ${i + 1}: ${esc(s.why)}`).join(" · ")}</p>` : "";
    return `<div class="genrow"><div class="gh"><b>${d.id} · ${esc(d.name)}</b><span class="chip ${/Done/.test(g.status) ? "good" : /Failed/.test(g.status) ? "crit" : "agent"}">${esc(g.status)}</span></div>
      <div class="cands">${g.cands.map(cand).join("")}${fm ? `<span style="width:1px;background:var(--line);margin:0 6px"></span>${fm}` : ""}</div>${why}</div>`;
  }).join("");
}
$("toReview").onclick = () => { log("agent", "Sorted the review queue by risk"); go(5); };

/* ---------------- 5 review ---------------- */
function claimQs() { return (S.plan?.questions || []).filter((q) => q.kind === "claim" && q.phrase && S.answers[q.id] != null && /not|no/i.test(q.options[S.answers[q.id]] || "")); }
function flags(v) {
  const f = [];
  for (const q of claimQs()) if (!v.claimOK && (v.headline + " " + v.sub).toLowerCase().includes(q.phrase.toLowerCase())) f.push({ k: "claim", kind: "you", label: "Claim", msg: `"${q.phrase}" isn't confirmed yet.`, q });
  for (const x of v.aiIssues || []) f.push({ k: x.id, kind: x.kind === "fix" ? "fix" : "you", label: x.label || "Review", msg: x.msg, ai: x });
  if (v.headline.length > FMT[v.fmt].limit) f.push({ k: "length", kind: "fix", label: "Copy length", msg: `Headline is ${v.headline.length} characters; ${FMT[v.fmt].name} allows ${FMT[v.fmt].limit}.` });
  if (v.contrast != null && v.contrast < 4.5) f.push({ k: "contrast", kind: "fix", label: "Contrast", msg: `Copy measures ${v.contrast}:1 against this image. It needs 4.5:1.` });
  return f;
}
const risk = (v) => v.status === "approved" ? -1 : flags(v).reduce((a, x) => a + (x.kind === "you" ? 10 : 3), 0);
const sorted = () => [...S.variants].sort((a, b) => risk(b) - risk(a));
function renderReview() {
  const vs = S.variants; if (!vs.length) { $("grid").innerHTML = '<p class="empty">No variants yet.</p>'; $("detail").innerHTML = ""; $("rhead").innerHTML = ""; return; }
  const open = vs.filter((v) => v.status !== "approved");
  const clean = open.filter((v) => !flags(v).length), you = open.filter((v) => flags(v).some((f) => f.kind === "you")), fix = open.filter((v) => flags(v).length && !flags(v).some((f) => f.kind === "you"));
  const done = vs.length - open.length, ro = S.mode === "replay";
  $("rhead").innerHTML = `<span class="chip you">${you.length} need you</span><span class="chip warn">${fix.length} agent can fix</span><span class="chip good">${clean.length} clean</span><span class="chip">${done}/${vs.length} approved</span><span style="flex:1"></span>
    ${!ro && clean.length ? `<button class="btn sm" id="okClean">Approve ${clean.length} clean</button>` : ""}${done === vs.length || ro ? `<button class="btn sm" id="toDeliver">${ro ? "Next" : "Package for handoff"}</button>` : ""}`;
  if (!S.sel || !vs.find((v) => v.id === S.sel)) S.sel = (sorted().find((v) => v.status !== "approved") || vs[0]).id;
  $("grid").innerHTML = sorted().map((v) => { const f = flags(v), st = v.status === "approved" ? "var(--good)" : f.some((x) => x.kind === "you") ? "var(--you)" : f.length ? "var(--warn)" : "var(--line)";
    return `<button class="vc ${S.sel === v.id ? "sel" : ""}" data-id="${v.id}"><span class="stripe" style="background:${st}"></span><div class="thumb">${adHTML(v, S.kit, S)}</div>
    <div class="meta"><span>${v.dir} · ${FMT[v.fmt].name}${v.version > 1 ? " · v" + v.version : ""}</span>${v.status === "approved" ? '<span class="chip good">approved</span>' : ""}</div>
    <div class="flags">${f.map((x) => `<span class="chip ${x.kind === "you" ? "you" : "warn"}">${esc(x.label)}</span>`).join("") || (v.status === "approved" ? "" : '<span class="chip good">clean</span>')}</div></button>`; }).join("");
  renderDetail();
  const a = $("okClean"); if (a) a.onclick = () => { clean.forEach((v) => (v.status = "approved")); log("you", `Approved ${clean.length} clean variant${clean.length > 1 ? "s" : ""} in one step`); pickNext(); renderReview(); };
  const d = $("toDeliver"); if (d) d.onclick = () => { if (!ro) log("agent", "Named the files and built the export package"); go(6); };
}
function pickNext() { const n = sorted().find((x) => x.status !== "approved"); if (n) S.sel = n.id; }
$("grid").onclick = (e) => { const b = e.target.closest(".vc"); if (b) { S.sel = b.dataset.id; renderReview(); } };
function renderDetail() {
  const v = S.variants.find((x) => x.id === S.sel); if (!v) return;
  const d = S.directions.find((x) => x.id === v.dir), f = flags(v), ro = S.mode === "replay", g = S.gen[v.dir];
  const passes = [["Must-include line", (S.plan.brief?.mandatory || []).length ? "present" : "none required"], ...(f.some((x) => x.k === "length") ? [] : [["Copy length", `${v.headline.length}/${FMT[v.fmt].limit}`]]), ...(f.some((x) => x.k === "contrast") || v.contrast == null ? [] : [["Contrast", `${v.contrast}:1`]]), ...(v.fmt === "story" ? [["Safe zones", "clear"]] : [])];
  $("detail").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font:600 16px var(--display)">${esc(d?.name || v.dir)}</b><span class="chip">${v.id}${v.version > 1 ? " · v" + v.version : ""}</span></div>
    <div class="big">${adHTML(v, S.kit, S, { safe: v.fmt === "story" })}</div>
    ${v.change ? `<div class="change">${v.change.did?.length ? `<b>v${v.version} changes:</b> ${esc(v.change.did.join("; "))}.` : "<b>No change made.</b>"}${v.change.notDone?.length ? `<br><b>Couldn't do:</b> ${esc(v.change.notDone.join("; "))}.` : ""}</div>` : ""}
    ${v.fmt === "feed" && g?.scores?.length ? `<div class="qa"><b>Why this image:</b> ${esc(g.scores[g.best]?.why || "")} (${g.scores[g.best]?.score}/10 vs ${g.scores[1 - g.best]?.score ?? "–"}/10)</div>` : ""}
    <ul class="checks">${f.map((x) => `<li><div class="ct"><b>${esc(x.label)}</b><span class="chip ${x.kind === "you" ? "you" : "warn"}">${x.kind === "you" ? "your call" : "agent can fix"}</span></div><span>${esc(x.msg)}</span>
      ${ro ? "" : `<div class="opts">${x.k === "claim" ? `<button class="opt" data-claim="keep">Product confirmed it</button><button class="opt" data-claim="drop">Take it out of the copy</button>` : x.kind === "fix" ? `<button class="opt" data-fix="${x.k}">${x.k === "contrast" ? "Strengthen the shade behind the copy" : x.k === "length" ? "Shorten the headline" : "Fix it in the image"}</button>` : `<button class="opt" data-keep="${x.k}">It's fine, keep it</button>${x.ai?.fix ? `<button class="opt" data-fix="${x.k}">Fix it in the image</button>` : ""}`}</div>`}</li>`).join("")}
      ${passes.map(([a, b]) => `<li class="ok"><div class="ct"><span>${a}</span><span class="chip good">${esc(b)}</span></div></li>`).join("")}</ul>
    ${ro ? "" : `<div class="edit"><input id="hlEdit" value="${esc(v.headline)}" aria-label="Edit headline"><button class="btn ghost sm" id="saveHl">Save</button></div>
    <textarea class="note" id="reviseNote" rows="2" placeholder="Note for the agent, e.g. replace the squares with realistic ice cubes"></textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><label class="scope"><input type="checkbox" id="scopeDir"> Apply to all of direction ${v.dir}</label><button class="btn ghost sm" id="revise">Revise</button></div>
    <button class="btn" id="approve" ${f.length || v.status === "approved" ? "disabled" : ""}>${v.status === "approved" ? "Approved" : f.length ? `Resolve ${f.length} flag${f.length > 1 ? "s" : ""} to approve` : "Approve"}</button>`}`;
  if (ro) return;
  const D = $("detail");
  D.querySelectorAll("[data-claim]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.claim === "keep") { S.variants.forEach((x) => (x.claimOK = true)); log("you", "Confirmed the claim; cleared it on every variant"); renderReview(); }
    else { const q = f.find((x) => x.k === "claim").q; await revise(v, `Remove the claim "${q.phrase}" from the headline and sub, keeping the same voice and length.`, true, "Took the claim out of the copy"); }
  }));
  D.querySelectorAll("[data-keep]").forEach((b) => (b.onclick = () => { v.aiIssues = v.aiIssues.filter((x) => x.id !== b.dataset.keep); log("you", `Kept ${v.id} as it is`); renderReview(); }));
  D.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = async () => {
    const k = b.dataset.fix;
    if (k === "contrast") { v.scrim = Math.min(0.92, (v.scrim ?? 0.55) + 0.15); v.contrast = await measureContrast(v, S.kit); log("you", `Accepted a stronger shade on ${v.id}`); if (v.contrast < 4.5) log("agent", `${v.id} still measures ${v.contrast}:1; try again or revise the image`); renderReview(); }
    else if (k === "length") await revise(v, `Shorten the headline to ${FMT[v.fmt].limit - 4} characters or fewer, same idea and voice.`, false, "Asked the agent to shorten the headline");
    else { const issue = v.aiIssues.find((x) => x.id === k); await revise(v, issue.fix || issue.msg, false, `Asked the agent to fix: ${issue.label}`, issue.fix); v.aiIssues = v.aiIssues.filter((x) => x.id !== k); renderReview(); }
  }));
  $("saveHl").onclick = async () => { const t = $("hlEdit").value.trim(); if (!t || t === v.headline) return; v.headline = t; v.edited = true; v.status = "pending"; log("you", `Edited the headline on ${v.id}`); renderReview(); };
  $("revise").onclick = async () => { const n = $("reviseNote").value.trim(); if (!n) return toast("Write a note first."); await revise(v, n, $("scopeDir").checked); };
  $("approve").onclick = () => { v.status = "approved"; log("you", `Approved ${v.id}`); pickNext(); renderReview(); };
}
async function revise(v, note, wholeDirection, logText, directImageEdit) {
  const targets = wholeDirection ? S.variants.filter((x) => x.dir === v.dir) : [v];
  $("detail").classList.add("busy");
  log("you", logText || `Asked for changes on ${wholeDirection ? "all of direction " + v.dir : v.id}: "${note}"`);
  try {
    const d = S.directions.find((x) => x.id === v.dir);
    const r = directImageEdit ? { did: ["fixed it in the image"], notDone: [], imageEdit: directImageEdit } : await api("revise", { note, variant: v, direction: d, brandKit: S.kit, image: v.image });
    const did = r.did || [], notDone = r.notDone || [];
    const changesCopy = r.copy && Object.values(r.copy).some(Boolean);
    if (!r.imageEdit && !changesCopy && !r.layout && !r.textTone) { targets.forEach((x) => (x.change = { did: [], notDone: notDone.length ? notDone : [note] })); log("agent", `Couldn't make that change${notDone.length ? ": " + notDone.join("; ") : ""}`); return; }
    await Promise.all(targets.map(async (x) => {
      if (r.copy?.headline) x.headline = r.copy.headline; if (r.copy?.sub) x.sub = r.copy.sub; if (r.copy?.cta) x.cta = r.copy.cta;
      if (r.layout && ["top", "bottom", "center"].includes(r.layout)) x.layout = r.layout; if (r.textTone && ["light", "dark"].includes(r.textTone)) x.textTone = r.textTone;
      if (r.imageEdit) { const img = await genImage({ prompt: `${r.imageEdit}. Keep the composition, product, lighting and palette otherwise unchanged. No text, letters, logos or watermarks.`, fmt: x.fmt, refs: [x.image, ...productRefs()], salt: x.id + x.version }); x.image = img.image; }
      x.version++; x.status = "pending"; x.change = { did, notDone };
      x.contrast = await measureContrast(x, S.kit).catch(() => null);
    }));
    log("agent", `Updated ${targets.length > 1 ? targets.length + " variants" : v.id}: ${did.join("; ") || "done"}`);
    if (notDone.length) log("agent", `Couldn't do: ${notDone.join("; ")}`);
  } catch (e) { toast(e.message, 6000); log("agent", "Revision failed: " + e.message); }
  finally { $("detail").classList.remove("busy"); renderReview(); }
}

/* ---------------- 6 deliver ---------------- */
function fname(v) { return `${slug(S.plan?.brief?.brand)}_${slug(S.plan?.brief?.product)}_${v.dir.toLowerCase()}_${v.fmt}-${FMT[v.fmt].ratio}_v${v.version}.png`; }
function summary() {
  return `# ${S.plan?.brief?.brand || "Campaign"}: ${S.plan?.brief?.product || ""}\n\n${S.variants.length} approved variants\n\n` + S.variants.map((v) => `- ${fname(v)}: "${v.headline}"`).join("\n") +
    `\n\nBrand kit: ${FONT_PAIRS[S.kit.fontPair]?.name}, palette ${Object.values(S.kit.palette).join(" ")}\nAgent actions: ${S.log.filter((e) => e.who === "agent").length}. Designer decisions: ${S.log.filter((e) => e.who === "you").length}. Images generated: ${S.images}.\n`;
}
function renderDeliver() {
  const secs = S.duration ?? Math.round((Date.now() - S.t0) / 1000);
  if (S.mode !== "replay" && S.duration == null) S.duration = secs;
  $("stats").innerHTML = [[S.variants.length, "variants approved"], [S.log.filter((e) => e.who === "agent").length, "agent actions"], [S.log.filter((e) => e.who === "you").length, "your decisions"], [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, "brief to handoff"]].map(([a, b]) => `<div class="stat"><b>${a}</b><span>${b}</span></div>`).join("");
  $("pkg").innerHTML = `<thead><tr><th>File</th><th>Direction</th><th>Format</th><th>Headline</th><th></th></tr></thead><tbody>${S.variants.map((v) => `<tr><td class="mono">${fname(v)}</td><td>${v.dir}</td><td>${FMT[v.fmt].name}</td><td>${esc(v.headline)}</td><td><button class="rowdl" data-dl="${v.id}">PNG</button></td></tr>`).join("")}</tbody>`;
  $("saveRun").hidden = !(S.owner && S.mode !== "replay");
}
function saveBlob(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
$("pkg").onclick = async (e) => { const b = e.target.closest("[data-dl]"); if (!b) return; const v = S.variants.find((x) => x.id === b.dataset.dl); b.disabled = true; b.textContent = "…";
  try { saveBlob(fname(v), await renderPng(v, S.kit, S, $("stage"))); } catch { toast("Couldn't render that file."); } b.disabled = false; b.textContent = "PNG"; };
$("dlZip").onclick = async () => {
  const b = $("dlZip"); b.disabled = true;
  try {
    const zip = new window.JSZip(), dir = zip.folder(`${slug(S.plan?.brief?.brand)}_export`);
    for (let i = 0; i < S.variants.length; i++) { b.textContent = `Rendering ${i + 1}/${S.variants.length}…`; dir.file(fname(S.variants[i]), await renderPng(S.variants[i], S.kit, S, $("stage"))); }
    dir.file("handoff-summary.md", summary());
    b.textContent = "Zipping…"; saveBlob(`${slug(S.plan?.brief?.brand)}_export.zip`, await zip.generateAsync({ type: "blob" }));
    $("dlHint").textContent = "Downloaded."; if (S.mode !== "replay") log("you", "Downloaded the export package");
  } catch (e) { console.error(e); toast("Couldn't build the package. Try again."); }
  b.disabled = false; b.textContent = "Download package (.zip)";
};
$("copySum").onclick = async () => { try { await navigator.clipboard.writeText(summary()); $("dlHint").textContent = "Summary copied."; } catch { toast("Copy was blocked by the browser."); } };
$("saveRun").onclick = () => {
  const run = { ...S, token: null, owner: false, mode: null, title: `${S.plan?.brief?.brand || "Run"}: ${S.plan?.brief?.product || ""}`, savedAt: new Date().toISOString() };
  saveBlob(`run-${slug(S.plan?.brief?.brand)}-${slug(S.plan?.brief?.product)}.json`, new Blob([JSON.stringify(run)], { type: "application/json" }));
  $("dlHint").textContent = "Saved. Add it to the examples folder to publish it as a replay (see README).";
};
$("restart").onclick = () => { const keep = { token: null, mode: S.mode === "replay" ? null : S.mode }; S = fresh(); Object.assign(S, keep); $("replayPick").value = ""; renderLog(); go(1); };

/* ---------------- replays ---------------- */
async function loadReplays() {
  try {
    const r = await fetch("/examples/index.json", { cache: "no-store" });
    if (!r.ok) throw 0;
    const list = await r.json();
    if (!list.length) { $("replayPick").hidden = true; return; }
    $("replayPick").innerHTML = `<option value="">Example runs</option>` + list.map((x) => `<option value="${esc(x.file)}">${esc(x.title)}</option>`).join("");
  } catch { $("replayPick").hidden = true; }
}
$("replayPick").onchange = async (e) => {
  const file = e.target.value; if (!file) return;
  try {
    const run = await (await fetch("/examples/" + file)).json();
    S = Object.assign(fresh(), run, { mode: "replay", token: null, owner: false, maxStep: 6 });
    setModeChip({});
    loadPair(S.kit.fontPair);
    renderLog(1); go(1);
    autoplay();
  } catch { toast("Couldn't load that example run."); }
};
let playing = 0;
async function autoplay() {
  const id = ++playing, dwell = [0, 4500, 5000, 5000, 6500, 7000, 0];
  for (let n = 1; n <= 6; n++) {
    if (id !== playing || S.mode !== "replay") return;
    go(n); renderLog(n);
    if (n === 6) break;
    await sleep(dwell[n]);
  }
}
document.addEventListener("click", (e) => { if (S.mode === "replay" && e.isTrusted && e.target.closest("main,#steps")) playing++; }, true);

/* ---------------- sky ---------------- */
function paintSky() {
  const c = $("sky"), dpr = Math.min(2, window.devicePixelRatio || 1), w = document.documentElement.clientWidth, h = 560;
  c.width = w * dpr; c.height = h * dpr; const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#9dbbe5"); g.addColorStop(0.5, "#c9d8ee"); g.addColorStop(1, "#f4f3f0"); x.fillStyle = g; x.fillRect(0, 0, w, h);
  let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tints = ["255,255,255", "255,249,238", "252,229,208", "231,226,246"];
  const puff = (cx, cy, rad, a, col) => { const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy, rad * 1.7, rad * 0.85, (r() - 0.5) * 0.5, 0, Math.PI * 2); x.fill(); };
  x.filter = "blur(14px)";
  for (let i = 0; i < 90; i++) { const side = r() < 0.5; puff(side ? r() * w * 0.34 : w - r() * w * 0.34, r() * h * 0.9, 50 + r() * 150, 0.45 + r() * 0.45, tints[Math.floor(r() * tints.length)]); }
  for (let i = 0; i < 18; i++) puff(w * 0.25 + r() * w * 0.5, h * 0.55 + r() * h * 0.4, 60 + r() * 120, 0.25 + r() * 0.25, "255,255,255");
  x.filter = "blur(3px)";
  for (let i = 0; i < 140; i++) { const side = r() < 0.5, cx = side ? r() * w * 0.3 : w - r() * w * 0.3, cy = r() * h * 0.85; x.strokeStyle = `rgba(${tints[Math.floor(r() * tints.length)]},${0.18 + r() * 0.3})`; x.lineWidth = 4 + r() * 10; x.lineCap = "round"; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + 20 + r() * 40, cy - 10 - r() * 20, cx + 40 + r() * 80, cy + (r() - 0.5) * 20); x.stroke(); }
  x.filter = "none";
}
let skyT; window.addEventListener("resize", () => { clearTimeout(skyT); skyT = setTimeout(paintSky, 150); });

/* ---------------- start ---------------- */
S = fresh();
paintSky(); loadReplays(); renderLog(); go(1);
window.__proofline = () => S; // handy for debugging in the console
