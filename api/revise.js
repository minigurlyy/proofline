import { handler, spend, MOCK, askClaude, sleep } from "./_lib.js";
import { mockRevise } from "./_prompts.js";

export default handler(async (b, req) => {
  await spend(req, "ai");
  const { note = "", variant = {}, direction = {}, brandKit = {}, image, preview, marked } = b;
  if (!note.trim()) { const e = new Error(); e.status = 400; e.publicMessage = "Write a note first."; throw e; }
  if (MOCK) { await sleep(700); return mockRevise(note); }
  return await askClaude({
    system: "You are Proofline's revision agent. You turn a designer's note into concrete changes, and you are explicit about anything you can't do. You answer with JSON only.",
    images: [
      ...(preview ? [{ label: "IMAGE 1: the ad as the designer sees it, with the copy on top. Use this to understand words like 'behind the text' or 'next to the headline'.", data: preview }] : []),
      ...(image ? [{ label: "IMAGE 2: the generated image alone, without copy. Your image edit applies to this.", data: image }] : []),
      ...(marked ? [{ label: "IMAGE 3: the same image with a RED BOX the designer drew around the area the note is about.", data: marked }] : []),
    ],
    maxTokens: 1200,
    text: `Designer's note: """${note.slice(0, 1200)}"""
Current ad: ${JSON.stringify({ format: variant.fmt, headline: variant.headline, sub: variant.sub, cta: variant.cta, layout: variant.layout, textTone: variant.textTone })}
Direction: ${JSON.stringify({ name: direction.name, hook: direction.hook })}
Brand kit: ${JSON.stringify(brandKit)}
What you can change:
- copy: headline (max 36 chars), sub (max 90), cta (max 22)
- layout: "top" | "bottom" | "center"; textTone: "light" | "dark"
- the image, through ONE image-edit instruction to an edit model that sees the current image (it can add, remove or restyle objects, change background, light, color, mood). Never ask the image for text or logos.
Precision rules for imageEdit:
- The edit model can't see the copy, so never refer to "the text" or "the headline". Name the target by its position in the frame (e.g. "upper-left quarter", "partly cropped by the top edge") and its look (material, color, size), and say what must stay untouched.
- If several similar objects exist, identify exactly one and explicitly say the others stay.${marked ? "\n- The designer marked an area: the change applies only inside the red box in IMAGE 3. Describe that area by position so the edit model can find it." : ""}
You can't change: fonts, logo files, the legal line, the format size, or anything requiring real-world facts you don't have.
Return JSON: {"target":"which object or area you are changing, by position, or empty","did":["short past-tense phrases in the designer's words"],"notDone":["parts of the note you can't do, quoted or paraphrased"],"copy":{"headline":"","sub":"","cta":""},"layout":"","textTone":"","imageEdit":"instruction or empty"}
Only include copy fields, layout or textTone you are changing. Every part of the note must end up in "did" or "notDone".`,
  });
});
