"use client";

import type React from "react";

import { useEffect, useRef, useState } from "react";
import { ShikiMagicMove } from "shiki-magic-move/react";
import type { HighlighterCore } from "shiki/core";
import {
  getHighlighter,
  SHIKI_LANG,
  SHIKI_THEME,
} from "./shiki-highlighter";

import "shiki-magic-move/dist/style.css";

type CodeEditorProps = {
  code: string;
  /**
   * Reserved for future multi-language support. The app currently forces
   * TypeScript everywhere, so only the TS grammar is loaded into Shiki.
   */
  language: string;
  onChange: (code: string) => void;
  enableDoubleClickEdit?: boolean;
  /** Font size (px) for the code, driven by the zoom controls. */
  fontSizePx?: number;
};

/**
 * Tuning for the "magic move" transition that plays whenever `code` changes
 * (i.e. when the user navigates between slides). Tokens that exist in both
 * the old and new code glide to their new position; brand-new tokens fade in
 * and removed ones fade out, instead of whole lines popping in and out.
 *
 * See MagicMoveRenderOptions / MagicMoveDifferOptions in shiki-magic-move.
 */
const MAGIC_MOVE_OPTIONS = {
  duration: 800,
  // Per-token delay (ms) so changes ripple across the snippet rather than
  // every token moving in perfect lockstep.
  stagger: 3,
  lineNumbers: false,
  // Keep our own dark container background instead of the theme's so the
  // editor blends with the surrounding gray-950 chrome.
  containerStyle: false,
  // Better identity matching for tokens with identical content.
  enhanceMatching: true,
  easing: "ease-in-out",
} as const;

export default function CodeEditor({
  code,
  onChange,
  enableDoubleClickEdit = false,
  fontSizePx,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayedCode, setDisplayedCode] = useState(code);
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);

  // Normalize tabs to spaces to ensure consistent spacing
  const normalizeCode = (codeString: string) => {
    return codeString.replace(/\t/g, "  ");
  };

  // Load the shared Shiki highlighter once. It's async (grammar + theme),
  // so until it resolves we fall back to plain, unhighlighted text.
  useEffect(() => {
    let active = true;
    getHighlighter().then((hl) => {
      if (active) setHighlighter(hl);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setDisplayedCode(normalizeCode(code));
    }
  }, [code, isEditing]);

  const handleCodeChange = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const newCode = e.currentTarget.value;
    setDisplayedCode(newCode);
    onChange(newCode);
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
      style={{ fontSize: fontSizePx ? `${fontSizePx}px` : undefined }}
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
          {highlighter ? (
            <ShikiMagicMove
              highlighter={highlighter}
              lang={SHIKI_LANG}
              theme={SHIKI_THEME}
              code={normalizeCode(code)}
              options={MAGIC_MOVE_OPTIONS}
              className="code-preview"
            />
          ) : (
            // Pre-highlighter fallback: render the raw code so there's no
            // flash of empty space while the grammar/theme load.
            <pre className="code-preview">{normalizeCode(code)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
