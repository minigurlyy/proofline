// Font pair ids (must match src/fonts.js) and mock-mode answers for local development.
export const FONT_IDS = [
  "fraunces-inter: Fraunces / Inter (warm editorial serif)",
  "playfair-inter: Playfair Display / Inter (classic, luxurious)",
  "dmserif-dmsans: DM Serif Display / DM Sans (friendly serif)",
  "instrument-inter: Instrument Serif / Inter (refined, minimal)",
  "bricolage: Bricolage Grotesque / Bricolage Grotesque (playful modern)",
  "archivo: Archivo Black / Archivo (bold, punchy)",
  "syne-manrope: Syne / Manrope (expressive, art-forward)",
  "unbounded-manrope: Unbounded / Manrope (techy, wide)",
].join("; ");

function guessBrand(brief) {
  const m = /([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\s(?:is|are)\s/.exec(brief);
  return m ? m[1] : "Your Brand";
}
const firstMatch = (re, t, d = "") => (re.exec(t) || [, d])[1].trim();

export function mockPlan(brief, assets) {
  const brand = guessBrand(brief);
  const claim = /(\d+\s?(?:minutes|min|hours|days|x|%))/i.exec(brief);
  return {
    brief: {
      brand, product: firstMatch(/launching\s+([^,.]+)/i, brief, "New product"), launch: firstMatch(/on\s+([A-Z][a-z]+ \d{1,2})/, brief),
      goal: firstMatch(/Goal:\s*([^\n]+)/i, brief), audience: firstMatch(/(?:aged|audience:?)\s*([^\n.]+)/i, brief),
      keyMessage: firstMatch(/Key message:\s*([^\n]+)/i, brief), offer: firstMatch(/Offer:\s*([^\n.]+)/i, brief),
      mandatory: [firstMatch(/Must include\s*"([^"]+)"/i, brief)].filter(Boolean), tone: firstMatch(/Tone:\s*([^\n]+)/i, brief), formatsMentioned: ["feed", "story", "banner"],
    },
    brandKit: { name: brand, palette: { bg: "#123f3c", ink: "#0b2826", light: "#f5f0e6", accent: "#f0a43a", accent2: "#d6eadf" }, fontPair: "fraunces-inter", voice: "Calm, crisp and a little witty.", source: assets.length ? "From the uploaded images (mock)" : "Inferred from the brief (mock)" },
    assetsRead: assets.map((a) => ({ role: a.role, summary: `Mock read of the ${a.role}.` })),
    questions: claim ? [{ id: "q1", kind: "claim", text: `"${claim[1]}" is a product claim. Has it been confirmed?`, options: ["Yes, it's confirmed", "Not yet, flag it in review"], phrase: claim[1] }] : [],
  };
}

export function mockDirections(plan) {
  const p = plan?.brief?.product || "the product";
  const mk = (id, name, hook, headline, sub, cta, layout, textTone, scene) => ({
    id, name, hook, headline, sub, cta, layout, textTone,
    imagePrompt: `${scene}, ${p}, no text, no logos, calm negative space for copy`,
    modelPlan: [["Master image", "FLUX.2 Pro, photoreal scene"], ["Formats", "Nano Banana 2 Edit recomposes to 9:16 and 16:9"], ["Selection", "2 candidates, Claude picks by brand fit"]],
  });
  return { directions: [
    mk("A", "The slow ritual", "A calm, slow-living take on a fast product.", "Café-quality, in 8 minutes.", "Steep it in the fridge. Pour over ice. Done.", "Pre-order · 15% off", "top", "dark", "Overhead morning light on a linen table"),
    mk("B", "Café, minus the line", "Witty and type-led: the café without the wait.", "All the café. None of the line.", "Brews in your fridge while you get ready.", "Pre-order with STEEP15", "bottom", "light", "Moody café counter at dusk, shallow depth of field"),
    mk("C", "Cold front", "Bold color blocking for the first warm week.", "Cold front incoming.", "Out May 12. Ice not included.", "Get 15% off", "top", "light", "Deep teal studio backdrop with flying ice, high-speed flash"),
  ] };
}

export function mockRevise(note) {
  const t = note.toLowerCase(), did = [], notDone = [], out = { did, notDone, copy: {}, imageEdit: "" };
  const edits = [];
  if (/ice/.test(t)) { edits.push("replace the flat squares with realistic translucent ice cubes"); did.push("swapped in realistic ice cubes"); }
  if (/gra[a-z]{0,3}d[a-z]{0,3}nt/.test(t)) { edits.push("give the background a soft gradient"); did.push("added a soft gradient background"); }
  if (/straw/.test(t)) { edits.push("add a striped straw floating next to the bottle"); did.push("added a floating straw"); }
  if (/bottom/.test(t)) { out.layout = "bottom"; did.push("moved the copy to the bottom"); }
  if (/shorter|shorten/.test(t)) { out.copy.headline = "Cold brew, minus the wait."; did.push("shortened the headline"); }
  if (/neon|font|logo/.test(t)) notDone.push(/neon/.test(t) ? "a neon sign" : "changing the font or logo");
  out.imageEdit = edits.join("; ");
  if (!did.length && !notDone.length) notDone.push(note);
  return out;
}
