import { handler, spend, MOCK, askClaude, sleep, MODELS } from "./_lib.js";
import { mockDirections } from "./_prompts.js";

export default handler(async (b, req) => {
  await spend(req, "ai");
  const { plan, answers = {}, hasProduct = false, hasStyle = false } = b;
  if (MOCK) { await sleep(1100); return mockDirections(plan, hasProduct); }
  const master = hasProduct ? `${MODELS.edit} (keeps the uploaded product photo accurate)` : `${MODELS.image} (photoreal text-to-image)`;
  return await askClaude({
    system: "You are Proofline's creative director agent. You write distinct, on-brief ad concepts and plan how each one gets made. You answer with JSON only.",
    text: `PLAN:
${JSON.stringify(plan)}
DESIGNER ANSWERS: ${JSON.stringify(answers)}
UPLOADED: product photo ${hasProduct ? "yes" : "no"}, style references ${hasStyle ? "yes" : "no"}.

Propose exactly 3 clearly different creative directions. Return JSON:
{"directions":[{
 "id":"A"|"B"|"C",
 "name":"2-5 word concept name",
 "hook":"one sentence on the idea",
 "headline":"max 36 characters, in the brand voice",
 "sub":"max 90 characters",
 "cta":"max 22 characters",
 "layout":"top"|"bottom"|"center",
 "textTone":"light"|"dark",
 "imagePrompt":"a detailed image-generation prompt, 60-110 words",
 "modelPlan":[["Master image","..."],["Formats","..."],["Selection","..."]]
}]}
Rules:
- The headline, sub and CTA are set in code on top of the image, so the imagePrompt must ask for NO text, letters, logos or watermarks, and must leave calm negative space where the copy sits (layout "top": upper third; "bottom": lower third; "center": middle band).
- textTone is the color of the copy: "light" when the copy area of the image will be dark, "dark" when it will be light.
- imagePrompt: describe subject, setting, lighting, lens or medium, mood and the brand palette (${JSON.stringify(plan?.brandKit?.palette || {})}). ${hasProduct ? "Refer to 'the product from the reference image' and keep its shape, label and colors exactly." : "Describe the product plausibly from the brief."}
- If a designer answer says a claim is NOT confirmed, keep that claim out of the headline.
- modelPlan: Master image uses ${master}; Formats: ${MODELS.edit} recomposes the chosen master to 9:16 and 16:9 so the scene stays consistent; Selection: 2 candidates, Claude scores brand fit and picks one. Write each as a short phrase with the reason.`,
  });
});
