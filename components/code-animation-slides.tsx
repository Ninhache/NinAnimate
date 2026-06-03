"use client";

import type React from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Upload,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import SlidePanel from "./slide-panel";

// Load the editor client-side only. It pulls in Shiki (and its ESM-only
// dependency tree) for the magic-move animation, which must not enter the
// server/prerender graph — doing so breaks the Next.js static export
// (`output: "export"`). The whole tool is client-interactive anyway.
const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-md bg-gray-950" aria-hidden />
  ),
});

export type Slide = {
  id: string;
  title: string;
  code: string;
  language: string;
};

// Zoom (code font size) bounds and step.
const FONT_MIN = 8;
const FONT_MAX = 48;
const FONT_DEFAULT = 14; // == the old 0.875rem
const FONT_STEP = 0.1; // 10% per click / wheel notch
const FONT_STORAGE_KEY = "ninanimate-fontsize";
const clampFont = (px: number) =>
  Math.round(Math.max(FONT_MIN, Math.min(FONT_MAX, px)));

// User-tunable settings for the composed video export.
type ExportSettings = {
  paddingPx: number;
  holdMs: number;
  transitionMs: number;
  fps: number;
};
const EXPORT_SETTINGS_KEY = "ninanimate-export-settings";
const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  paddingPx: 72,
  holdMs: 1400,
  transitionMs: 900,
  fps: 30,
};

/** One labeled row in the export-settings panel. */
function SettingRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-300">{label}</span>
        <span className="text-xs tabular-nums text-gray-400">{value}</span>
      </div>
      {children}
    </div>
  );
}

// Default TypeScript code for new slides when no slides exist
const DEFAULT_TS_CODE = `// TypeScript Example
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

const user: string = "World";
console.log(greet(user));`;

export default function CodeAnimationSlides() {
  // Seed slides tell a small refactoring story so each transition showcases a
  // different "magic move" effect: parens expanding for new params, type
  // annotations fading in, a for-loop morphing into `.reduce`, and finally an
  // extraction/rename. Edit any slide by double-clicking it.
  const [slides, setSlides] = useState<Slide[]>([
    {
      id: "1",
      title: "1 · Naive implementation",
      code: "function total(items) {\n  let result = 0;\n  for (let i = 0; i < items.length; i++) {\n    result += items[i].price;\n  }\n  return result;\n}",
      language: "typescript",
    },
    {
      id: "2",
      title: "2 · Add type safety",
      code: "function total(items: Item[]): number {\n  let result = 0;\n  for (let i = 0; i < items.length; i++) {\n    result += items[i].price;\n  }\n  return result;\n}",
      language: "typescript",
    },
    {
      id: "3",
      title: "3 · Refactor to reduce",
      code: "function total(items: Item[]): number {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}",
      language: "typescript",
    },
    {
      id: "4",
      title: "4 · Add a discount",
      code: "function total(items: Item[], discount: number): number {\n  return items.reduce((sum, item) => sum + item.price, 0) * (1 - discount);\n}",
      language: "typescript",
    },
    {
      id: "5",
      title: "5 · Extract & compose",
      code: "const subtotal = (items: Item[]): number =>\n  items.reduce((sum, item) => sum + item.price, 0);\n\nconst total = (items: Item[], discount: number): number =>\n  subtotal(items) * (1 - discount);",
      language: "typescript",
    },
  ]);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- Zoom (code font size) ---
  const [fontSizePx, setFontSizePx] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(FONT_STORAGE_KEY);
      if (saved) return clampFont(Number(saved));
    }
    return FONT_DEFAULT;
  });
  const zoomIn = useCallback(
    () => setFontSizePx((p) => clampFont(p * (1 + FONT_STEP))),
    []
  );
  const zoomOut = useCallback(
    () => setFontSizePx((p) => clampFont(p * (1 - FONT_STEP))),
    []
  );
  const zoomReset = useCallback(() => setFontSizePx(FONT_DEFAULT), []);
  const zoomPercent = Math.round((fontSizePx / FONT_DEFAULT) * 100);

  // --- Video export (composed on a canvas, not a screen recording) ---
  const [isExporting, setIsExporting] = useState(false);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(EXPORT_SETTINGS_KEY);
        if (saved)
          return { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(saved) };
      } catch {
        // ignore malformed storage
      }
    }
    return DEFAULT_EXPORT_SETTINGS;
  });
  const setSetting = <K extends keyof ExportSettings>(
    key: K,
    val: ExportSettings[K]
  ) => setExportSettings((s) => ({ ...s, [key]: val }));

  // Code area ref — surface for the Ctrl/Cmd + wheel zoom listener.
  const codeAreaRef = useRef<HTMLDivElement>(null);

  // Persist export settings across reloads.
  useEffect(() => {
    window.localStorage.setItem(
      EXPORT_SETTINGS_KEY,
      JSON.stringify(exportSettings)
    );
  }, [exportSettings]);

  const exportSlides = () => {
    const dataStr = JSON.stringify(slides, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = "code-slides.json";

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  const importSlides = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = event.target.files?.[0];

    if (!file) return;

    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedSlides = JSON.parse(content) as Slide[];

        if (Array.isArray(importedSlides) && importedSlides.length > 0) {
          // Force all slides to use TypeScript as the language
          const updatedSlides = importedSlides.map((slide) => ({
            ...slide,
            language: "typescript",
          }));

          setSlides(updatedSlides);
          setCurrentSlideIndex(0);
        }
      } catch (error) {
        console.error("Error importing slides:", error);
        alert("Failed to import slides. Please check the file format.");
      }
    };

    // We're resetting the input value so the same file can be imported again if needed
    event.target.value = "";
  };

  const handleReorderSlides = (startIndex: number, endIndex: number) => {
    const reorderedSlides = [...slides];
    const [removed] = reorderedSlides.splice(startIndex, 1);
    reorderedSlides.splice(endIndex, 0, removed);

    setSlides(reorderedSlides);

    if (currentSlideIndex === startIndex) {
      setCurrentSlideIndex(endIndex);
    } else if (
      (currentSlideIndex > startIndex && currentSlideIndex <= endIndex) ||
      (currentSlideIndex < startIndex && currentSlideIndex >= endIndex)
    ) {
      const offset = currentSlideIndex > startIndex ? -1 : 1;
      setCurrentSlideIndex(currentSlideIndex + offset);
    }
  };

  const currentSlide = slides[currentSlideIndex];

  // Calculate total steps based on code complexity
  // useEffect(() => {
  //   if (currentSlide && nextSlide) {
  //     // A simple heuristic to determine number of steps based on code differences
  //     const currentLines = currentSlide.code.split("\n").length;
  //     const nextLines = nextSlide.code.split("\n").length;
  //     const diffLines = Math.abs(currentLines - nextLines);

  //     // Count character differences as another factor
  //     const charDiff = Math.abs(
  //       currentSlide.code.length - nextSlide.code.length
  //     );

  //     // Calculate steps based on differences (with a minimum of 1 and maximum of 5)
  //     const calculatedSteps = Math.max(
  //       1,
  //       Math.min(5, Math.ceil(diffLines / 2) + Math.ceil(charDiff / 50))
  //     );
  //     // setTotalSteps(calculatedSteps);
  //   } else {
  //     // setTotalSteps(1);
  //   }
  // }, [currentSlideIndex, currentSlide, nextSlide]);

  // Persist the chosen zoom across reloads.
  useEffect(() => {
    window.localStorage.setItem(FONT_STORAGE_KEY, String(fontSizePx));
  }, [fontSizePx]);

  // Ctrl/Cmd + wheel over the code zooms (instead of scrolling/page-zoom).
  // React's onWheel is passive and can't preventDefault, so attach natively.
  useEffect(() => {
    const el = codeAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomIn, zoomOut]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Zoom shortcuts work in any mode; block the native browser zoom.
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomIn();
          return;
        }
        if (e.key === "-") {
          e.preventDefault();
          zoomOut();
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          zoomReset();
          return;
        }
      }

      if (isPlaying) {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          if (currentSlideIndex < slides.length - 1) {
            setCurrentSlideIndex(currentSlideIndex + 1);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (currentSlideIndex > 0) {
            setCurrentSlideIndex(currentSlideIndex - 1);
          }
        } else if (e.key === "Escape") {
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlaying, currentSlideIndex, slides.length, zoomIn, zoomOut, zoomReset]);

  const handleAddSlide = () => {
    // Shouldnt be possible, BUT, If no slides exist, create a default slide with the default code
    if (slides.length === 0) {
      const newSlide: Slide = {
        id: "1",
        title: "Slide 1",
        code: DEFAULT_TS_CODE,
        language: "typescript",
      };
      setSlides([newSlide]);
      setCurrentSlideIndex(0);
      return;
    }

    // Generate a new ID (find the highest ID and increment)
    // TODO: improve this, it's gonna lag if we've many slides
    const highestId = Math.max(
      ...slides.map((slide) => Number.parseInt(slide.id))
    );
    const newId = (highestId + 1).toString();

    const newSlide: Slide = {
      id: newId,
      title: `Slide ${newId}`,
      code: currentSlide ? currentSlide.code : DEFAULT_TS_CODE,
      language: "typescript",
    };

    // Add the new slide after the selected slide (known as current slide)
    const newSlides = [...slides];
    newSlides.splice(currentSlideIndex + 1, 0, newSlide);

    setSlides(newSlides);
    // Select the new added slide
    setCurrentSlideIndex(currentSlideIndex + 1);
  };

  const handleDeleteSlide = (id: string) => {
    if (slides.length <= 1) return;

    const index = slides.findIndex((slide) => slide.id === id);
    const newSlides = slides.filter((slide) => slide.id !== id);
    setSlides(newSlides);

    if (currentSlideIndex >= index && currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const handleCodeChange = (code: string) => {
    const updatedSlides = [...slides];
    updatedSlides[currentSlideIndex] = {
      ...updatedSlides[currentSlideIndex],
      code,
    };
    setSlides(updatedSlides);
  };

  const handleTitleChange = (id: string, title: string) => {
    const updatedSlides = slides.map((slide) =>
      slide.id === id ? { ...slide, title } : slide
    );
    setSlides(updatedSlides);
  };

  const handlePlayPause = () => {
    const newPlayingState = !isPlaying;
    setIsPlaying(newPlayingState);
  };

  const handleSlideSelect = (index: number) => {
    setIsPlaying(false);
    setCurrentSlideIndex(index);
  };

  const handlePrevSlide = () => {
    if (currentSlideIndex > 0) {
      setIsPlaying(false);
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const handleNextSlide = () => {
    if (currentSlideIndex < slides.length - 1) {
      setIsPlaying(false);
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  /**
   * Export the whole slideshow as a video by re-rendering the magic-move onto a
   * canvas (no screen capture, no cursor, no permission prompt) and encoding it
   * frame-perfect to MP4 via WebCodecs (WebM fallback). The exported video is
   * independent of the live view — it tokenizes the slides directly.
   */
  const handleExportVideo = async () => {
    if (isExporting || slides.length === 0) return;
    setIsExporting(true);
    const toastId = toast.loading("Preparing video…");
    try {
      const [{ getHighlighter, SHIKI_LANG, SHIKI_THEME }, compose] =
        await Promise.all([
          import("./shiki-highlighter"),
          import("../lib/compose-video"),
        ]);
      const highlighter = await getHighlighter();

      const result = await compose.composeSlidesVideo({
        highlighter,
        // Normalize tabs the same way the editor does.
        codes: slides.map((s) => s.code.replace(/\t/g, "  ")),
        lang: SHIKI_LANG,
        theme: SHIKI_THEME,
        paddingPx: exportSettings.paddingPx,
        holdMs: exportSettings.holdMs,
        transitionMs: exportSettings.transitionMs,
        fps: exportSettings.fps,
        onProgress: (ratio) =>
          toast.loading(`Rendering video… ${Math.round(ratio * 100)}%`, {
            id: toastId,
          }),
      });

      compose.downloadBlob(result.blob, `nin-animate.${result.ext}`);
      toast.success(`Saved nin-animate.${result.ext}`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Video export failed.", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-screen bg-gray-900 text-white">
      <header className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold">Nin-Animate</h1>
        <div className="flex items-center space-x-4">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded-md border border-gray-600 px-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={zoomOut}
              disabled={isExporting || fontSizePx <= FONT_MIN}
              title="Zoom out (Ctrl/Cmd -)"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="w-10 select-none text-center text-xs tabular-nums">
              {zoomPercent}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={zoomIn}
              disabled={isExporting || fontSizePx >= FONT_MAX}
              title="Zoom in (Ctrl/Cmd +)"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={zoomReset}
              disabled={isExporting}
              title="Reset zoom (Ctrl/Cmd 0)"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          <Button
            className="bg-primary"
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={() => document.getElementById("import-slides")?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button
            className="bg-primary"
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={exportSlides}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <div className="relative flex items-center gap-2">
            <Button
              className="bg-primary"
              variant="outline"
              size="sm"
              disabled={isExporting || slides.length === 0}
              onClick={handleExportVideo}
              title="Export the slideshow as a video (MP4)"
            >
              <Video className="w-4 h-4 mr-2" />
              {isExporting ? "Exporting…" : "Export Video"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={isExporting}
              onClick={() => setShowExportSettings((v) => !v)}
              title="Export settings"
              aria-expanded={showExportSettings}
            >
              <Settings className="w-4 h-4" />
            </Button>

            {showExportSettings && (
              <>
                {/* click-away backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowExportSettings(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-72 space-y-4 rounded-md border border-gray-700 bg-gray-800 p-4 shadow-xl">
                  <p className="text-sm font-semibold">Export settings</p>

                  <SettingRow
                    label="Padding"
                    value={`${exportSettings.paddingPx}px`}
                  >
                    <Slider
                      aria-label="Padding"
                      min={0}
                      max={160}
                      step={4}
                      value={[exportSettings.paddingPx]}
                      onValueChange={([v]) => setSetting("paddingPx", v)}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Hold per slide"
                    value={`${(exportSettings.holdMs / 1000).toFixed(1)}s`}
                  >
                    <Slider
                      aria-label="Hold per slide"
                      min={400}
                      max={4000}
                      step={100}
                      value={[exportSettings.holdMs]}
                      onValueChange={([v]) => setSetting("holdMs", v)}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Transition"
                    value={`${(exportSettings.transitionMs / 1000).toFixed(1)}s`}
                  >
                    <Slider
                      aria-label="Transition"
                      min={300}
                      max={2500}
                      step={100}
                      value={[exportSettings.transitionMs]}
                      onValueChange={([v]) => setSetting("transitionMs", v)}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Frame rate"
                    value={`${exportSettings.fps} fps`}
                  >
                    <div className="flex gap-2">
                      {[24, 30, 60].map((f) => (
                        <Button
                          key={f}
                          size="sm"
                          variant={
                            exportSettings.fps === f ? "default" : "outline"
                          }
                          className="flex-1"
                          onClick={() => setSetting("fps", f)}
                        >
                          {f}
                        </Button>
                      ))}
                    </div>
                  </SettingRow>

                  <div className="flex items-center justify-between pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExportSettings(DEFAULT_EXPORT_SETTINGS)
                      }
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      disabled={isExporting || slides.length === 0}
                      onClick={() => {
                        setShowExportSettings(false);
                        handleExportVideo();
                      }}
                    >
                      <Video className="mr-2 h-4 w-4" />
                      Render
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <input
        type="file"
        id="import-slides"
        accept=".json"
        style={{ display: "none" }}
        onChange={importSlides}
      />

      <div className="flex flex-1 overflow-hidden">
        <SlidePanel
          slides={slides}
          currentSlideIndex={currentSlideIndex}
          onSlideSelect={handleSlideSelect}
          onAddSlide={handleAddSlide}
          onDeleteSlide={handleDeleteSlide}
          onTitleChange={handleTitleChange}
          onReorderSlides={handleReorderSlides}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={codeAreaRef} className="flex-1 overflow-hidden p-4">
            {currentSlide ? (
              <CodeEditor
                code={currentSlide.code}
                language={currentSlide.language}
                onChange={handleCodeChange}
                enableDoubleClickEdit={!isPlaying && !isExporting}
                fontSizePx={fontSizePx}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Button onClick={handleAddSlide}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Slide
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePlayPause}
              disabled={slides.length <= 1 || isExporting}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </Button>
            <span className="text-sm flex gap-2 align-middle">
              <p>{isPlaying ? "Presentation Mode" : "Edit Mode"}</p>
              <p> • </p>
              <p>
                {slides.length > 0
                  ? `Slide ${currentSlideIndex + 1} / ${slides.length}`
                  : "No slides"}
              </p>
            </span>
          </div>

          {isPlaying ? (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400">
                Use arrow keys or space to navigate slides. Press ESC to exit.
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevSlide}
                disabled={
                  currentSlideIndex === 0 || slides.length === 0 || isExporting
                }
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextSlide}
                disabled={
                  currentSlideIndex >= slides.length - 1 ||
                  slides.length === 0 ||
                  isExporting
                }
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>

        <div className="w-full">
          <Slider
            value={[slides.length > 0 ? currentSlideIndex : 0]}
            min={0}
            max={Math.max(0, slides.length - 1)}
            step={1}
            disabled={slides.length <= 1 || isExporting}
            onValueChange={(value) => {
              if (slides.length > 0) {
                setIsPlaying(false);
                setCurrentSlideIndex(value[0]);
              }
            }}
          />
        </div>
      </div>

      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}
