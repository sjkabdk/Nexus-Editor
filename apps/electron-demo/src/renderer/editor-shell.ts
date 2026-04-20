import { createEditor, createWikilinksPlugin, type EditorAPI } from "@nexus/core";
import { createGfmPreset } from "@nexus/preset-gfm";
import { createHistoryPlugin } from "@nexus/plugin-history";
import { createToolbarPlugin, createToolbarUI, type ToolbarUI } from "@nexus/plugin-toolbar";
import { createSearchPlugin } from "@nexus/plugin-search";
import type { AppState } from "./state";
import { type EditorSettings, settingsToTheme } from "./settings";

export interface EditorShellOptions {
  container: HTMLElement;
  state: AppState;
  settings: EditorSettings;
  onStateChange: () => void;
  /** Called when the user clicks a wiki link. */
  onWikilinkNavigate?(target: string, opts: { unresolved: boolean }): void;
  /** Resolves a wiki-link name to an absolute target path; null = unresolved. */
  resolveWikilink?(name: string): string | null;
  /** Returns autocomplete candidates for the query after `[[`. */
  suggestWikilinks?(query: string): string[];
}

export interface EditorShell {
  editor: EditorAPI;
  toolbar: ToolbarUI;
  applySettings(settings: EditorSettings): void;
  loadDocument(content: string): void;
  destroy(): void;
}

export function createEditorShell(options: EditorShellOptions): EditorShell {
  const {
    container,
    state,
    settings,
    onStateChange,
    onWikilinkNavigate,
    resolveWikilink,
    suggestWikilinks,
  } = options;

  const wikilinksPlugin = createWikilinksPlugin({
    resolve: resolveWikilink ? (name) => resolveWikilink(name) : undefined,
    onNavigate: onWikilinkNavigate,
    suggest: suggestWikilinks ? (q) => suggestWikilinks(q) : undefined,
  });

  const editor = createEditor({
    container,
    initialValue: state.content,
    plugins: [
      createGfmPreset(),
      createHistoryPlugin(),
      createToolbarPlugin(),
      createSearchPlugin(),
      wikilinksPlugin,
    ],
    livePreview: settings.livePreview,
    theme: settingsToTheme(settings),
    tabSize: settings.tabSize,
    direction: settings.direction,
    indentGuides: settings.indentGuides,
    onChange(doc) {
      state.content = doc;
      state.dirty = true;
      // Keep the link index in sync with the buffer so the backlinks panel
      // reacts immediately when the user types `[[...]]`.
      if (state.linkIndex && state.activeFile) {
        state.linkIndex.updateFile(state.activeFile, doc);
      }
      onStateChange();
    },
  });

  const toolbar = createToolbarUI(editor);
  container.insertBefore(toolbar.element, container.firstChild);

  return {
    editor,
    toolbar,
    applySettings(next: EditorSettings) {
      editor.setTheme(settingsToTheme(next));
    },
    loadDocument(content: string) {
      editor.setDocument(content);
      state.content = content;
      state.dirty = false;
      onStateChange();
    },
    destroy() {
      toolbar.destroy();
      editor.destroy();
    },
  };
}
