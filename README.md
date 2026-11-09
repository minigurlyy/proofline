# Proofline

Proofline turns a creative brief into on-brand ad variants. The agent does the multiplying, and the designer makes the calls at three checkpoints: confirming the plan, choosing and steering directions, and approving the work.

**How it works**

1. **Brief.** Paste a brief and, if you have them, upload a product photo, logo or style references.
2. **Plan (checkpoint 1).** Claude structures the brief, builds a brand kit (palette and type pairing) from your assets, and asks about anything risky, like unproven product claims.
3. **Directions (checkpoint 2).** Claude proposes three concepts, each with copy, a layout and a plan for which model makes it. You drop or steer each one.
4. **Generate.** For each direction, the image model makes two candidates. Claude scores them for brand fit, craft and room for the copy, and picks one. The winner is then recomposed into every format with an edit model so the scene stays consistent.
5. **Review (checkpoint 3).** Variants are sorted by risk. Checks include unconfirmed claims, Claude's art-direction notes, copy length, and real contrast measured from the image. Revision notes are read by Claude; anything it can't do is listed back.
6. **Deliver.** Full-size PNGs (1080×1350, 1080×1920, 1200×628) in a ZIP with a handoff summary.

Copy, logo and legal lines are set in code on top of the generated image, so text is always spelled right and on-brand.

**Models**

| Job | Model | Why |
| --- | --- | --- |
| Reading briefs and images, directions, scoring, revisions | Claude (`claude-sonnet-5-5`) | Reasoning and vision in one model |
| New images | FLUX.2 Pro on fal (`fal-ai/flux-2-pro`) | Photoreal, follows long prompts |
| Product photos, format recomposition, edits | Nano Banana 2 Edit on fal (`fal-ai/nano-banana-2/edit`) | Keeps a reference image faithful while changing it |

You can swap any of them with environment variables.

---

## Setup (about 20 minutes)

### 1. Get your API keys
- **Anthropic:** console.anthropic.com → API Keys → Create key. Set a monthly spend limit under Billing.
- **fal:** fal.ai → Dashboard → Keys → Add key. Add a small credit balance (live runs cost roughly $0.50–$1 each, mostly images).

### 2. Put the code on GitHub
Create an empty repo named `proofline`, then push this folder to it.

### 3. Deploy on Vercel
1. vercel.com → Add New → Project → import the `proofline` repo. No build settings are needed.
2. Under **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY`, `FAL_KEY`
   - `OWNER_PASSCODE`: a private word only you know
   - `RUN_SECRET`: any long random string
   - optional: `LIVE_RUNS_PER_DAY` (default 20), `LIVE_RUNS_PER_IP` (default 2)
3. Recommended: **Storage → Marketplace → Upstash Redis → Connect**. This keeps the public limits accurate across Vercel's servers. Without it, limits are best-effort.
4. Redeploy. Your link will look like `proofline-yourname.vercel.app`.

### 4. Unlock owner mode on your browser
Open `https://your-link/?owner=YOUR_PASSCODE` once. That browser now has unlimited live runs and a **Save run as example** button on the last step. The passcode is removed from the address bar right away.

Without keys, the app runs in **practice mode** with placeholder images. You can also add `?practice=1` to your live link to click through the whole flow for free, without spending any credits.

---

## Recording demo runs

1. In owner mode, do a run end to end. Use the example briefs or your own.
2. On the last step, click **Save run as example**. You get a `run-….json` file.
3. Put it in the `examples/` folder and add it to `examples/index.json`:
   ```json
   [{ "file": "run-halcyon-tea-cold-steep.json", "title": "Cold-brew tea launch" }]
   ```
4. Commit and push. Visitors can now pick it from **Example runs**. It autoplays through every step at no cost to you, and clicking anywhere takes over.

**Screen recording tips**
- Add `?record=1` to the URL to hide the small tag in the header.
- Record at 1440×900 or 1920×1080, browser zoom 100%, bookmarks bar hidden.
- Run once to warm up, then record the second run. Generation takes about a minute, so speed that part up in editing.
- For a clean cut, use a replay: it plays at a steady pace with no waiting.

## Local development

```
npm install
cp .env.example .env   # add keys, or leave empty for mock mode
npm run dev            # http://localhost:3000
npm run dev:mock       # force mock mode
```

## Costs and limits
- Visitors get `LIVE_RUNS_PER_IP` live runs per day, and everyone together gets `LIVE_RUNS_PER_DAY`. Each run is capped at 24 images and 30 AI calls.
- Keep spend limits on in both the Anthropic and fal dashboards as a backstop.

Proofline is a design concept and isn't affiliated with any of the companies whose models it uses. All brands in the example briefs are invented.
