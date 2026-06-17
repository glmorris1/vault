# Vault Photo Assistant LLM Lab

Standalone test page for comparing Photo Assistant vision results across models.

This folder is intentionally separate from the Vault app and is suitable for GitHub Pages. It does not sync into Capacitor/iOS unless someone deliberately moves it into the app source.

## Use

1. Open `index.html` in a browser, or publish this folder with GitHub Pages.
2. Paste temporary API keys for the providers you want to test.
3. Take or upload one photo.
4. Run OpenAI, Gemini Flash, and Gemini Flash-Lite side by side.
5. Compare labels, pin placement, result JSON, elapsed time, and estimated cost per 100 photos.

The page uses the current Vault Photo Assistant prompt snapshot from `functions/src/index.ts` and sends image data directly from the browser to the selected model provider. Keep test keys restricted and rotate them after testing.

