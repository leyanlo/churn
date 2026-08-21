declare module "butterchurn" {
  export type ButterchurnPreset = Record<string, unknown>;

  export interface ButterchurnVisualizer {
    connectAudio(node: AudioNode): void;
    disconnectAudio(node: AudioNode): void;
    loadPreset(preset: ButterchurnPreset, blendTime?: number): void;
    render(): void;
    setRendererSize(
      width: number,
      height: number,
      options?: { pixelRatio?: number; textureRatio?: number },
    ): void;
  }

  export interface ButterchurnModule {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      options: { width: number; height: number; pixelRatio?: number },
    ): ButterchurnVisualizer;
  }

  const butterchurn: ButterchurnModule;
  export default butterchurn;
}

declare module "butterchurn-presets" {
  import type { ButterchurnPreset } from "butterchurn";

  export interface ButterchurnPresetsModule {
    getPresets(): Record<string, ButterchurnPreset>;
  }

  const presets: ButterchurnPresetsModule;
  export default presets;
}

declare module "butterchurn-presets/lib/butterchurnPresetsExtra.min" {
  import type { ButterchurnPresetsModule } from "butterchurn-presets";

  const presets: ButterchurnPresetsModule;
  export default presets;
}

declare module "butterchurn-presets/lib/butterchurnPresetsExtra2.min" {
  import type { ButterchurnPresetsModule } from "butterchurn-presets";

  const presets: ButterchurnPresetsModule;
  export default presets;
}

declare module "butterchurn-presets/lib/butterchurnPresetsMD1.min" {
  import type { ButterchurnPresetsModule } from "butterchurn-presets";

  const presets: ButterchurnPresetsModule;
  export default presets;
}
