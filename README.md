# Churn

An unofficial browser visualizer powered by [Butterchurn](https://github.com/jberg/butterchurn) and classic MilkDrop presets.

Churn is a standalone interface and integration project. Butterchurn provides the WebGL rendering engine, and `butterchurn-presets` provides the converted presets and their artist credits. Churn does not implement the MilkDrop renderer, create the bundled preset artwork, or port MilkDrop3's native code.

## What Churn adds

- A responsive source and preset interface around Butterchurn
- Microphone input with device selection, sensitivity, a live level meter, and a no-signal warning
- Shared tab or screen audio when supported by the browser
- Local audio file playback and drag-and-drop
- An inaudible generated demo beat for trying the visualizer without permissions
- Search across 395 packaged presets, previous/next/random controls, timed changes, and optional beat-synced changes
- HiDPI-aware rendering, fullscreen controls, keyboard shortcuts, and installable web app metadata
- A browser smoke test that renders every packaged preset and reports JavaScript, WebGL, shader compilation, and program-linking failures
- On-device audio analysis; audio is never uploaded

## What Churn is not

Churn is not an official MilkDrop project and is not a port of MilkDrop3. It does not use MilkDrop3's Win32, Direct3D, HLSL, WASAPI, `.milk2`, sprite, FFT-helper, or desktop-editor implementation. MilkDrop3 inspired parts of the original experiment, but it is not a runtime dependency.

## Credits

- [MilkDrop](https://www.geisswerks.com/milkdrop/) was created by Ryan Geiss.
- [Butterchurn](https://github.com/jberg/butterchurn), the renderer used by Churn, was created by Jordan Berg and contributors.
- [Butterchurn Presets](https://github.com/jberg/butterchurn-presets) contains converted classic MilkDrop presets. Individual preset names retain their original artist credits.
- [MilkDrop3](https://github.com/milkdrop2077/MilkDrop3), developed by milkdrop2077 and based on BeatDrop by Maxim Volskiy, inspired the experiment that led to Churn. Its implementation is not included in this app.
- Churn's interface, browser integrations, validation, and deployment were developed by Leyan Lo with OpenAI Codex.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the full Butterchurn and Butterchurn Presets license texts distributed with Churn.

## Development

Requires Node.js 22 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:presets
pnpm build
```

The preset smoke test renders every bundled preset in headless Chromium. Install its browser once with `pnpm exec playwright install chromium`.

## Browser support

Churn requires WebGL 2 and the Web Audio API. Sharing audio depends on browser and operating-system support; Chromium browsers provide the broadest tab-audio support. Microphone and display capture require HTTPS outside local development.

## Deployment

The application is configured as a static Next.js export for Netlify at [churn.leyanlo.com](https://churn.leyanlo.com). Netlify uses `netlify.toml` to run `pnpm build` and publish `out` from the repository root. The former `milkdrop.leyanlo.com` address redirects to the canonical Churn domain.
