import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/** Theme + language the magic-move renderer is configured for. */
export const SHIKI_THEME = "monokai";
export const SHIKI_LANG = "typescript";

let highlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * Lazily create a single Shiki highlighter shared across the whole app.
 *
 * Why the JavaScript regex engine (not the default WASM/oniguruma one):
 * this project is a static export (`output: "export"`) served from plain
 * file hosting such as GitHub Pages. The WASM engine needs to fetch a
 * `.wasm` asset at runtime with the correct MIME type, which static hosts
 * don't always provide. The JS engine is bundled inline, so there is no
 * extra asset to serve.
 *
 * The promise is memoised so repeated mounts of the editor reuse the same
 * highlighter instead of re-tokenising the grammar each time.
 *
 * @returns A promise resolving to the shared highlighter instance.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import("@shikijs/themes/monokai")],
      langs: [import("@shikijs/langs/typescript")],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}
