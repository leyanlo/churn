"use client";

import type {
  ButterchurnPreset,
  ButterchurnVisualizer,
} from "butterchurn";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AudioFileIcon,
  AutoIcon,
  CloseIcon,
  ExpandIcon,
  HelpIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RandomIcon,
  SearchIcon,
  ShareIcon,
} from "@/components/icons";
import {
  displayPresetName,
  filterPresetNames,
  formatTime,
  getFrequencyBandLevel,
  getRandomIndex,
  getRendererDimensions,
  getRmsLevel,
  isBassTransient,
  wrapIndex,
} from "@/lib/visualizer";

type AudioMode = "none" | "demo" | "microphone" | "display" | "file";
type AutomaticPresetMode = "off" | "timed" | "beat";
type ActiveAutomaticPresetMode = Exclude<AutomaticPresetMode, "off">;

const BLEND_SECONDS = 2.7;
const AUTO_CHANGE_SECONDS = 30;
const BEAT_COOLDOWN_MILLISECONDS = 5_000;
const AUDIO_UI_INTERVAL_MILLISECONDS = 100;
const NO_SIGNAL_GRACE_MILLISECONDS = 3_000;
const NO_SIGNAL_LEVEL = 0.006;
const DEFAULT_PRESET_QUERY = "Hurricane Nightmare";

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "button, input, select, textarea, a, [contenteditable='true']",
      ),
    )
  );
}

export function VisualizerApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visualizerRef = useRef<ButterchurnVisualizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<AudioNode | null>(null);
  const audioNodeRef = useRef<AudioNode | null>(null);
  const inputGainNodeRef = useRef<GainNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const timeDomainDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mediaElementNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const demoSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const presetsRef = useRef<Record<string, ButterchurnPreset>>({});
  const presetNamesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const frameRequestRef = useRef(0);
  const extendedPresetStatusRef = useRef<"idle" | "loading" | "loaded">("idle");
  const inputConnectedAtRef = useRef(0);
  const lastSignalAtRef = useRef(0);
  const bassBaselineRef = useRef<number | null>(null);
  const lastPresetChangeAtRef = useRef(0);
  const automaticPresetModeRef = useRef<AutomaticPresetMode>("timed");
  const lastActiveAutomaticModeRef = useRef<ActiveAutomaticPresetMode>("timed");
  const showPresetsRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioMode, setAudioMode] = useState<AudioMode>("none");
  const [sourceLabel, setSourceLabel] = useState("No audio connected");
  const [currentPreset, setCurrentPreset] = useState("Loading visualizer…");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [automaticPresetMode, setAutomaticPresetMode] =
    useState<AutomaticPresetMode>("timed");
  const [isLoadingExtendedPresets, setIsLoadingExtendedPresets] = useState(false);
  const [hasLoadedExtendedPresets, setHasLoadedExtendedPresets] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackTitle, setTrackTitle] = useState("");
  const [trackTime, setTrackTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [fps, setFps] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [hasNoSignal, setHasNoSignal] = useState(false);
  const [inputSensitivity, setInputSensitivity] = useState(1);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState("");

  const disconnectCurrentAudio = useCallback(() => {
    const visualizer = visualizerRef.current;
    const node = audioNodeRef.current;
    if (visualizer && node) {
      try {
        visualizer.disconnectAudio(node);
      } catch {
        // A browser may already have disconnected a track that ended externally.
      }
    }

    const sourceNode = audioSourceNodeRef.current;
    const inputGainNode = inputGainNodeRef.current;
    if (sourceNode && inputGainNode) {
      try {
        sourceNode.disconnect(inputGainNode);
      } catch {
        // The source may already have ended or been disconnected by the browser.
      }
    }
    inputGainNode?.disconnect();

    audioSourceNodeRef.current = null;
    audioNodeRef.current = null;
    inputGainNodeRef.current = null;
    inputAnalyserRef.current = null;
    timeDomainDataRef.current = null;
    frequencyDataRef.current = null;
    bassBaselineRef.current = null;
    inputConnectedAtRef.current = 0;
    lastSignalAtRef.current = 0;

    if (demoSourceRef.current) {
      try {
        demoSourceRef.current.stop();
      } catch {
        // The demo loop may already have stopped during teardown.
      }
      demoSourceRef.current.disconnect();
      demoSourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const connectAudioNode = useCallback(
    (node: AudioNode) => {
      disconnectCurrentAudio();

      const context = audioContextRef.current;
      const visualizer = visualizerRef.current;
      if (!context || !visualizer) {
        throw new Error("The audio engine is still loading.");
      }

      const inputGainNode = context.createGain();
      inputGainNode.gain.value = inputSensitivity;

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.68;

      node.connect(inputGainNode);
      inputGainNode.connect(analyser);
      visualizer.connectAudio(inputGainNode);

      audioSourceNodeRef.current = node;
      audioNodeRef.current = inputGainNode;
      inputGainNodeRef.current = inputGainNode;
      inputAnalyserRef.current = analyser;
      timeDomainDataRef.current = new Uint8Array(analyser.fftSize);
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      inputConnectedAtRef.current = performance.now();
      lastSignalAtRef.current = inputConnectedAtRef.current;
      bassBaselineRef.current = null;
      setInputLevel(0);
      setHasNoSignal(false);
    },
    [disconnectCurrentAudio, inputSensitivity],
  );

  const resumeAudio = useCallback(async () => {
    const context = audioContextRef.current;
    if (!context) throw new Error("The audio engine is still loading.");
    if (context.state === "suspended") await context.resume();
  }, []);

  const refreshAudioInputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputDevices(devices.filter((device) => device.kind === "audioinput"));
    } catch {
      // The active input remains usable when optional device enumeration fails.
    }
  }, []);

  const startDemo = useCallback(async () => {
    try {
      setError(null);
      await resumeAudio();
      const context = audioContextRef.current;
      if (!context) return;

      const duration = 4;
      const sampleRate = context.sampleRate;
      const buffer = context.createBuffer(2, sampleRate * duration, sampleRate);
      let noiseState = 0x2f6e2b1;

      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let index = 0; index < data.length; index += 1) {
          const time = index / sampleRate;
          const kickPhase = time % 0.5;
          const snarePhase = (time + 0.5) % 1;
          const hatPhase = time % 0.125;
          noiseState = (noiseState * 1664525 + 1013904223) >>> 0;
          const noise = (noiseState / 0xffffffff) * 2 - 1;
          const kick =
            Math.sin(2 * Math.PI * (72 - kickPhase * 42) * kickPhase) *
            Math.exp(-kickPhase * 13);
          const snare = noise * Math.exp(-snarePhase * 25) * 0.28;
          const hat = noise * Math.exp(-hatPhase * 75) * 0.08;
          const bass =
            Math.sin(2 * Math.PI * (channel === 0 ? 55 : 55.5) * time) *
            (0.1 + Math.exp(-kickPhase * 7) * 0.16);
          data[index] = Math.max(-1, Math.min(1, kick * 0.7 + snare + hat + bass));
        }
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = context.createGain();
      gain.gain.value = 0.85;
      source.connect(gain);
      connectAudioNode(gain);
      demoSourceRef.current = source;
      source.start();

      audioElementRef.current?.pause();
      setIsPlaying(false);
      setAudioMode("demo");
      setSourceLabel("Demo beat");
      setShowOnboarding(false);
    } catch {
      setError("Demo mode could not start. Try choosing another audio source.");
    }
  }, [connectAudioNode, resumeAudio]);

  const loadPresetAt = useCallback((index: number, blendTime = BLEND_SECONDS) => {
    const names = presetNamesRef.current;
    const visualizer = visualizerRef.current;
    if (!visualizer || names.length === 0) return;

    const nextIndex = wrapIndex(index, names.length);
    const name = names[nextIndex];
    const preset = presetsRef.current[name];
    if (!preset) return;

    visualizer.loadPreset(preset, blendTime);
    currentIndexRef.current = nextIndex;
    lastPresetChangeAtRef.current = performance.now();
    setCurrentIndex(nextIndex);
    setCurrentPreset(displayPresetName(name));
  }, []);

  const nextPreset = useCallback(() => {
    loadPresetAt(currentIndexRef.current + 1);
  }, [loadPresetAt]);

  const previousPreset = useCallback(() => {
    loadPresetAt(currentIndexRef.current - 1);
  }, [loadPresetAt]);

  const randomPreset = useCallback(() => {
    loadPresetAt(
      getRandomIndex(presetNamesRef.current.length, currentIndexRef.current),
    );
  }, [loadPresetAt]);

  const loadExtendedPresets = useCallback(async () => {
    if (extendedPresetStatusRef.current !== "idle") return;

    extendedPresetStatusRef.current = "loading";
    setIsLoadingExtendedPresets(true);

    try {
      const [extraImport, extra2Import, milkdrop1Import] = await Promise.all([
        import("butterchurn-presets/lib/butterchurnPresetsExtra.min"),
        import("butterchurn-presets/lib/butterchurnPresetsExtra2.min"),
        import("butterchurn-presets/lib/butterchurnPresetsMD1.min"),
      ]);

      const currentName = presetNamesRef.current[currentIndexRef.current];
      const presets = {
        ...extraImport.default.getPresets(),
        ...extra2Import.default.getPresets(),
        ...milkdrop1Import.default.getPresets(),
        ...presetsRef.current,
      };
      const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
      const nextCurrentIndex = Math.max(0, names.indexOf(currentName));

      presetsRef.current = presets;
      presetNamesRef.current = names;
      currentIndexRef.current = nextCurrentIndex;
      setPresetNames(names);
      setCurrentIndex(nextCurrentIndex);
      setHasLoadedExtendedPresets(true);
      extendedPresetStatusRef.current = "loaded";
    } catch {
      extendedPresetStatusRef.current = "idle";
      setError("The extended preset library could not be loaded.");
    } finally {
      setIsLoadingExtendedPresets(false);
    }
  }, []);

  const openPresetBrowser = useCallback(() => {
    if (!isReady) return;
    setShowPresets(true);
    void loadExtendedPresets();
  }, [isReady, loadExtendedPresets]);

  const toggleAutomaticPresetChanges = useCallback(() => {
    setAutomaticPresetMode((mode) => {
      if (mode === "off") return lastActiveAutomaticModeRef.current;
      lastActiveAutomaticModeRef.current = mode;
      return "off";
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        if (!document.createElement("canvas").getContext("webgl2")) {
          throw new Error(
            "Churn needs WebGL 2. Try the latest Chrome, Safari, Firefox, or Edge.",
          );
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const [butterchurnImport, presetsImport] = await Promise.all([
          import("butterchurn"),
          import("butterchurn-presets"),
        ]);
        if (cancelled) return;

        const AudioContextConstructor =
          window.AudioContext ??
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextConstructor) {
          throw new Error("This browser does not support the Web Audio API.");
        }

        const audioContext = new AudioContextConstructor();
        audioContextRef.current = audioContext;

        const bounds = canvas.getBoundingClientRect();
        const { width, height, pixelRatio } = getRendererDimensions(
          bounds.width,
          bounds.height,
          window.devicePixelRatio || 1,
        );
        canvas.width = width;
        canvas.height = height;
        const visualizer = butterchurnImport.default.createVisualizer(
          audioContext,
          canvas,
          {
            width,
            height,
            pixelRatio: 1,
          },
        );
        visualizerRef.current = visualizer;
        let rendererPixelRatio = pixelRatio;

        const presets = presetsImport.default.getPresets();
        const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
        presetsRef.current = presets;
        presetNamesRef.current = names;
        setPresetNames(names);

        const defaultIndex = Math.max(
          0,
          names.findIndex((name) => name.includes(DEFAULT_PRESET_QUERY)),
        );
        loadPresetAt(defaultIndex, 0);

        const resize = () => {
          const nextBounds = canvas.getBoundingClientRect();
          const {
            width: nextWidth,
            height: nextHeight,
            pixelRatio: nextRatio,
          } = getRendererDimensions(
            nextBounds.width,
            nextBounds.height,
            window.devicePixelRatio || 1,
          );
          if (
            canvas.width === nextWidth &&
            canvas.height === nextHeight &&
            rendererPixelRatio === nextRatio
          ) {
            return;
          }
          canvas.width = nextWidth;
          canvas.height = nextHeight;
          visualizer.setRendererSize(
            nextWidth,
            nextHeight,
            { pixelRatio: 1 },
          );
          rendererPixelRatio = nextRatio;
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        window.addEventListener("resize", resize);

        let frameCount = 0;
        let sampleStartedAt = performance.now();
        let lastAudioUiUpdateAt = 0;
        const render = (now: number) => {
          visualizer.render();

          const analyser = inputAnalyserRef.current;
          const timeDomainData = timeDomainDataRef.current;
          const frequencyData = frequencyDataRef.current;
          let rmsLevel = 0;

          if (analyser && timeDomainData && frequencyData) {
            analyser.getByteTimeDomainData(timeDomainData);
            rmsLevel = getRmsLevel(timeDomainData);
            if (rmsLevel >= NO_SIGNAL_LEVEL) lastSignalAtRef.current = now;

            analyser.getByteFrequencyData(frequencyData);
            const bassLevel = getFrequencyBandLevel(
              frequencyData,
              audioContext.sampleRate,
              analyser.fftSize,
              35,
              180,
            );
            const bassBaseline = bassBaselineRef.current;
            if (bassBaseline === null) {
              bassBaselineRef.current = bassLevel;
            } else {
              if (
                automaticPresetModeRef.current === "beat" &&
                !showPresetsRef.current &&
                now - lastPresetChangeAtRef.current >= BEAT_COOLDOWN_MILLISECONDS &&
                isBassTransient(bassLevel, bassBaseline)
              ) {
                loadPresetAt(currentIndexRef.current + 1);
              }
              bassBaselineRef.current = bassBaseline * 0.97 + bassLevel * 0.03;
            }
          }

          if (
            automaticPresetModeRef.current === "beat" &&
            !showPresetsRef.current &&
            now - lastPresetChangeAtRef.current >= AUTO_CHANGE_SECONDS * 1000
          ) {
            loadPresetAt(currentIndexRef.current + 1);
          }

          if (now - lastAudioUiUpdateAt >= AUDIO_UI_INTERVAL_MILLISECONDS) {
            setInputLevel(Math.min(1, rmsLevel * 3.5));
            setHasNoSignal(
              inputConnectedAtRef.current > 0 &&
                now - inputConnectedAtRef.current >= NO_SIGNAL_GRACE_MILLISECONDS &&
                now - lastSignalAtRef.current >= NO_SIGNAL_GRACE_MILLISECONDS,
            );
            lastAudioUiUpdateAt = now;
          }

          frameCount += 1;
          if (now - sampleStartedAt >= 1000) {
            setFps(Math.round((frameCount * 1000) / (now - sampleStartedAt)));
            frameCount = 0;
            sampleStartedAt = now;
          }
          frameRequestRef.current = requestAnimationFrame(render);
        };
        frameRequestRef.current = requestAnimationFrame(render);
        setIsReady(true);

        return () => {
          resizeObserver.disconnect();
          window.removeEventListener("resize", resize);
        };
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "The visualizer could not start.",
        );
      }
    }

    let cleanupResize: (() => void) | undefined;
    void initialize().then((cleanup) => {
      cleanupResize = cleanup;
    });

    return () => {
      cancelled = true;
      cleanupResize?.();
      cancelAnimationFrame(frameRequestRef.current);
      disconnectCurrentAudio();
      const context = audioContextRef.current;
      audioContextRef.current = null;
      visualizerRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, [disconnectCurrentAudio, loadPresetAt]);

  useEffect(() => {
    automaticPresetModeRef.current = automaticPresetMode;
    if (automaticPresetMode !== "off") {
      lastActiveAutomaticModeRef.current = automaticPresetMode;
    }
  }, [automaticPresetMode]);

  useEffect(() => {
    showPresetsRef.current = showPresets;
  }, [showPresets]);

  useEffect(() => {
    const context = audioContextRef.current;
    const gainNode = inputGainNodeRef.current;
    if (!context || !gainNode) return;
    gainNode.gain.setTargetAtTime(inputSensitivity, context.currentTime, 0.03);
  }, [inputSensitivity]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;

    mediaDevices.addEventListener("devicechange", refreshAudioInputDevices);
    return () => {
      mediaDevices.removeEventListener("devicechange", refreshAudioInputDevices);
    };
  }, [refreshAudioInputDevices]);

  useEffect(() => {
    if (automaticPresetMode !== "timed" || !isReady || showPresets) return;
    const timer = window.setInterval(nextPreset, AUTO_CHANGE_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [automaticPresetMode, isReady, nextPreset, showPresets]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const connectMicrophone = useCallback(
    async (deviceId?: string) => {
      try {
        setError(null);
        await resumeAudio();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: false,
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
          },
        });
        const context = audioContextRef.current;
        if (!context) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const node = context.createMediaStreamSource(stream);
        connectAudioNode(node);
        streamRef.current = stream;
        audioElementRef.current?.pause();
        setIsPlaying(false);
        setAudioMode("microphone");

        const track = stream.getAudioTracks()[0];
        setSelectedAudioInputId(track?.getSettings().deviceId ?? deviceId ?? "");
        setSourceLabel(track?.label || "Microphone");
        setShowOnboarding(false);
        void refreshAudioInputDevices();
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "NotAllowedError") {
          setError("Microphone access was not allowed.");
        } else {
          setError("The microphone could not be connected.");
        }
      }
    },
    [connectAudioNode, refreshAudioInputDevices, resumeAudio],
  );

  const shareAudio = useCallback(async () => {
    try {
      setError(null);
      await resumeAudio();
      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Display capture is unavailable.");
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No audio was shared.");
      }

      const context = audioContextRef.current;
      if (!context) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const node = context.createMediaStreamSource(stream);
      connectAudioNode(node);
      streamRef.current = stream;
      audioElementRef.current?.pause();
      setIsPlaying(false);
      setAudioMode("display");
      setSourceLabel("Shared audio");
      setShowOnboarding(false);

      const endTrack = stream.getVideoTracks()[0] ?? stream.getAudioTracks()[0];
      endTrack.addEventListener(
        "ended",
        () => {
          if (streamRef.current !== stream) return;
          disconnectCurrentAudio();
          setAudioMode("none");
          setSourceLabel("No audio connected");
        },
        { once: true },
      );
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "NotAllowedError") {
        setError("Audio sharing was canceled.");
      } else {
        setError(
          "No audio was shared. In the browser picker, choose a tab or screen and enable audio sharing.",
        );
      }
    }
  }, [connectAudioNode, disconnectCurrentAudio, resumeAudio]);

  const openAudioFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio/")) {
        setError("Drop an audio file such as MP3, WAV, M4A, or OGG.");
        return;
      }

      let candidateObjectUrl: string | null = null;
      let mediaNode: MediaElementAudioSourceNode | null = null;
      let wasFileSource = false;

      try {
        setError(null);
        await resumeAudio();
        const context = audioContextRef.current;
        const audio = audioElementRef.current;
        if (!context || !audio) return;

        if (!mediaElementNodeRef.current) {
          mediaElementNodeRef.current = context.createMediaElementSource(audio);
          mediaElementNodeRef.current.connect(context.destination);
        }

        mediaNode = mediaElementNodeRef.current;
        wasFileSource = audioSourceNodeRef.current === mediaNode;
        const previousObjectUrl = objectUrlRef.current;
        candidateObjectUrl = URL.createObjectURL(file);
        audio.src = candidateObjectUrl;
        audio.load();
        await audio.play();
        connectAudioNode(mediaNode);

        objectUrlRef.current = candidateObjectUrl;
        candidateObjectUrl = null;
        if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);

        setTrackTitle(file.name.replace(/\.[^.]+$/, ""));
        setTrackTime(0);
        setIsPlaying(true);
        setAudioMode("file");
        setSourceLabel("Local file");
        setShowOnboarding(false);
      } catch {
        const audio = audioElementRef.current;
        if (audio && candidateObjectUrl && audio.src === candidateObjectUrl) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        if (candidateObjectUrl) URL.revokeObjectURL(candidateObjectUrl);

        if (
          wasFileSource &&
          mediaNode &&
          audioSourceNodeRef.current === mediaNode
        ) {
          disconnectCurrentAudio();
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
          setAudioMode("none");
          setSourceLabel("No audio connected");
          setIsPlaying(false);
          setTrackTitle("");
          setTrackTime(0);
          setTrackDuration(0);
        }
        setError("That audio file could not be played.");
      }
    },
    [connectAudioNode, disconnectCurrentAudio, resumeAudio],
  );

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void openAudioFile(file);
      event.target.value = "";
    },
    [openAudioFile],
  );

  const togglePlayback = useCallback(async () => {
    const audio = audioElementRef.current;
    if (!audio || audioMode !== "file") return;
    if (audio.paused) {
      await resumeAudio();
      await audio.play();
    } else {
      audio.pause();
    }
  }, [audioMode, resumeAudio]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setError("Fullscreen mode is unavailable in this browser.");
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowHelp(false);
        setShowPresets(false);
        return;
      }
      if (isInteractiveTarget(event.target)) return;
      if (event.key === "ArrowLeft") previousPreset();
      if (event.key === "ArrowRight" || event.code === "Space") {
        event.preventDefault();
        nextPreset();
      }
      if (event.key.toLowerCase() === "r") randomPreset();
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
      if (event.key.toLowerCase() === "m") void connectMicrophone();
      if (event.key === "?") setShowHelp(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connectMicrophone, nextPreset, previousPreset, randomPreset, toggleFullscreen]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const filteredPresets = useMemo(() => {
    return filterPresetNames(presetNames, searchQuery);
  }, [presetNames, searchQuery]);

  const sourceStatusClass =
    audioMode === "none" ? "" : hasNoSignal ? "is-warning" : "is-live";
  const inputStatusText =
    audioMode === "none"
      ? "Waiting for a source"
      : hasNoSignal
        ? "No signal detected"
        : "Signal detected";
  const automaticPresetModeLabel =
    automaticPresetMode === "beat" ? "BEAT" : "AUTO";

  const selectPreset = useCallback(
    (name: string) => {
      const index = presetNamesRef.current.indexOf(name);
      if (index >= 0) loadPresetAt(index);
      setShowPresets(false);
      setSearchQuery("");
    },
    [loadPresetAt],
  );

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void openAudioFile(file);
  };

  return (
    <main
      className="visualizer-shell"
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} className="visualizer-canvas" aria-hidden="true" />
      <div className="visualizer-vignette" aria-hidden="true" />
      <div className="visualizer-grain" aria-hidden="true" />

      <audio
        ref={audioElementRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setTrackTime(event.currentTarget.currentTime)}
        onDurationChange={(event) =>
          setTrackDuration(event.currentTarget.duration || 0)
        }
      />
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        aria-label="Choose a local audio file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
        onChange={onFileChange}
      />

      <header className="topbar">
        <button
          className="wordmark"
          type="button"
          onClick={() => setShowOnboarding(true)}
          aria-label="Choose an audio source"
        >
          <span className="wordmark-drop" aria-hidden="true" />
          <span>CHURN</span>
          <span className="wordmark-edition">PLAYER</span>
        </button>

        <div className="topbar-actions">
          <span className="render-status" title="Rendering performance">
            {isReady ? `${fps || "–"} FPS` : "STARTING"}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="Show keyboard shortcuts and help"
          >
            <HelpIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <ExpandIcon />
          </button>
        </div>
      </header>

      <section className="preset-readout" aria-live="polite">
        <span className="eyebrow">NOW RENDERING</span>
        <h1>{currentPreset}</h1>
        <div className="source-readout">
          <span className={`source-dot ${sourceStatusClass}`} />
          {sourceLabel}
          {audioMode !== "none" && (
            <span className="source-level" aria-hidden="true">
              <span style={{ transform: `scaleX(${inputLevel})` }} />
            </span>
          )}
          {hasNoSignal && <span className="signal-warning">NO SIGNAL</span>}
        </div>
      </section>

      {showOnboarding && (
        <section className="onboarding" aria-labelledby="onboarding-title">
          <button
            className="onboarding-close"
            type="button"
            onClick={() => void startDemo()}
            aria-label="Close audio source chooser and start demo mode"
          >
            <CloseIcon />
          </button>
          <p className="eyebrow">BUTTERCHURN-POWERED VISUALS</p>
          <h2 id="onboarding-title">Music, visualized.</h2>
          <p className="onboarding-copy">
            Choose a source. Your audio stays in this browser and is never uploaded.
          </p>
          <div className="source-grid">
            <button
              type="button"
              className="source-card source-card-featured"
              disabled={!isReady}
              onClick={() => void startDemo()}
            >
              <PlayIcon />
              <span>
                <strong>Start the demo</strong>
                <small>Preview with an inaudible generated beat</small>
              </span>
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              className="source-card"
              disabled={!isReady}
              onClick={() => void shareAudio()}
            >
              <ShareIcon />
              <span>
                <strong>Share audio</strong>
                <small>Spotify, YouTube, or another tab</small>
              </span>
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              className="source-card"
              disabled={!isReady}
              onClick={() => void connectMicrophone()}
            >
              <MicIcon />
              <span>
                <strong>Microphone</strong>
                <small>Listen through your device</small>
              </span>
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              className="source-card"
              disabled={!isReady}
              onClick={() => fileInputRef.current?.click()}
            >
              <AudioFileIcon />
              <span>
                <strong>Open a file</strong>
                <small>MP3, WAV, M4A, OGG, and more</small>
              </span>
              <ArrowRightIcon />
            </button>
          </div>
          <div className="source-settings" aria-label="Audio and preset settings">
            {audioMode === "microphone" && audioInputDevices.length > 0 && (
              <label className="setting-control setting-control-wide">
                <span className="setting-label">Microphone</span>
                <select
                  value={selectedAudioInputId}
                  onChange={(event) =>
                    void connectMicrophone(event.target.value || undefined)
                  }
                >
                  <option value="">System default</option>
                  {audioInputDevices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="setting-control" htmlFor="input-sensitivity">
              <span className="setting-label">
                Sensitivity <output>{inputSensitivity.toFixed(1)}×</output>
              </span>
              <input
                id="input-sensitivity"
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={inputSensitivity}
                onChange={(event) => setInputSensitivity(Number(event.target.value))}
              />
            </label>
            <label className="setting-control">
              <span className="setting-label">Preset changes</span>
              <select
                value={automaticPresetMode}
                onChange={(event) =>
                  setAutomaticPresetMode(event.target.value as AutomaticPresetMode)
                }
              >
                <option value="off">Off</option>
                <option value="timed">Every 30 seconds</option>
                <option value="beat">Beat sync</option>
              </select>
            </label>
            <div className="input-level-control setting-control-wide">
              <span className="setting-label">
                Input level <small className={hasNoSignal ? "is-warning" : ""}>{inputStatusText}</small>
              </span>
              <div
                className="input-level-meter"
                role="meter"
                aria-label="Input level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(inputLevel * 100)}
              >
                <span style={{ transform: `scaleX(${inputLevel})` }} />
              </div>
            </div>
          </div>
          <p className="onboarding-hint">No account. No upload. No tracking.</p>
        </section>
      )}

      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            <CloseIcon />
          </button>
        </div>
      )}

      <div className="control-dock">
        {audioMode === "file" ? (
          <div className="track-control">
            <button
              className="play-button"
              type="button"
              onClick={() => void togglePlayback()}
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <div className="track-details">
              <strong>{trackTitle}</strong>
              <div className="timeline-row">
                <span>{formatTime(trackTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={trackDuration || 0}
                  step="0.1"
                  value={Math.min(trackTime, trackDuration || 0)}
                  onChange={(event) => {
                    const audio = audioElementRef.current;
                    if (audio) audio.currentTime = Number(event.target.value);
                  }}
                  aria-label="Track position"
                />
                <span>{formatTime(trackDuration)}</span>
              </div>
            </div>
          </div>
        ) : (
          <button
            className="source-pill"
            type="button"
            onClick={() => setShowOnboarding(true)}
            aria-label={`Change audio source. Current source: ${sourceLabel}`}
          >
            <span className={`source-dot ${sourceStatusClass}`} />
            <span>{sourceLabel}</span>
            <span className="source-pill-action">CHANGE</span>
          </button>
        )}

        <div className="preset-controls" role="group" aria-label="Preset controls">
          <button
            className="dock-icon-button"
            type="button"
            onClick={previousPreset}
            aria-label="Previous preset"
          >
            <ArrowLeftIcon />
          </button>
          <button
            className="random-button"
            type="button"
            onClick={randomPreset}
            aria-label="Random preset"
          >
            <RandomIcon />
          </button>
          <button
            className="dock-icon-button"
            type="button"
            onClick={nextPreset}
            aria-label="Next preset"
          >
            <ArrowRightIcon />
          </button>
        </div>

        <div className="dock-actions">
          <button
            className={`text-button ${automaticPresetMode !== "off" ? "is-active" : ""}`}
            type="button"
            onClick={toggleAutomaticPresetChanges}
            aria-pressed={automaticPresetMode !== "off"}
            aria-label={
              automaticPresetMode === "off"
                ? "Turn automatic preset changes on"
                : `Turn ${automaticPresetMode === "beat" ? "beat-synced" : "timed"} preset changes off`
            }
          >
            <AutoIcon />
            <span>{automaticPresetModeLabel}</span>
          </button>
          <button
            className="text-button"
            type="button"
            onClick={openPresetBrowser}
            disabled={!isReady}
            aria-label="Browse presets"
          >
            <SearchIcon />
            <span>PRESETS</span>
          </button>
        </div>
      </div>

      {showPresets && (
        <div className="modal-layer" role="presentation">
          <section
            className="preset-browser"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preset-browser-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">
                  {presetNames.length} VISUALS
                  {isLoadingExtendedPresets ? " · LOADING MORE" : ""}
                </p>
                <h2 id="preset-browser-title">Choose a preset</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowPresets(false)}
                aria-label="Close preset browser"
              >
                <CloseIcon />
              </button>
            </div>
            <label className="search-field">
              <SearchIcon />
              <span className="visually-hidden">Search presets</span>
              <input
                autoFocus
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search artists and preset names"
              />
              <kbd>/</kbd>
            </label>
            <div className="preset-list">
              {filteredPresets.map((name) => {
                const index = presetNames.indexOf(name);
                const isCurrent = index === currentIndex;
                return (
                  <button
                    key={name}
                    className={isCurrent ? "is-current" : ""}
                    type="button"
                    onClick={() => selectPreset(name)}
                  >
                    <span className="preset-number">
                      {String(index + 1).padStart(3, "0")}
                    </span>
                    <span>{displayPresetName(name)}</span>
                    {isCurrent && <small>PLAYING</small>}
                  </button>
                );
              })}
              {filteredPresets.length === 0 && (
                <p className="empty-state">No presets match “{searchQuery}”.</p>
              )}
              {!isLoadingExtendedPresets && !hasLoadedExtendedPresets && (
                <p className="empty-state">Open the preset browser again to retry loading the extended library.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {showHelp && (
        <div className="modal-layer" role="presentation">
          <section
            className="help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">CHURN</p>
                <h2 id="help-title">Lose track of time.</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowHelp(false)}
                aria-label="Close help"
              >
                <CloseIcon />
              </button>
            </div>
            <p className="help-copy">
              Churn is an unofficial browser interface powered by Butterchurn, Web
              Audio, and WebGL 2. Audio is analyzed on your device; it is never
              recorded or uploaded. Open the source chooser to adjust sensitivity,
              microphone input, and timed or beat-synced preset changes.
            </p>
            <dl className="shortcut-list">
              <div><dt><kbd>Space</kbd> / <kbd>→</kbd></dt><dd>Next preset</dd></div>
              <div><dt><kbd>←</kbd></dt><dd>Previous preset</dd></div>
              <div><dt><kbd>R</kbd></dt><dd>Random preset</dd></div>
              <div><dt><kbd>M</kbd></dt><dd>Use microphone</dd></div>
              <div><dt><kbd>F</kbd></dt><dd>Toggle fullscreen</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>Open this guide</dd></div>
            </dl>
            <div className="compatibility-note">
              <strong>What Churn is—and is not</strong>
              <p>
                Butterchurn provides the renderer, and the preset artists created the
                bundled visuals. Churn adds the interface, browser integrations, and
                validation. It is not an official MilkDrop project or a port of
                MilkDrop3.
              </p>
            </div>
            <div className="about-links">
              <a className="about-link" href="/credits">
                Credits and licenses <ArrowRightIcon />
              </a>
              <a
                className="about-link"
                href="https://github.com/leyanlo/churn"
                target="_blank"
                rel="noreferrer"
              >
                View source on GitHub <ArrowRightIcon />
              </a>
            </div>
          </section>
        </div>
      )}

      {isDragging && (
        <div className="drop-overlay">
          <AudioFileIcon />
          <strong>Drop to visualize</strong>
          <span>Your audio stays on this device.</span>
        </div>
      )}
    </main>
  );
}
