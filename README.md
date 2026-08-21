# MilkDrop Web

A browser-native MilkDrop visualizer built with Next.js, Butterchurn, the Web Audio API, and WebGL 2.

## Features

- 100 classic MilkDrop presets at startup, expanding to 395 when the preset browser opens
- Microphone input with device selection, sensitivity, a live level meter, and a no-signal warning
- Shared tab or screen audio when supported by the browser
- Local audio file playback and drag-and-drop
- An inaudible generated demo beat for trying the visualizer without permissions
- Preset search, previous/next/random controls, timed changes, and optional beat-synced changes
- Fullscreen, responsive controls, keyboard shortcuts, and installable web app metadata
- All audio analysis stays on the device

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

MilkDrop Web requires WebGL 2 and the Web Audio API. Sharing audio depends on browser and operating-system support; Chromium browsers provide the broadest tab-audio support. Microphone and display capture require HTTPS outside local development.

The current renderer supports classic MilkDrop presets. MilkDrop3-only `.milk2` double presets, FFT shader helpers, sprites, and desktop editing tools will require a dedicated compatibility layer in a future release.

## Deployment

The application is configured as a static Next.js export for Netlify. Set `web` as the project root when connecting the repository; Netlify uses `netlify.toml` to run `pnpm build` and publish `out`.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for renderer and preset-pack attribution.
