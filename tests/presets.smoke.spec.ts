import path from "node:path";
import { expect, test } from "@playwright/test";

const presetScripts = [
  "node_modules/butterchurn/lib/butterchurn.min.js",
  "node_modules/butterchurn-presets/lib/butterchurnPresets.min.js",
  "node_modules/butterchurn-presets/lib/butterchurnPresetsExtra.min.js",
  "node_modules/butterchurn-presets/lib/butterchurnPresetsExtra2.min.js",
  "node_modules/butterchurn-presets/lib/butterchurnPresetsMD1.min.js",
].map((modulePath) => path.join(process.cwd(), modulePath));

test("every bundled preset loads and renders in Chromium", async ({ page }) => {
  test.setTimeout(180_000);

  await page.setContent('<canvas id="visualizer" width="320" height="180"></canvas>');
  for (const path of presetScripts) await page.addScriptTag({ path });

  const result = await page.evaluate(async () => {
    type PresetPack = { getPresets(): Record<string, Record<string, unknown>> };
    type Renderer = {
      loadPreset(preset: Record<string, unknown>, blendTime: number): void;
      render(): void;
    };
    type ButterchurnGlobal = {
      createVisualizer(
        context: AudioContext,
        canvas: HTMLCanvasElement,
        options: { width: number; height: number; pixelRatio: number },
      ): Renderer;
    };
    type MilkDropWindow = typeof window & {
      butterchurn: { default: ButterchurnGlobal };
      butterchurnPresets: PresetPack;
      butterchurnPresetsExtra: PresetPack;
      butterchurnPresetsExtra2: PresetPack;
      butterchurnPresetsMD1: PresetPack;
    };

    const milkdropWindow = window as MilkDropWindow;
    const presets = {
      ...milkdropWindow.butterchurnPresetsExtra.getPresets(),
      ...milkdropWindow.butterchurnPresetsExtra2.getPresets(),
      ...milkdropWindow.butterchurnPresetsMD1.getPresets(),
      ...milkdropWindow.butterchurnPresets.getPresets(),
    };
    const canvas = document.querySelector<HTMLCanvasElement>("#visualizer");
    if (!canvas) throw new Error("The smoke-test canvas was not created.");

    const failures: string[] = [];
    let activePresetName = "Visualizer startup";
    const webglPrototype = WebGL2RenderingContext.prototype;
    const originalCompileShader = webglPrototype.compileShader;
    const originalLinkProgram = webglPrototype.linkProgram;

    webglPrototype.compileShader = function (shader) {
      originalCompileShader.call(this, shader);
      if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
        failures.push(
          `${activePresetName}: shader compilation failed: ${this.getShaderInfoLog(shader) ?? "Unknown error"}`,
        );
      }
    };
    webglPrototype.linkProgram = function (program) {
      originalLinkProgram.call(this, program);
      if (!this.getProgramParameter(program, this.LINK_STATUS)) {
        failures.push(
          `${activePresetName}: shader program linking failed: ${this.getProgramInfoLog(program) ?? "Unknown error"}`,
        );
      }
    };

    const context = new AudioContext();

    try {
      const visualizer = milkdropWindow.butterchurn.default.createVisualizer(
        context,
        canvas,
        {
          width: canvas.width,
          height: canvas.height,
          pixelRatio: 1,
        },
      );
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("The smoke-test WebGL 2 context was not created.");

      const collectWebglErrors = (name: string) => {
        for (let index = 0; index < 16; index += 1) {
          const error = gl.getError();
          if (error === gl.NO_ERROR) return;
          failures.push(`${name}: WebGL error 0x${error.toString(16)}`);
        }
        failures.push(`${name}: WebGL error queue did not drain`);
      };

      collectWebglErrors(activePresetName);

      for (const [name, preset] of Object.entries(presets)) {
        activePresetName = name;
        try {
          visualizer.loadPreset(preset, 0);
          visualizer.render();
          visualizer.render();
        } catch (error) {
          failures.push(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          collectWebglErrors(name);
        }
      }
    } finally {
      webglPrototype.compileShader = originalCompileShader;
      webglPrototype.linkProgram = originalLinkProgram;
      await context.close();
    }

    return { count: Object.keys(presets).length, failures };
  });

  expect(result.count).toBe(395);
  expect(result.failures).toEqual([]);
});
