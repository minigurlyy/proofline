import { handler, spend, MOCK, askClaude, sleep } from "./_lib.js";

export default handler(async (b, req) => {
  const t = await spend(req, "ai");
  const { images = [], direction = {}, brandKit = {}, product } = b;
  if (MOCK || t.mock) { await sleep(800); return { scores: images.map((_, i) => ({ score: 8 - i, why: i ? "Busier copy area." : "Calm space for the headline, palette on brand." })), best: 0, issues: direction.id === "C" ? [{ kind: "fix", label: "Copy area", msg: "Bright highlights sit where the headline goes.", fix: "Calm and darken the area where the headline sits; keep everything else the same." }] : [] }; }
  const imgs = images.slice(0, 3).map((d, i) => ({ label: `Candidate ${i + 1}`, data: d }));
  if (product) imgs.push({ label: "Reference: the real product photo", data: product });
  return await askClaude({
    system: "You are Proofline's art-direction reviewer. You judge generated ad imagery like a senior designer. You answer with JSON only.",
    images: imgs,
    maxTokens: 1500,
    text: `Direction: ${JSON.stringify({ name: direction.name, hook: direction.hook, layout: direction.layout, textTone: direction.textTone })}
Brand kit: ${JSON.stringify(brandKit)}
The headline will be set in code over the image (layout "${direction.layout}": ${direction.layout === "top" ? "upper third" : direction.layout === "bottom" ? "lower third" : "middle band"}), in ${direction.textTone === "light" ? "light" : "dark"} type.
Score each candidate 1-10 on: brand fit, craft (no artifacts, believable light), calm space for the copy${product ? ", and faithfulness to the real product" : ""}. Pick the best. Then list real problems with the best one only.
Return JSON: {"scores":[{"score":0,"why":"max 14 words"}],"best":0,"issues":[{"kind":"you"|"fix","label":"2-3 words","msg":"one sentence","fix":"an image-edit instruction, only for kind fix"}]}
kind "fix": something an image edit can repair (stray text, artifacts, clutter in the copy area). kind "you": a judgment call for the designer (mood, product accuracy, taste). No issues is fine.`,
  });
});
