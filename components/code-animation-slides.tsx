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
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import CodeEditor from "./code-editor";
import SlidePanel from "./slide-panel";

export type Slide = {
  id: string;
  title: string;
  code: string;
  language: string;
};

// Default TypeScript code for new slides when no slides exist
const DEFAULT_TS_CODE = `// TypeScript Example
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

const user: string = "World";
console.log(greet(user));`;

export default function CodeAnimationSlides() {
  const [slides, setSlides] = useState<Slide[]>([
    {
      id: "1",
      title: "Initial Setup",
      code: "function hello(): void {\n  console.log('Hello, world!');\n}",
      language: "typescript",
    },
    {
      id: "2",
      title: "Add Parameters",
      code: "function hello(name: string): void {\n  console.log(`Hello, ${name}!`);\n}",
      language: "typescript",
    },
    {
      id: "3",
      title: "Return Value",
      code: "function hello(name: string): string {\n  return `Hello, ${name}!`;\n}",
      language: "typescript",
    },
  ]);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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
  const nextSlide = slides[currentSlideIndex + 1];

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [isPlaying, currentSlideIndex, slides.length]);

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

  return (
    <div className="flex flex-col w-full h-screen bg-gray-900 text-white">
      <header className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold">Nin-Animate</h1>
        <div className="flex items-center space-x-4">
          <Button
            className="bg-primary"
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("import-slides")?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button
            className="bg-primary"
            variant="outline"
            size="sm"
            onClick={exportSlides}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
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
          <div className="flex-1 overflow-hidden p-4">
            {currentSlide ? (
              <CodeEditor
                code={currentSlide.code}
                language={currentSlide.language}
                onChange={handleCodeChange}
                nextCode={nextSlide?.code}
                currentStep={0}
                totalSteps={1}
                onStepComplete={() => {}}
                enableDoubleClickEdit={!isPlaying}
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
              disabled={slides.length <= 1}
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
                disabled={currentSlideIndex === 0 || slides.length === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextSlide}
                disabled={
                  currentSlideIndex >= slides.length - 1 || slides.length === 0
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
            disabled={slides.length <= 1}
            onValueChange={(value) => {
              if (slides.length > 0) {
                setIsPlaying(false);
                setCurrentSlideIndex(value[0]);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
