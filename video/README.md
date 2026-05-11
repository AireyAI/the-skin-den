# Videos

This folder holds the per-client Veo3 videos. Empty by default — generate these before shipping the site.

Required (or remove the video elements in `index.html` / `intro.html`):

- **`hero-shoulder.mp4`** — the 8-second ambient loop that plays behind the homepage hero headline. Should be on-brand (client's accent color as rim light), cinematic, silent, 16:9.
- **`hero-shoulder-poster.jpg`** — a single still frame from the video, used as the poster while the MP4 loads.
- **`intro-manifesto.mp4`** — the 8-second cinematic splash played on the intro page. Usually 2-3 cut vignettes that tell the brand's story in a sentence.

## Generating with Veo3

```bash
GEMINI_API_KEY="<your key>"
curl "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{"prompt": "<your prompt here>"}],
    "parameters": {"aspectRatio": "16:9", "durationSeconds": 8}
  }'
# Poll the operation name it returns, then download the video URI.
```

Keep prompts specific: rim-light colour, silhouette / subject, camera motion, grade.

## Alternative — no video

If the client doesn't want a hero video, open `index.html` and delete the `<video id="heroVideo">` block and the accompanying `<script>` that sets playbackRate. The overlay-only hero still looks premium.

For `intro.html`, the built-in safety net auto-shows the logo after 3 s if the video is missing, so the page still works — but consider deleting `intro.html` entirely and removing the first-visit redirect block from `index.html` if you don't want a splash at all.
