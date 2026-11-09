// Curated type pairings the planning agent can choose from (ids match api/_prompts.js).
export const FONT_PAIRS = {
  "fraunces-inter": { name: "Fraunces / Inter", display: "Fraunces", dw: 600, ds: "normal", body: "Inter", css: "family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600;700" },
  "playfair-inter": { name: "Playfair Display / Inter", display: "Playfair Display", dw: 700, ds: "normal", body: "Inter", css: "family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700" },
  "dmserif-dmsans": { name: "DM Serif Display / DM Sans", display: "DM Serif Display", dw: 400, ds: "normal", body: "DM Sans", css: "family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700" },
  "instrument-inter": { name: "Instrument Serif / Inter", display: "Instrument Serif", dw: 400, ds: "italic", body: "Inter", css: "family=Instrument+Serif:ital@1&family=Inter:wght@400;500;600;700" },
  "bricolage": { name: "Bricolage Grotesque", display: "Bricolage Grotesque", dw: 700, ds: "normal", body: "Bricolage Grotesque", css: "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700" },
  "archivo": { name: "Archivo Black / Archivo", display: "Archivo Black", dw: 400, ds: "normal", body: "Archivo", css: "family=Archivo+Black&family=Archivo:wght@400;500;600;700" },
  "syne-manrope": { name: "Syne / Manrope", display: "Syne", dw: 700, ds: "normal", body: "Manrope", css: "family=Syne:wght@700&family=Manrope:wght@400;500;600;700" },
  "unbounded-manrope": { name: "Unbounded / Manrope", display: "Unbounded", dw: 600, ds: "normal", body: "Manrope", css: "family=Unbounded:wght@600&family=Manrope:wght@400;500;600;700" },
};
const loaded = new Set();
export function loadPair(id) {
  const p = FONT_PAIRS[id] || FONT_PAIRS["fraunces-inter"];
  if (!loaded.has(id)) {
    loaded.add(id);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.crossOrigin = "anonymous"; // lets the PNG export embed the fonts
    l.href = `https://fonts.googleapis.com/css2?${p.css}&display=swap`;
    document.head.appendChild(l);
  }
  return p;
}
