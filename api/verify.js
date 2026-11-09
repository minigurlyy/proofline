import { handler, spend, MOCK, askClaude, sleep } from "./_lib.js";

// After an image edit, Claude compares before and after against the request, so a wrong edit is caught and shown.
export default handler(async (b, req) => {
  const t = await spend(req, "ai");
  const { request = "", instruction = "", before, after, marked } = b;
  if (MOCK || t.mock) { await sleep(500); return { ok: true, msg: "The change matches the request." }; }
  return await askClaude({
    system: "You are Proofline's QA reviewer. You check whether an image edit did what was asked, and nothing else. You answer with JSON only.",
    maxTokens: 600,
    images: [{ label: "BEFORE", data: before }, { label: "AFTER", data: after }, ...(marked ? [{ label: "The area the designer marked (red box)", data: marked }] : [])],
    text: `The designer asked: """${request.slice(0, 800)}"""
The edit instruction sent was: """${instruction.slice(0, 800)}"""
Compare BEFORE and AFTER. Did the intended change happen, on the right object or area, without unrequested changes elsewhere?
Return JSON: {"ok":true|false,"msg":"one sentence a designer can act on, naming what's wrong if not ok"}`,
  });
});
