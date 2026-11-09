import { handler, spend, MOCK, askClaude, sleep } from "./_lib.js";
import { FONT_IDS, mockPlan } from "./_prompts.js";

export default handler(async (b, req) => {
  await spend(req, "ai");
  const brief = String(b.brief || "").slice(0, 6000);
  if (brief.trim().length < 20) { const e = new Error(); e.status = 400; e.publicMessage = "Add a few sentences to the brief first."; throw e; }
  const assets = (b.assets || []).slice(0, 4);
  if (MOCK) { await sleep(900); return mockPlan(brief, assets); }
  const roles = assets.map((a, i) => `Image ${i + 1}: ${a.role} (${a.name || "upload"})`).join("\n") || "No images uploaded.";
  return await askClaude({
    system: "You are Proofline's planning agent. You read creative briefs for ad campaigns like a senior designer and producer. You answer with JSON only.",
    images: assets.map((a, i) => ({ label: `Image ${i + 1}, role: ${a.role}`, data: a.data })),
    text: `BRIEF:
"""${brief}"""

UPLOADED IMAGES:
${roles}

Read the brief and any images. Return JSON with exactly this shape:
{
 "brief": {"brand":"", "product":"", "launch":"", "goal":"", "audience":"", "keyMessage":"", "offer":"", "mandatory":["exact lines the ads must include"], "tone":"", "formatsMentioned":["feed"|"story"|"banner"]},
 "brandKit": {"name":"", "palette":{"bg":"#hex","ink":"#hex","light":"#hex","accent":"#hex","accent2":"#hex"}, "fontPair":"one id from FONT PAIRS", "voice":"one sentence", "source":"how you derived it, e.g. from the uploaded logo, or inferred from the brief"},
 "assetsRead": [{"role":"", "summary":"one sentence on what the image shows and what matters for the ads"}],
 "questions": [{"id":"q1","kind":"claim"|"gap","text":"","options":["",""],"phrase":"exact claim phrase from the brief, for claim questions"}]
}
FONT PAIRS (id: display / body): ${FONT_IDS}
Rules:
- Use "" for anything the brief doesn't say. Never invent facts, prices or dates.
- Palette: derive from the uploaded logo, product or style images when present, otherwise choose one that fits the brand. "ink" must read on "bg" and "light" must read on "ink" (contrast at least 4.5:1).
- Ask at most 2 questions, only where a wrong guess would hurt: product claims that need proof (numbers, durations, superlatives, health or price claims) with options like "Yes, it's confirmed" / "Not yet, flag it in review", or a critical gap in the brief. Zero questions is fine.
- formatsMentioned: which of feed (4:5), story (9:16), banner (1.91:1) the brief asks for; all three if it doesn't say.`,
  });
});
