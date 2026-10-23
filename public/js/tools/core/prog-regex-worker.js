/**
 * Web Worker für den Regex-Tester: führt das Muster getrennt vom Hauptthread aus.
 * Die Oberfläche beendet den Worker nach einem Zeitlimit (katastrophales Backtracking).
 */
import { collectMatches, replacePreview } from './prog-regex.js';

self.addEventListener('message', (event) => {
  const { id, pattern, flags, text, replacement, withReplace } = event.data ?? {};
  const started = Date.now();
  try {
    const result = collectMatches(pattern, flags, text);
    const replaced = withReplace ? replacePreview(pattern, flags, text, replacement) : null;
    self.postMessage({ id, ok: true, result, replaced, ms: Date.now() - started });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message, name: error.name });
  }
});
