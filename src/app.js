import { FMT, esc, adHTML, measureContrast, renderImage } from "./ad.js";
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
let shownLog = 0;
function renderLog(upTo) {
  const items = S.log.filter((e) => upTo == null || e.step <= upTo);
  const fresh = items.length >= shownLog ? shownLog : 0; shownLog = items.length;
  $("log").innerHTML = items.map((e, i) => `<li class="${e.who}${i >= fresh ? " new" : ""}"><time>${e.t}</time><span><i class="who ${e.who}"></i>${esc(e.text)}</span></li>`).join("");
  $("log").scrollTop = $("log").scrollHeight;
  const a = items.filter((e) => e.who === "agent").length, y = items.filter((e) => e.who === "you").length;
  $("cAgent").hidden = !a; $("cAgent").textContent = `${a} by us`;
  $("cYou").hidden = !y; $("cYou").textContent = `${y} by you`;
  const active = items.length > 0;
  $("activity").hidden = !active; $("showcase").hidden = active;
}
function slug(s, words = 3) { return String(s || "").toLowerCase().split(/[,(]/)[0].replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, words).join("-") || "brand"; }
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
    const s = await api("session", { passcode: ownerPass, practice: params.get("practice") === "1" });
    Object.assign(S, { token: s.token, owner: s.owner, mode: s.mode, models: s.models });
    setModeChip(s);
    return true;
  } catch (e) { toast(e.message, 6000); return false; }
}
function setModeChip(s) {
  const c = $("modeChip"); c.hidden = false;
  if (S.mode === "replay") { c.className = "pill replay"; c.textContent = "Example run"; return; }
  if (s.mode === "mock") { c.className = "pill mock"; c.textContent = "Practice mode · free"; c.title = "Placeholder images and answers. Nothing is charged."; return; }
  c.className = "pill live"; c.id = "modeChip";
  c.textContent = s.owner ? "Live · owner" : s.left != null ? `Live · ${s.left} free run${s.left === 1 ? "" : "s"} left today` : "Live";
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
  $("readBrief").textContent = S.mode === "replay" ? "Next" : "Create a plan";
  $("briefHint").textContent = S.mode === "replay" ? "This is a recorded example run." : ok ? "Next, you'll check our plan before anything is made." : "Paste a brief or pick an example to start.";
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
  const b = $("readBrief"); b.disabled = true; b.textContent = "Reading your brief…";
  if (!(await ensureSession())) { b.disabled = false; b.textContent = "Create a plan"; return; }
  S.t0 = Date.now(); S.log = []; S.maxStep = 1; S.plan = null; S.directions = []; S.gen = {}; S.variants = [];
  log("you", `You shared your brief${S.assets.length ? ` and ${S.assets.length} image${S.assets.length > 1 ? "s" : ""}` : ""}`);
  try {
    const plan = await api("plan", { brief: S.brief, assets: S.assets.map(({ role, name, data }) => ({ role, name, data })) });
    S.plan = plan; S.kit = JSON.parse(JSON.stringify(plan.brandKit)); S.kit.logoColor = S.kit.logoColor || "auto";
    S.answers = {};
    const fm = plan.brief?.formatsMentioned?.length ? plan.brief.formatsMentioned : Object.keys(FMT);
    S.formats = Object.fromEntries(Object.keys(FMT).map((f) => [f, fm.includes(f)]));
    log("agent", "Brief summarized; colors and fonts picked" + (S.assets.length ? " from your images" : ""));
    if (plan.questions?.length) log("agent", `${plan.questions.length} question${plan.questions.length > 1 ? "s" : ""} for you before we start`);
    b.disabled = false; renderBriefHint(); go(2); return;
  } catch (e) { log("agent", "Couldn't summarize the brief: " + e.message); b.disabled = false; renderBriefHint(); b.textContent = "Try again"; $("briefHint").textContent = "That didn't work: " + e.message; }
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
  $("confirmPlan").textContent = ro ? "Next" : "Show me directions";
  $("planHint").textContent = ro ? "" : unanswered ? `Answer ${unanswered} question${unanswered > 1 ? "s" : ""} to continue.` : !fmtsOn().length ? "Keep at least one format." : "Looks right? Next you'll see three ideas.";
}
$("kit").oninput = (e) => { const key = e.target.dataset.pal; if (key) { S.kit.palette[key] = e.target.value; } };
$("kit").onchange = (e) => {
  if (e.target.dataset.pal) log("you", `You changed a brand color`);
  if (e.target.id === "fontPick") { S.kit.fontPair = e.target.value; log("you", `You switched fonts to ${FONT_PAIRS[e.target.value].name}`); renderPlan(); }
  if (e.target.id === "logoColor") { S.kit.logoColor = e.target.value; }
};
$("questions").onclick = (e) => { const b = e.target.closest("[data-q]"); if (!b) return; S.answers[b.dataset.q] = +b.dataset.i; renderPlan(); };
$("fmtOpts").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; S.formats[b.dataset.f] = !S.formats[b.dataset.f]; renderPlan(); };
$("confirmPlan").onclick = async () => {
  if (S.mode === "replay") return go(3);
  const b = $("confirmPlan"); b.disabled = true; b.textContent = "Coming up with ideas…";
  const answers = Object.fromEntries((S.plan.questions || []).map((q) => [q.text, q.options[S.answers[q.id]]]));
  try {
    const r = await api("directions", { plan: { brief: S.plan.brief, brandKit: S.kit }, answers, hasProduct: S.assets.some((a) => a.role === "product"), hasStyle: S.assets.some((a) => a.role === "style") });
    S.directions = (r.directions || []).slice(0, 3).map((d, i) => ({ ...d, id: d.id || "ABC"[i], on: true, note: "" }));
    (S.plan.questions || []).forEach((q) => log("you", `You answered: ${q.options[S.answers[q.id]]}`));
    log("you", `You approved the plan (${fmtsOn().map((f) => FMT[f].name).join(", ")})`);
    log("agent", "3 ideas ready for you");
    b.disabled = false; b.textContent = "Show me directions";
    go(3); return;
  } catch (e) { log("agent", "Couldn't come up with ideas: " + e.message); b.disabled = false; b.textContent = "Try again"; $("planHint").textContent = "That didn't work: " + e.message; }
};

/* ---------------- 3 directions ---------------- */
function previewVariant(d) { return { fmt: "banner", headline: d.headline, sub: d.sub, cta: d.cta, layout: d.layout, textTone: d.textTone, scrim: 0, image: S.gen[d.id]?.master || null }; }
function renderDirs() {
  const ro = S.mode === "replay";
  $("dirs").innerHTML = S.directions.map((d) => `<article class="dir ${d.on ? "" : "off"}">
    <div class="sw2">${adHTML(previewVariant(d), S.kit, S)}</div>
    <div class="body"><span class="chip">Idea ${d.id}</span><h3>${esc(d.name)}</h3><p class="hook" style="margin:0">${esc(d.hook)}</p>
    <details class="how"><summary>How it's made</summary><ul>${(d.modelPlan || []).map(([a, b]) => `<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join("")}</ul></details>
    <textarea class="note" data-note="${d.id}" rows="2" placeholder="Optional note, e.g. warmer light, more space around the product" ${ro ? "readonly" : ""}>${esc(d.note)}</textarea>
    <div class="row"><label class="toggle"><input type="checkbox" data-on="${d.id}" ${d.on ? "checked" : ""} ${ro ? "disabled" : ""}> Include</label><span class="chip">text ${d.layout === "center" ? "in the middle" : "at the " + esc(d.layout)}</span></div></div></article>`).join("");
  const n = S.directions.filter((d) => d.on).length, f = fmtsOn().length;
  $("genBtn").disabled = !ro && !n;
  $("genBtn").textContent = ro ? "Next" : n ? `Make ${n * f} ads` : "Pick at least one idea";
  $("genHint").textContent = ro ? "" : n ? `${n} idea${n > 1 ? "s" : ""} × ${f} size${f > 1 ? "s" : ""}` : "";
}
$("dirs").onchange = (e) => { const id = e.target.dataset.on; if (id) { S.directions.find((d) => d.id === id).on = e.target.checked; renderDirs(); } };
$("dirs").oninput = (e) => { const id = e.target.dataset.note; if (id) S.directions.find((d) => d.id === id).note = e.target.value; };
$("genBtn").onclick = () => {
  if (S.mode === "replay") return go(4);
  const on = S.directions.filter((d) => d.on);
  log("you", `You picked idea${on.length > 1 ? "s" : ""} ${on.map((d) => d.id).join(", ")}`);
  on.filter((d) => d.note.trim()).forEach((d) => log("you", `You added a note to ${d.id}: "${d.note.trim()}"`));
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
  const g = (S.gen[d.id] = { status: "Making 2 options", cands: [null, null], scores: null, best: null, master: null, formats: {}, issues: [] });
  renderGen();
  const refs = [...productRefs(), ...styleRefs()];
  const prompt = masterPrompt(d);
  const cands = await Promise.all([0, 1].map(async (i) => {
    const r = await genImage({ prompt, fmt: "feed", refs, salt: d.id + i });
    g.cands[i] = r.image; renderGen(); return r;
  }));
  log("agent", `Idea ${d.id}: 2 images made${refs.length ? " using your images" : ""}`);
  g.status = "Picking the best";
  renderGen();
  let sc;
  try { sc = await api("score", { images: g.cands, direction: d, brandKit: S.kit, product: productRefs()[0] }); }
  catch (e) { sc = { scores: [], best: 0, issues: [] }; log("agent", `Idea ${d.id}: couldn't compare the images (${e.message}); kept candidate 1`); }
  g.scores = sc.scores || []; g.best = Math.min(Math.max(0, sc.best | 0), 1); g.master = g.cands[g.best]; g.issues = sc.issues || [];
  log("agent", `Idea ${d.id}: kept image ${g.best + 1}${g.scores[g.best] ? ` (${g.scores[g.best].score}/10)` : ""}`);
  g.status = "Resizing for each format"; renderGen();
  await Promise.all(fmtsOn().filter((f) => f !== "feed").map(async (f) => {
    g.formats[f] = "pending"; renderGen();
    const r = await genImage({ prompt: recomposePrompt(d, f), fmt: f, refs: [g.master, ...productRefs()], salt: d.id + f });
    g.formats[f] = r.image; renderGen();
  }));
  if (fmtsOn().some((f) => f !== "feed")) log("agent", `Idea ${d.id}: resized for ${fmtsOn().filter((f) => f !== "feed").map((f) => FMT[f].name).join(" and ")}`);
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
  results.forEach((r, i) => { if (r.status === "rejected") { S.gen[on[i].id].status = "Failed: " + r.reason.message; log("agent", `Idea ${on[i].id} stopped: ${r.reason.message}`); } });
  renderGen();
  await Promise.all(S.variants.map(async (v) => { v.contrast = await measureContrast(v, S.kit).catch(() => null); }));
  const n = S.variants.reduce((a, v) => a + flags(v).length, 0);
  log("agent", `${S.variants.length} ads checked: ${n ? `${n} thing${n === 1 ? "" : "s"} to look at` : "all clear"}`);
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
    const why = g.scores?.length ? `<p class="why">${g.scores.map((s, i) => `Option ${i + 1}: ${esc(s.why)}`).join(" · ")}</p>` : "";
    return `<div class="genrow"><div class="gh"><b>Idea ${d.id} · ${esc(d.name)}</b><span class="chip ${/Done/.test(g.status) ? "good" : /Failed/.test(g.status) ? "crit" : "agent"}">${esc(g.status)}</span></div>
      <div class="cands">${g.cands.map(cand).join("")}${fm ? `<span style="width:1px;background:var(--line);margin:0 6px"></span>${fm}` : ""}</div>${why}</div>`;
  }).join("");
}
$("toReview").onclick = () => { log("agent", "Ads that need you moved to the top"); go(5); };

/* ---------------- 5 review ---------------- */
function claimQs() { return (S.plan?.questions || []).filter((q) => q.kind === "claim" && q.phrase && S.answers[q.id] != null && /not|no/i.test(q.options[S.answers[q.id]] || "")); }
function flags(v) {
  const f = [];
  if (v.verify && !v.verify.ok) f.push({ k: "verify", kind: "you", label: "Check the edit", msg: v.verify.msg });
  for (const q of claimQs()) if (!v.claimOK && (v.headline + " " + v.sub).toLowerCase().includes(q.phrase.toLowerCase())) f.push({ k: "claim", kind: "you", label: "Claim", msg: `"${q.phrase}" isn't confirmed yet.`, q });
  for (const x of v.aiIssues || []) f.push({ k: x.id, kind: x.kind === "fix" ? "fix" : "you", label: x.label || "Review", msg: x.msg, ai: x });
  if (v.headline.length > FMT[v.fmt].limit) f.push({ k: "length", kind: "fix", label: "Copy length", msg: `Headline is ${v.headline.length} characters; ${FMT[v.fmt].name} allows ${FMT[v.fmt].limit}.` });
  if (v.contrast != null && v.contrast < 4.5) f.push({ k: "contrast", kind: "fix", label: "Contrast", msg: `Copy measures ${v.contrast}:1 against this image. It needs 4.5:1.` });
  return f;
}
const risk = (v) => v.status === "approved" ? -1 : (v.lastError ? 20 : 0) + flags(v).reduce((a, x) => a + (x.kind === "you" ? 10 : 3), 0);
const sorted = () => [...S.variants].sort((a, b) => risk(b) - risk(a));

/* history: every change is undoable */
const SNAP = ["image", "headline", "sub", "cta", "layout", "textTone", "scrim", "version", "change", "contrast", "aiIssues", "verify", "claimOK"];
function snapshot(v) { const o = {}; SNAP.forEach((k) => (o[k] = Array.isArray(v[k]) ? [...v[k]] : v[k])); return o; }
function pushHistory(v) { v.history = [...(v.history || []), snapshot(v)].slice(-12); }
function restore(v, snap) { SNAP.forEach((k) => (v[k] = snap[k])); v.status = "pending"; }
function undo(v) {
  const prev = v.history?.pop(); if (!prev) return;
  const from = v.version; restore(v, prev); v.lastError = null;
  log("you", `You undid v${from} on ${v.id}; back to v${v.version}`);
}

function renderReview() {
  const vs = S.variants; if (!vs.length) { $("grid").innerHTML = '<p class="empty">No variants yet.</p>'; $("detail").innerHTML = ""; $("rhead").innerHTML = ""; return; }
  const open = vs.filter((v) => v.status !== "approved");
  const clean = open.filter((v) => !flags(v).length && !v.lastError), you = open.filter((v) => v.lastError || flags(v).some((f) => f.kind === "you")), fix = open.filter((v) => !v.lastError && flags(v).length && !flags(v).some((f) => f.kind === "you"));
  const done = vs.length - open.length, ro = S.mode === "replay";
  $("rhead").innerHTML = `<span class="chip you">${you.length} need your call</span><span class="chip warn">${fix.length} we can fix</span><span class="chip good">${clean.length} ready</span><span class="chip">${done}/${vs.length} approved</span><span style="flex:1"></span>
    ${!ro && clean.length ? `<button class="btn sm" id="okClean">Approve ${clean.length} ready</button>` : ""}${done === vs.length || ro ? `<button class="btn sm" id="toDeliver">${ro ? "Next" : "Go to download"}</button>` : ""}`;
  if (!S.sel || !vs.find((v) => v.id === S.sel)) S.sel = (sorted().find((v) => v.status !== "approved") || vs[0]).id;
  $("grid").innerHTML = sorted().map((v) => { const f = flags(v), st = v.status === "approved" ? "var(--good)" : v.lastError ? "var(--crit)" : f.some((x) => x.kind === "you") ? "var(--you)" : f.length ? "var(--warn)" : "var(--line)";
    return `<button class="vc ${S.sel === v.id ? "sel" : ""}" data-id="${v.id}"><span class="stripe" style="background:${st}"></span><div class="thumb">${adHTML(v, S.kit, S)}</div>
    <div class="meta"><span>${v.dir} · ${FMT[v.fmt].name}${v.version > 1 ? " · v" + v.version : ""}</span>${v.status === "approved" ? '<span class="chip good">approved</span>' : ""}</div>
    <div class="flags">${v.lastError ? '<span class="chip crit">Failed</span>' : ""}${f.map((x) => `<span class="chip ${x.kind === "you" ? "you" : "warn"}">${esc(x.label)}</span>`).join("") || (v.status === "approved" || v.lastError ? "" : '<span class="chip good">ready</span>')}</div></button>`; }).join("");
  renderDetail();
  const a = $("okClean"); if (a) a.onclick = () => { clean.forEach((v) => (v.status = "approved")); log("you", `You approved ${clean.length} ready ad${clean.length > 1 ? "s" : ""} at once`); pickNext(); renderReview(); };
  const d = $("toDeliver"); if (d) d.onclick = () => { if (!ro) log("agent", "Files named and ready to download"); go(6); };
}
function pickNext() { const n = sorted().find((x) => x.status !== "approved"); if (n) S.sel = n.id; }
$("grid").onclick = (e) => { const b = e.target.closest(".vc"); if (b) { S.sel = b.dataset.id; renderReview(); } };

function flagButtons(x) {
  if (x.k === "verify") return `<button class="opt" data-undo="1">Undo this change</button><button class="opt" data-retry-edit="1">Try again</button><button class="opt" data-okverify="1">It's right, keep it</button>`;
  if (x.k === "claim") return `<button class="opt" data-claim="keep">Product confirmed it</button><button class="opt" data-claim="drop">Take it out of the copy</button>`;
  if (x.k === "contrast") return `<button class="opt" data-fix="contrast">Strengthen the shade behind the copy</button>`;
  if (x.k === "length") return `<button class="opt" data-fix="length">Shorten the headline</button>`;
  return `<button class="opt" data-fix="${x.k}">${x.kind === "fix" ? "Fix it in the image" : "Let the agent fix it"}</button><button class="opt" data-tell="${x.k}">Tell it what to do</button><button class="opt" data-keep="${x.k}">It's fine, keep it</button>`;
}
function renderDetail() {
  const v = S.variants.find((x) => x.id === S.sel); if (!v) return;
  const d = S.directions.find((x) => x.id === v.dir), f = flags(v), ro = S.mode === "replay", g = S.gen[v.dir];
  const passes = [["Must-include line", (S.plan.brief?.mandatory || []).length ? "present" : "none required"], ...(f.some((x) => x.k === "length") ? [] : [["Copy length", `${v.headline.length}/${FMT[v.fmt].limit}`]]), ...(f.some((x) => x.k === "contrast") || v.contrast == null ? [] : [["Contrast", `${v.contrast}:1`]]), ...(v.fmt === "story" ? [["Safe zones", "clear"]] : []), ...(v.verify?.ok ? [["Edit check", "matches the request"]] : [])];
  const prev = v.history?.length ? v.history[v.history.length - 1] : null;
  $("detail").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font:600 16px var(--display)">${esc(d?.name || v.dir)}</b><span style="display:flex;gap:6px;align-items:center">${!ro && prev ? `<button class="rowdl" id="undoBtn" title="Go back to v${prev.version}">Undo to v${prev.version}</button>` : ""}<span class="chip">${v.id}${v.version > 1 ? " · v" + v.version : ""}</span></span></div>
    <button class="big zoomable" id="bigAd" aria-label="Expand this ad">${adHTML(v, S.kit, S, { safe: v.fmt === "story" })}<span class="zoomhint">Click to expand${ro ? "" : " · mark an area"}</span></button>
    ${v.lastError ? `<div class="change err"><b>Didn't work:</b> ${esc(v.lastError.msg)} Nothing was changed.<div class="opts" style="margin-top:8px"><button class="opt" data-retry="1">Try again</button><button class="opt" data-dismiss="1">Dismiss</button></div></div>` : ""}
    ${v.change ? `<div class="change">${v.change.did?.length ? `<b>v${v.version} changes:</b> ${esc(v.change.did.join("; "))}.` : "<b>No change made.</b>"}${v.change.notDone?.length ? `<br><b>Couldn't do:</b> ${esc(v.change.notDone.join("; "))}.` : ""}</div>` : ""}
    ${v.fmt === "feed" && g?.scores?.length && v.version === 1 ? `<div class="qa"><b>Why we kept this image:</b> ${esc(g.scores[g.best]?.why || "")} (${g.scores[g.best]?.score}/10 vs ${g.scores[1 - g.best]?.score ?? "–"}/10)</div>` : ""}
    <ul class="checks">${f.map((x) => `<li><div class="ct"><b>${esc(x.label)}</b><span class="chip ${x.kind === "you" ? "you" : "warn"}">${x.kind === "you" ? "your call" : "we can fix"}</span></div><span>${esc(x.msg)}</span>${ro ? "" : `<div class="opts">${flagButtons(x)}</div>`}</li>`).join("")}
      ${passes.map(([a, b]) => `<li class="ok"><div class="ct"><span>${a}</span><span class="chip good">${esc(b)}</span></div></li>`).join("")}</ul>
    ${ro ? "" : `<div class="edit"><input id="hlEdit" value="${esc(v.headline)}" aria-label="Edit headline"><button class="btn ghost sm" id="saveHl">Save</button></div>
    <textarea class="note" id="reviseNote" rows="2" placeholder="Ask for a change, e.g. remove the jar behind the headline"></textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><label class="scope"><input type="checkbox" id="scopeDir"> Apply to every size of idea ${v.dir}</label><button class="btn ghost sm" id="revise">Make the change</button></div>
    <button class="btn" id="approve" ${f.length || v.lastError || v.status === "approved" ? "disabled" : ""}>${v.status === "approved" ? "Approved" : f.length ? `Sort out ${f.length} item${f.length > 1 ? "s" : ""} to approve` : "Approve"}</button>`}`;
  $("bigAd").onclick = () => openLightbox(v);
  if (ro) return;
  const D = $("detail");
  const u = $("undoBtn"); if (u) u.onclick = () => { undo(v); renderReview(); };
  D.querySelector("[data-undo]")?.addEventListener("click", () => { undo(v); renderReview(); });
  D.querySelector("[data-okverify]")?.addEventListener("click", () => { v.verify = { ok: true, msg: "Kept by the designer." }; log("you", `You kept the edit on ${v.id}`); renderReview(); });
  D.querySelector("[data-retry-edit]")?.addEventListener("click", async () => { const last = v.lastRequest; undo(v); if (last) await revise(v, last.note, false, `Asked the agent to try ${v.id} again`, null, last.marked); });
  D.querySelector("[data-retry]")?.addEventListener("click", async () => { const e = v.lastError; v.lastError = null; await revise(v, e.note, e.whole, `Retried on ${v.id}`, e.direct, e.marked, e.issueId); });
  D.querySelector("[data-dismiss]")?.addEventListener("click", () => { v.lastError = null; renderReview(); });
  D.querySelectorAll("[data-claim]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.claim === "keep") { S.variants.forEach((x) => (x.claimOK = true)); log("you", "Confirmed the claim; cleared it on every variant"); renderReview(); }
    else { const q = f.find((x) => x.k === "claim").q; await revise(v, `Remove the claim "${q.phrase}" from the headline and sub, keeping the same voice and length.`, true, "Took the claim out of the copy"); }
  }));
  D.querySelectorAll("[data-keep]").forEach((b) => (b.onclick = () => { pushHistory(v); v.aiIssues = v.aiIssues.filter((x) => x.id !== b.dataset.keep); log("you", `You kept ${v.id} as it is`); renderReview(); }));
  D.querySelectorAll("[data-tell]").forEach((b) => (b.onclick = () => { const issue = v.aiIssues.find((x) => x.id === b.dataset.tell); const n = $("reviseNote"); n.value = `About "${issue.label}": `; n.focus(); n.setSelectionRange(n.value.length, n.value.length); n.scrollIntoView({ block: "center", behavior: "smooth" }); }));
  D.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = async () => {
    const k = b.dataset.fix;
    if (k === "contrast") { pushHistory(v); v.scrim = Math.min(0.92, (v.scrim ?? 0.55) + 0.15); v.contrast = await measureContrast(v, S.kit); log("you", `Accepted a stronger shade on ${v.id}`); if (v.contrast < 4.5) log("agent", `${v.id} still measures ${v.contrast}:1; try again or revise the image`); renderReview(); }
    else if (k === "length") await revise(v, `Shorten the headline to ${FMT[v.fmt].limit - 4} characters or fewer, same idea and voice.`, false, "Asked the agent to shorten the headline");
    else { const issue = v.aiIssues.find((x) => x.id === k); await revise(v, issue.fix ? issue.fix : `Address this concern about the image: ${issue.msg}`, false, `Asked the agent to fix: ${issue.label}`, issue.kind === "fix" ? issue.fix : null, null, k); }
  }));
  $("saveHl").onclick = async () => { const t = $("hlEdit").value.trim(); if (!t || t === v.headline) return; pushHistory(v); v.headline = t; v.version++; v.change = { did: ["edited the headline by hand"], notDone: [] }; v.edited = true; v.status = "pending"; v.contrast = await measureContrast(v, S.kit).catch(() => null); log("you", `You edited the headline on ${v.id}`); renderReview(); };
  $("revise").onclick = async () => { const n = $("reviseNote").value.trim(); if (!n) return toast("Write a note first."); await revise(v, n, $("scopeDir").checked); };
  $("approve").onclick = () => { v.status = "approved"; log("you", `You approved ${v.id}`); pickNext(); renderReview(); };
}

/* one revision request; returns true only if something actually changed */
async function revise(v, note, wholeDirection, logText, directImageEdit, marked, issueId) {
  const targets = wholeDirection ? S.variants.filter((x) => x.dir === v.dir) : [v];
  $("detail").classList.add("busy"); lightboxBusy(true);
  log("you", logText || `You asked for a change on ${wholeDirection ? "every ad in idea " + v.dir : v.id}${marked ? " (marked area)" : ""}: "${note}"`);
  const before = targets.map(snapshot), statuses = targets.map((x) => x.status);
  try {
    const d = S.directions.find((x) => x.id === v.dir);
    let r;
    if (directImageEdit) r = { did: ["fixed it in the image"], notDone: [], imageEdit: directImageEdit };
    else {
      const preview = await renderImage(v, S.kit, S, $("stage"), "jpeg", 0.5, true).catch(() => null);
      r = await api("revise", { note, variant: v, direction: d, brandKit: S.kit, image: v.image, preview, marked });
    }
    const did = r.did || [], notDone = r.notDone || [];
    const changesCopy = r.copy && Object.values(r.copy).some(Boolean);
    if (!r.imageEdit && !changesCopy && !r.layout && !r.textTone) {
      targets.forEach((x) => (x.change = { did: [], notDone: notDone.length ? notDone : [note] }));
      log("agent", `Couldn't make that change${notDone.length ? ": " + notDone.join("; ") : ""}`);
      return false;
    }
    await Promise.all(targets.map(async (x) => {
      const oldImage = x.image;
      if (r.copy?.headline) x.headline = r.copy.headline; if (r.copy?.sub) x.sub = r.copy.sub; if (r.copy?.cta) x.cta = r.copy.cta;
      if (r.layout && ["top", "bottom", "center"].includes(r.layout)) x.layout = r.layout; if (r.textTone && ["light", "dark"].includes(r.textTone)) x.textTone = r.textTone;
      x.verify = null;
      if (r.imageEdit) {
        const refs = [x.image, ...(marked && x === v ? [marked] : []), ...productRefs()];
        const instr = `${r.imageEdit}${marked && x === v ? " The second reference image shows a red box around the area to change; change only that area and do not draw the box." : ""} Keep the composition, product, lighting and palette otherwise unchanged. No text, letters, logos or watermarks.`;
        const img = await genImage({ prompt: instr, fmt: x.fmt, refs, salt: x.id + x.version });
        x.image = img.image;
        try { x.verify = await api("verify", { request: note, instruction: r.imageEdit, before: oldImage, after: x.image, marked: x === v ? marked : null }); }
        catch { x.verify = null; }
      }
      x.version++; x.status = "pending"; x.change = { did, notDone }; x.lastError = null; x.lastRequest = { note, marked };
      x.contrast = await measureContrast(x, S.kit).catch(() => null);
    }));
    targets.forEach((x, i) => { x.history = [...(x.history || []), before[i]].slice(-12); });
    if (issueId) targets.forEach((x) => (x.aiIssues = (x.aiIssues || []).filter((y) => y.id !== issueId)));
    log("agent", `${targets.length > 1 ? targets.length + " ads" : v.id} updated: ${did.join("; ") || "done"}`);
    if (notDone.length) log("agent", `Couldn't do: ${notDone.join("; ")}`);
    const bad = targets.filter((x) => x.verify && !x.verify.ok);
    if (bad.length) log("agent", `Double-checked the edit: ${bad.map((x) => `${x.id}: ${x.verify.msg}`).join(" ")}`);
    else if (r.imageEdit) log("agent", "Double-checked the edit: it matches your note");
    return true;
  } catch (e) {
    targets.forEach((x, i) => { restore(x, before[i]); x.status = statuses[i]; });
    v.lastError = { msg: e.message, note, whole: wholeDirection, direct: directImageEdit, marked, issueId };
    log("agent", `That didn't work on ${v.id}: ${e.message} Nothing was changed.`);
    return false;
  } finally { $("detail").classList.remove("busy"); lightboxBusy(false); renderReview(); if (LB.v === v) renderLightbox(); }
}

/* ---------------- lightbox: expand, compare versions, mark an area ---------------- */
const LB = { v: null, mode: "ad", actual: false, viewing: null, mark: null, drawing: false };
function openLightbox(v) { Object.assign(LB, { v, mode: "ad", actual: false, viewing: null, mark: null }); renderLightbox(); document.body.style.overflow = "hidden"; }
function closeLightbox() { LB.v = null; $("lb")?.remove(); document.body.style.overflow = ""; }
function lightboxBusy(on) { $("lb")?.classList.toggle("busy", on); }
function renderLightbox() {
  const v = LB.v; if (!v) return;
  const ro = S.mode === "replay";
  const versions = [...(v.history || []), snapshot(v)];
  const shown = LB.viewing != null ? { ...v, ...versions[LB.viewing] } : v;
  const isOld = LB.viewing != null && LB.viewing < versions.length - 1;
  let el = $("lb"); if (!el) { el = document.createElement("div"); el.id = "lb"; el.className = "lb"; document.body.appendChild(el); }
  const [w, h] = FMT[v.fmt].px;
  const stageInner = LB.mode === "ad"
    ? `<div class="lbad" style="${LB.actual ? `width:${w}px;height:${h}px` : `height:min(78vh,${h}px);aspect-ratio:${w}/${h};max-width:100%`}">${adHTML(shown, S.kit, S)}</div>`
    : `<div class="lbimg" id="lbImgWrap"><img id="lbImg" src="${shown.image}" alt="" style="${LB.actual ? "max-width:none;max-height:none" : ""}" draggable="false">${LB.mark ? `<div class="markbox" style="left:${LB.mark.x * 100}%;top:${LB.mark.y * 100}%;width:${LB.mark.w * 100}%;height:${LB.mark.h * 100}%"></div>` : ""}</div>`;
  el.innerHTML = `<div class="lbpanel" role="dialog" aria-modal="true" aria-label="Expanded view of ${v.id}">
    <div class="lbbar"><b>${v.id} · ${FMT[v.fmt].name}</b>
      <div class="opts"><button class="opt" data-m="ad" aria-pressed="${LB.mode === "ad"}">With copy</button><button class="opt" data-m="img" aria-pressed="${LB.mode === "img"}">Image only${ro ? "" : " · mark an area"}</button><button class="opt" data-actual="1" aria-pressed="${LB.actual}">Actual size</button></div>
      <button class="lbx" id="lbClose" aria-label="Close">×</button></div>
    <div class="lbstage ${LB.actual ? "actual" : ""}">${stageInner}</div>
    ${versions.length > 1 ? `<div class="lbvers">${versions.map((s, i) => `<button class="lbv ${(LB.viewing ?? versions.length - 1) === i ? "on" : ""}" data-ver="${i}"><img src="${s.image}" alt=""><span>v${s.version}${i === versions.length - 1 ? " · current" : ""}</span></button>`).join("")}</div>` : ""}
    ${!ro && isOld ? `<div class="lbfoot"><span class="hint">You're looking at v${versions[LB.viewing].version}.</span><button class="btn sm" id="lbRestore">Restore v${versions[LB.viewing].version}</button></div>` : ""}
    ${!ro && LB.mode === "img" && !isOld ? `<div class="lbfoot">${LB.mark ? `<input id="lbNote" class="note" placeholder="What should change in the marked area? e.g. remove this jar" style="flex:1"><button class="btn sm" id="lbApply">Apply</button><button class="btn ghost sm" id="lbClear">Clear box</button>` : `<span class="hint">Drag on the image to draw a box around what you want changed.</span>`}</div>` : ""}
  </div>`;
  el.onclick = (e) => { if (e.target === el) closeLightbox(); };
  $("lbClose").onclick = closeLightbox;
  el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { LB.mode = b.dataset.m; renderLightbox(); }));
  el.querySelector("[data-actual]").onclick = () => { LB.actual = !LB.actual; renderLightbox(); };
  el.querySelectorAll("[data-ver]").forEach((b) => (b.onclick = () => { const i = +b.dataset.ver; LB.viewing = i === versions.length - 1 ? null : i; renderLightbox(); }));
  const rs = $("lbRestore"); if (rs) rs.onclick = () => { const i = LB.viewing, target = versions[i]; v.history = (v.history || []).slice(0, i); const top = Math.max(...versions.map((x) => x.version)); pushHistory(v); restore(v, target); v.version = top + 1; v.change = { did: [`restored v${target.version}`], notDone: [] }; log("you", `You brought back v${target.version} on ${v.id}`); LB.viewing = null; renderReview(); renderLightbox(); };
  const ap = $("lbApply"); if (ap) ap.onclick = async () => { const n = $("lbNote").value.trim(); if (!n) return toast("Say what should change in the box."); const marked = await markedImage(v.image, LB.mark); LB.mark = null; await revise(v, n, false, null, null, marked); };
  const cl = $("lbClear"); if (cl) cl.onclick = () => { LB.mark = null; renderLightbox(); };
  const wrap = $("lbImgWrap");
  if (wrap && !ro && !isOld) {
    const img = $("lbImg"); let start = null;
    const pt = (e) => { const r = img.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
    wrap.onpointerdown = (e) => { start = pt(e); wrap.setPointerCapture(e.pointerId); };
    wrap.onpointermove = (e) => { if (!start) return; const p = pt(e); LB.mark = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      let b = wrap.querySelector(".markbox"); if (!b) { b = document.createElement("div"); b.className = "markbox"; wrap.appendChild(b); }
      Object.assign(b.style, { left: LB.mark.x * 100 + "%", top: LB.mark.y * 100 + "%", width: LB.mark.w * 100 + "%", height: LB.mark.h * 100 + "%" }); };
    wrap.onpointerup = () => { start = null; if (LB.mark && (LB.mark.w < 0.02 || LB.mark.h < 0.02)) LB.mark = null; renderLightbox(); setTimeout(() => $("lbNote")?.focus(), 0); };
  }
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && LB.v) closeLightbox(); });
async function markedImage(src, m) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
  x.strokeStyle = "#ff1f1f"; x.lineWidth = Math.max(4, c.width * 0.008);
  x.strokeRect(m.x * c.width, m.y * c.height, m.w * c.width, m.h * c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

/* ---------------- 6 deliver ---------------- */
const FMT_ORDER = ["feed", "story", "banner"];
const ordered = () => [...S.variants].sort((a, b) => a.dir.localeCompare(b.dir) || FMT_ORDER.indexOf(a.fmt) - FMT_ORDER.indexOf(b.fmt));
const ext = () => ($("fileType")?.value === "jpeg" ? "jpg" : "png");
function fname(v, e = ext()) { return `${slug(S.plan?.brief?.brand, 2)}_${slug(S.plan?.brief?.product, 2)}_${v.dir.toLowerCase()}_${v.fmt}-${FMT[v.fmt].ratio}_v${v.version}.${e}`; }
function summary() {
  return `# ${S.plan?.brief?.brand || "Campaign"}: ${S.plan?.brief?.product || ""}\n\n${S.variants.length} approved variants\n\n` + ordered().map((v) => `- ${fname(v)}: "${v.headline}"`).join("\n") +
    `\n\nBrand kit: ${FONT_PAIRS[S.kit.fontPair]?.name}, palette ${Object.values(S.kit.palette).join(" ")}\nAgent actions: ${S.log.filter((e) => e.who === "agent").length}. Designer decisions: ${S.log.filter((e) => e.who === "you").length}. Images generated: ${S.images}.\n`;
}
function renderDeliver() {
  const secs = S.duration ?? Math.round((Date.now() - S.t0) / 1000);
  if (S.mode !== "replay" && S.duration == null) S.duration = secs;
  $("stats").innerHTML = [[S.variants.length, "ads approved"], [S.log.filter((e) => e.who === "agent").length, "steps we handled"], [S.log.filter((e) => e.who === "you").length, "decisions you made"], [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, "brief to finished ads"]].map(([a, b]) => `<div class="stat"><b>${a}</b><span>${b}</span></div>`).join("");
  $("pkg").innerHTML = `<thead><tr><th>File</th><th>Direction</th><th>Format</th><th>Headline</th><th></th></tr></thead><tbody>${ordered().map((v) => `<tr><td class="mono">${fname(v)}</td><td>${v.dir}</td><td>${FMT[v.fmt].name}</td><td>${esc(v.headline)}</td><td><button class="rowdl" data-dl="${v.id}">${ext().toUpperCase()}</button></td></tr>`).join("")}</tbody>`;
  $("saveRun").hidden = !(S.owner && S.mode !== "replay");
}
function saveBlob(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
$("pkg").onclick = async (e) => { const b = e.target.closest("[data-dl]"); if (!b) return; const v = S.variants.find((x) => x.id === b.dataset.dl); b.disabled = true; b.textContent = "…";
  try { saveBlob(fname(v), await renderImage(v, S.kit, S, $("stage"), ext() === "jpg" ? "jpeg" : "png")); } catch { toast("Couldn't render that file."); } b.disabled = false; b.textContent = ext().toUpperCase(); };
$("fileType").onchange = () => renderDeliver();
$("dlZip").onclick = async () => {
  const b = $("dlZip"); b.disabled = true;
  try {
    const zip = new window.JSZip(), dir = zip.folder(`${slug(S.plan?.brief?.brand)}_export`);
    const list = ordered();
    for (let i = 0; i < list.length; i++) { b.textContent = `Rendering ${i + 1}/${list.length}…`; dir.file(fname(list[i]), await renderImage(list[i], S.kit, S, $("stage"), ext() === "jpg" ? "jpeg" : "png")); }
    dir.file("handoff-summary.md", summary());
    b.textContent = "Zipping…"; saveBlob(`${slug(S.plan?.brief?.brand)}_export.zip`, await zip.generateAsync({ type: "blob" }));
    $("dlHint").textContent = "Downloaded."; if (S.mode !== "replay") log("you", "You downloaded your ads");
  } catch (e) { console.error(e); toast("Couldn't build the package. Try again."); }
  b.disabled = false; b.textContent = "Download all (.zip)";
};
$("copySum").onclick = async () => { try { await navigator.clipboard.writeText(summary()); $("dlHint").textContent = "Summary copied."; } catch { toast("Copy was blocked by the browser."); } };
$("saveRun").onclick = () => {
  const run = { ...S, variants: S.variants.map(({ history, lastError, lastRequest, ...v }) => v), token: null, owner: false, mode: null, title: `${S.plan?.brief?.brand || "Run"}: ${S.plan?.brief?.product || ""}`, savedAt: new Date().toISOString() };
  saveBlob(`run-${slug(S.plan?.brief?.brand)}-${slug(S.plan?.brief?.product)}.json`, new Blob([JSON.stringify(run)], { type: "application/json" }));
  $("dlHint").textContent = "Saved. Add it to the examples folder to publish it as a replay (see README).";
};
$("restart").onclick = () => { shownLog = 0; const keep = { token: null, mode: S.mode === "replay" ? null : S.mode }; S = fresh(); Object.assign(S, keep); $("replayPick").value = ""; renderLog(); go(1); };

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

/* ---------------- example panel (before a run) ---------------- */
const SAMPLE = {
  kit: { name: "Halcyon Tea", fontPair: "fraunces-inter", logoColor: "auto", palette: { bg: "#123f3c", ink: "#0b2826", light: "#f5f0e6", accent: "#f0a43a", accent2: "#d6eadf" } },
  run: { assets: [], plan: { brief: { brand: "Halcyon Tea", mandatory: ["Offer ends May 19."] } } },
  ideas: [
    { label: "Idea A · a calm still life", v: { fmt: "feed", headline: "Cold brew. Eight minutes.", sub: "No machine, just your fridge.", cta: "Pre-order · 15% off", layout: "top", textTone: "dark", scrim: 0 } },
    { label: "Idea B · the fridge as the hero", v: { fmt: "feed", headline: "Let the fridge do it.", sub: "Café-quality cold brew at home.", cta: "Pre-order", layout: "bottom", textTone: "light", scrim: 0 } },
  ],
};
async function renderShowcase() {
  let data = SAMPLE;
  try { const r = await fetch("/examples/showcase.json", { cache: "no-store" }); if (r.ok) data = { ...SAMPLE, ...(await r.json()) }; } catch {}
  const a = data.ideas[0].v;
  const sizes = ["feed", "story", "banner"].map((f) => ({ ...a, ...(data.sizes?.[f] || {}), fmt: f }));
  const tile = (v, cap) => `<figure class="sctile"><div class="scad">${adHTML(v, data.kit, data.run)}</div><figcaption>${esc(cap)}</figcaption></figure>`;
  $("showcase").innerHTML = `<span class="eyebrow">Example</span><h3 class="sch">One brief, a full set of ads</h3>
    <blockquote class="scbrief">"Halcyon Tea is launching Cold Steep, a cold-brew tea line… café-quality in 8 minutes. Tone: calm, crisp, a little witty."</blockquote>
    <p class="sclabel"><b>Different ideas.</b> Each one is its own concept, with its own headline and look.</p>
    <div class="scrow two">${data.ideas.map((x) => tile(x.v, x.label)).join("")}</div>
    <p class="sclabel"><b>Every size.</b> The idea you pick is resized to fit each place it runs.</p>
    <div class="scrow three">${sizes.map((v) => tile(v, FMT[v.fmt].name)).join("")}</div>
    <button class="btn ghost sm" id="scTry">Try this brief</button>`;
  $("scTry").onclick = () => { if (S.mode === "replay") return; $("brief").value = EXAMPLE_BRIEFS[0].brief; S.brief = $("brief").value; renderBrief(); $("brief").focus(); };
}

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
paintSky(); loadReplays(); renderShowcase(); renderLog(); go(1);
window.__proofline = () => S; // handy for debugging in the console
