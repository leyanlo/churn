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
  getRandomIndex,
  getRendererDimensions,
  wrapIndex,
} from "@/lib/visualizer";

type AudioMode = "none" | "demo" | "microphone" | "display" | "file";

const BLEND_SECONDS = 2.7;
const AUTO_CHANGE_SECONDS = 30;
const DEFAULT_PRESET_QUERY = "Hurricane Nightmare";

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, input, a, [contenteditable='true']"))
  );
}

export function VisualizerApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visualizerRef = useRef<ButterchurnVisualizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<AudioNode | null>(null);
  const mediaElementNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const demoSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const presetsRef = useRef<Record<string, ButterchurnPreset>>({});
  const presetNamesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const frameRequestRef = useRef(0);

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
  const [isAutoChanging, setIsAutoChanging] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackTitle, setTrackTitle] = useState("");
  const [trackTime, setTrackTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [fps, setFps] = useState(0);

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
    audioNodeRef.current = null;

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
      visualizerRef.current?.connectAudio(node);
      audioNodeRef.current = node;
    },
    [disconnectCurrentAudio],
  );

  const resumeAudio = useCallback(async () => {
    const context = audioContextRef.current;
    if (!context) throw new Error("The audio engine is still loading.");
    if (context.state === "suspended") await context.resume();
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

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        if (!document.createElement("canvas").getContext("webgl2")) {
          throw new Error(
            "MilkDrop Web needs WebGL 2. Try the latest Chrome, Safari, Firefox, or Edge.",
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
        const render = (now: number) => {
          visualizer.render();
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
    if (!isAutoChanging || !isReady || showPresets) return;
    const timer = window.setInterval(nextPreset, AUTO_CHANGE_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [isAutoChanging, isReady, nextPreset, showPresets]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const connectMicrophone = useCallback(async () => {
    try {
      setError(null);
      await resumeAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      const context = audioContextRef.current;
      if (!context) return;
      const node = context.createMediaStreamSource(stream);
      connectAudioNode(node);
      streamRef.current = stream;
      audioElementRef.current?.pause();
      setIsPlaying(false);
      setAudioMode("microphone");
      setSourceLabel("Microphone");
      setShowOnboarding(false);
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "NotAllowedError") {
        setError("Microphone access was not allowed.");
      } else {
        setError("The microphone could not be connected.");
      }
    }
  }, [connectAudioNode, resumeAudio]);

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
      if (!context) return;
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
        wasFileSource = audioNodeRef.current === mediaNode;
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
          audioNodeRef.current === mediaNode
        ) {
          try {
            visualizerRef.current?.disconnectAudio(mediaNode);
          } catch {
            // The failed media element may already be disconnected.
          }
          audioNodeRef.current = null;
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
    [connectAudioNode, resumeAudio],
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
          <span>MILKDROP</span>
          <span className="wordmark-edition">WEB</span>
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
          <span className={`source-dot ${audioMode !== "none" ? "is-live" : ""}`} />
          {sourceLabel}
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
          <p className="eyebrow">BROWSER-NATIVE VISUALS</p>
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
            <span className={`source-dot ${audioMode !== "none" ? "is-live" : ""}`} />
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
            className={`text-button ${isAutoChanging ? "is-active" : ""}`}
            type="button"
            onClick={() => setIsAutoChanging((value) => !value)}
            aria-pressed={isAutoChanging}
            aria-label={`Automatic preset changes ${isAutoChanging ? "on" : "off"}`}
          >
            <AutoIcon />
            <span>AUTO</span>
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setShowPresets(true)}
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
                <p className="eyebrow">{presetNames.length} VISUALS</p>
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
                <p className="eyebrow">MILKDROP WEB</p>
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
              This browser edition uses Web Audio and WebGL 2. Audio is analyzed on
              your device; it is never recorded or uploaded.
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
              <strong>Preset compatibility</strong>
              <p>
                This release renders classic MilkDrop presets. MilkDrop3-only
                double presets (<code>.milk2</code>) and desktop editing tools are
                not yet available on the web.
              </p>
            </div>
            <a
              className="about-link"
              href="https://github.com/leyanlo/MilkDrop3"
              target="_blank"
              rel="noreferrer"
            >
              View source on GitHub <ArrowRightIcon />
            </a>
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
