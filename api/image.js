import { handler, spend, MOCK, falImage, mockImage, sleep } from "./_lib.js";

export default handler(async (b, req) => {
  await spend(req, "img");
  const { prompt = "", fmt = "feed", refs = [], seed, palette, salt } = b;
  if (!prompt.trim()) { const e = new Error(); e.status = 400; e.publicMessage = "Missing image prompt."; throw e; }
  if (MOCK) { await sleep(700 + Math.random() * 900); return { image: mockImage(fmt, palette, (salt || "") + prompt.slice(0, 40), prompt), model: refs.length ? "mock-edit" : "mock-generate", seed: 1 }; }
  return await falImage({ prompt: prompt.slice(0, 2000), fmt, refs, seed });
});
