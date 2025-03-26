"use client";

import type React from "react";

import { Button } from "@/components/ui/button";
import { diffLines } from "diff";
import { Edit, Play } from "lucide-react";
import Prism from "prismjs";
import { useEffect, useMemo, useRef, useState } from "react";
import CodeAnimate from "./animate-code";

import "prismjs/components/prism-typescript";

type CodeEditorProps = {
  code: string;
  language: string;
  onChange: (code: string) => void;
  nextCode?: string;
  currentStep: number;
  totalSteps: number;
  onStepComplete: () => void;
  enableDoubleClickEdit?: boolean;
};

export default function CodeEditor({
  code,
  language,
  onChange,
  nextCode,
  currentStep,
  totalSteps,
  onStepComplete,
  enableDoubleClickEdit = false,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayedCode, setDisplayedCode] = useState(code);
  const [animationProgress, setAnimationProgress] = useState(0);
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Normalize tabs to spaces to ensure consistent spacing
  const normalizeCode = (codeString: string) => {
    return codeString.replace(/\t/g, "  ");
  };

  const grammar = useMemo(() => {
    const languageMap: Record<string, keyof typeof Prism.languages> = {
      typescript: "typescript",
    };
    const prismLanguage = languageMap[language] || "javascript";
    return Prism.languages[prismLanguage] || Prism.languages.javascript;
  }, [language]);

  const interpolatedCode = useMemo(() => {
    if (!nextCode || currentStep === 0) return normalizeCode(code);

    // If we're at the final step, show the target code
    if (currentStep === totalSteps) {
      return normalizeCode(nextCode);
    }

    // For intermediate steps, do a crude diff-based partial interpolation (yes i still don't care)
    const diff = diffLines(normalizeCode(code), normalizeCode(nextCode));
    let result = "";

    diff.forEach((part) => {
      if (!part.added && !part.removed) {
        // Unchanged parts are always included
        result += part.value;
      } else if (part.removed && animationProgress < 0.5) {
        // Show removed parts in the first half of the animation
        result += part.value;
      } else if (part.added && animationProgress > 0.5) {
        // Show added parts in the second half of the animation
        result += part.value;
      }
    });

    return result;
  }, [code, nextCode, currentStep, totalSteps, animationProgress]);

  useEffect(() => {
    if (!isEditing) {
      setDisplayedCode(normalizeCode(code));
    }
  }, [code, isEditing]);

  useEffect(() => {
    if (currentStep > 0 && nextCode) {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }

      setAnimationProgress(0);

      const animationDuration = 1500; // ms
      const interval = 50; // ms
      const steps = animationDuration / interval;

      let step = 0;
      animationTimerRef.current = setInterval(() => {
        step++;
        const progress = step / steps;
        setAnimationProgress(progress);

        if (progress >= 1) {
          if (animationTimerRef.current) {
            clearInterval(animationTimerRef.current);
          }
          onStepComplete();
        }
      }, interval);
    }

    return () => {
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
      }
    };
  }, [currentStep, nextCode, onStepComplete]);

  const handleCodeChange = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const newCode = e.currentTarget.value;
    setDisplayedCode(newCode);
    onChange(newCode);
  };

  // Custom function to get keys for lines that helps with variable name changes
  const getCustomKey = (line: string) => {
    const trimmed = line.trimStart();

    // For variable declarations, use everything except the variable name
    if (
      trimmed.startsWith("const ") ||
      trimmed.startsWith("let ") ||
      trimmed.startsWith("var ") ||
      trimmed.startsWith("type ")
    ) {
      const parts = trimmed.split("=");
      if (parts.length > 1) {
        // Return the right side of the assignment as the key
        return parts.slice(1).join("=").trim();
      }
    }

    // For function declarations, use the function body as the key
    if (trimmed.startsWith("function ")) {
      const bodyStart = trimmed.indexOf("{");
      if (bodyStart > 0) {
        return trimmed.substring(bodyStart);
      }
    }

    // Or default to the trimmed line
    return trimmed;
  };

  // Decide if a line is "special" (variable / function declarations / ...)
  const checkSpecialLine = (line: string) => {
    const trimmed = line.trimStart();
    return (
      trimmed.startsWith("const ") ||
      trimmed.startsWith("let ") ||
      trimmed.startsWith("var ") ||
      trimmed.startsWith("function ") ||
      trimmed.startsWith("type ")
    );
  };

  const renderSpecialLine = ({ line }: { line: string }) => {
    const highlighted = Prism.highlight(line, grammar, language);
    return (
      <pre
        key={line}
        dangerouslySetInnerHTML={{ __html: highlighted }}
        className="special-line"
        style={{
          transition: "all 0.3s ease-in-out",
          position: "relative",
        }}
      />
    );
  };

  /**
   * Tabbing logic (indent AND unindent), it's for a line and not the current cursor position
   * The use of requestAnimationFrame is to restore the cursor after DOM update, to avoid blinking at the end of text if the cursor being null
   */
  function handleTab(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    displayedCode: string,
    setDisplayedCode: (val: string) => void,
    onChange: (val: string) => void,
    textAreaRef: React.RefObject<HTMLTextAreaElement | null>
  ) {
    e.preventDefault();

    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;

    const lines = displayedCode.split("\n");
    const selectionStartLine =
      displayedCode.substring(0, start).split("\n").length - 1;
    const selectionEndLine =
      displayedCode.substring(0, end).split("\n").length - 1;

    const before = lines.slice(0, selectionStartLine);
    const selected = lines.slice(selectionStartLine, selectionEndLine + 1);
    const after = lines.slice(selectionEndLine + 1);

    let newValue = "";
    let newStart = start;
    let newEnd = end;

    if (e.shiftKey) {
      // Remove 2 spaces or a tab from the beginning of each selected line
      const unindented = selected.map((line) =>
        line.startsWith("  ")
          ? line.slice(2)
          : line.startsWith("\t")
            ? line.slice(1)
            : line
      );

      newValue = [...before, ...unindented, ...after].join("\n");

      // If a line was unindented, we reduce end by 2 for each unindented line
      const actuallyRemoved = selected.filter(
        (line) => line.startsWith("  ") || line.startsWith("\t")
      ).length;
      // Decrease the selection end by 2 * the # of lines that actually got unindented
      newEnd = end - 2 * actuallyRemoved;
    } else {
      // Add 2 spaces to the beginning of each selected line
      const indented = selected.map((line) => "  " + line);
      newValue = [...before, ...indented, ...after].join("\n");

      // For each line in the selection, we shift the selection by 2
      newStart = start + 2;
      newEnd = end + 2 * selected.length;
    }

    setDisplayedCode(newValue);
    onChange(newValue);

    requestAnimationFrame(() => {
      const ta = textAreaRef?.current;
      if (ta) {
        ta.selectionStart = newStart;
        ta.selectionEnd = newEnd;
      }
    });
  }

  return (
    <div
      className="w-full h-full overflow-auto rounded-md bg-gray-950 text-white font-mono text-sm relative"
      onDoubleClick={
        enableDoubleClickEdit ? () => setIsEditing(true) : undefined
      }
    >
      {isEditing ? (
        <textarea
          ref={editorRef}
          className="w-full h-full p-4 bg-gray-950 text-red-500 font-mono text-sm resize-none outline-none code-editor"
          style={{ tabSize: 2 }}
          value={displayedCode}
          onChange={handleCodeChange}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              handleTab(
                e,
                displayedCode,
                setDisplayedCode,
                onChange,
                editorRef
              );
            } else if (e.key === "Escape") {
              setIsEditing(false);
            }
          }}
          autoFocus
        />
      ) : (
        <div className="relative w-full h-full p-4">
          <CodeAnimate
            value={interpolatedCode}
            grammar={grammar}
            language={language}
            animationEnabled={currentStep > 0}
            animationOptions={{
              duration: 300,
              easing: "ease-in-out",
              disrespectUserMotionPreference: true,
            }}
            getKey={getCustomKey}
            checkSpecialLine={checkSpecialLine}
            renderSpecialLine={renderSpecialLine}
            maxAnchor={20}
            innerProps={{
              className: "code-preview",
              style: {
                display: "block",
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: "0.875rem",
                lineHeight: 1.5,
                tabSize: 2,
              },
            }}
          />

          {currentStep > 0 && (
            <div className="absolute top-2 right-2 bg-gray-800 px-2 py-1 rounded text-xs">
              Step {currentStep} of {totalSteps}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
