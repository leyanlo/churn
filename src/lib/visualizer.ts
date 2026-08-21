export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function displayPresetName(name: string): string {
  return name.replace(/^[_$\s]+/, "").replace(/\s+/g, " ").trim();
}

export function filterPresetNames(names: string[], query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return names;
  return names.filter((name) =>
    name.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function getRendererDimensions(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
) {
  const logicalWidth = Math.max(1, Math.round(cssWidth));
  const logicalHeight = Math.max(1, Math.round(cssHeight));
  const finitePixelRatio = Number.isFinite(devicePixelRatio)
    ? devicePixelRatio
    : 1;
  const pixelRatio = Math.min(2, Math.max(1, finitePixelRatio));

  return {
    width: Math.max(1, Math.round(logicalWidth * pixelRatio)),
    height: Math.max(1, Math.round(logicalHeight * pixelRatio)),
    pixelRatio,
  };
}

export function getRandomIndex(
  length: number,
  currentIndex: number,
  randomValue = Math.random(),
): number {
  if (length <= 1) return 0;
  const normalized = Math.min(Math.max(randomValue, 0), 0.999999999);
  const candidate = Math.floor(normalized * (length - 1));
  return candidate >= currentIndex ? candidate + 1 : candidate;
}

export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function getRmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;

  let sumOfSquares = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sumOfSquares += normalized * normalized;
  }

  return Math.sqrt(sumOfSquares / samples.length);
}

export function getFrequencyBandLevel(
  samples: Uint8Array,
  sampleRate: number,
  fftSize: number,
  lowFrequency: number,
  highFrequency: number,
): number {
  if (
    samples.length === 0 ||
    !Number.isFinite(sampleRate) ||
    !Number.isFinite(fftSize) ||
    sampleRate <= 0 ||
    fftSize <= 0
  ) {
    return 0;
  }

  const binWidth = sampleRate / fftSize;
  const firstBin = Math.max(0, Math.floor(lowFrequency / binWidth));
  const lastBin = Math.min(
    samples.length - 1,
    Math.ceil(highFrequency / binWidth),
  );
  if (lastBin < firstBin) return 0;

  let total = 0;
  for (let index = firstBin; index <= lastBin; index += 1) {
    total += samples[index];
  }

  return total / (lastBin - firstBin + 1) / 255;
}

export function isBassTransient(level: number, baseline: number): boolean {
  return level >= 0.12 && level >= baseline * 1.45 && level - baseline >= 0.05;
}
