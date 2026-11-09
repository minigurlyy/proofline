import { handler, spend, MOCK, askClaude, sleep } from "./_lib.js";
import { mockRevise } from "./_prompts.js";

export default handler(async (b, req) => {
  await spend(req, "ai");
  const { note = "", variant = {}, direction = {}, brandKit = {}, image } = b;
  if (!note.trim()) { const e = new Error(); e.status = 400; e.publicMessage = "Write a note first."; throw e; }
  if (MOCK) { await sleep(700); return mockRevise(note); }
  return await askClaude({
    system: "You are Proofline's revision agent. You turn a designer's note into concrete changes, and you are explicit about anything you can't do. You answer with JSON only.",
    images: image ? [{ label: "Current image (copy is set in code on top of it)", data: image }] : [],
    maxTokens: 1200,
    text: `Designer's note: """${note.slice(0, 1200)}"""
Current ad: ${JSON.stringify({ format: variant.fmt, headline: variant.headline, sub: variant.sub, cta: variant.cta, layout: variant.layout, textTone: variant.textTone })}
Direction: ${JSON.stringify({ name: direction.name, hook: direction.hook })}
Brand kit: ${JSON.stringify(brandKit)}
What you can change:
- copy: headline (max 36 chars), sub (max 90), cta (max 22)
- layout: "top" | "bottom" | "center"; textTone: "light" | "dark"
- the image, through ONE image-edit instruction to an edit model that sees the current image (it can add, remove or restyle objects, change background, light, color, mood). Never ask the image for text or logos.
You can't change: fonts, logo files, the legal line, the format size, or anything requiring real-world facts you don't have.
Return JSON: {"did":["short past-tense phrases in the designer's words"],"notDone":["parts of the note you can't do, quoted or paraphrased"],"copy":{"headline":"","sub":"","cta":""},"layout":"","textTone":"","imageEdit":"instruction or empty"}
Only include copy fields, layout or textTone you are changing. Every part of the note must end up in "did" or "notDone".`,
  });
});
