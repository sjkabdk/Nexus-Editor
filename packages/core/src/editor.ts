import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { EventEmitter } from "./event-emitter";
import { createLivePreviewExtension } from "./live-preview";
import { computeSlashState } from "./slash-state";
import type { EditorAPI, EditorConfig, EditorEventMap, NexusPlugin, ParserLike } from "./types";
import { createWidgetExtension } from "./widget-extension";

function createEmptyAst(): Root {
  return {
    type: "root",
    children: []
  };
}

function parseDocument(parser: ParserLike, markdown: string): Root {
  try {
    return parser.parse(markdown);
  } catch {
    return createEmptyAst();
  }
}

function createParser(plugins: NexusPlugin[]): ParserLike {
  return {
    parse(markdown) {
      const processor = unified().use(remarkParse);

      for (const plugin of plugins) {
        for (const remarkPlugin of plugin.remarkPlugins ?? []) {
          processor.use(remarkPlugin);
        }
      }

      const tree = processor.parse(markdown);
      return processor.runSync(tree) as Root;
    }
  };
}

export function createEditor(config: EditorConfig): EditorAPI {
  const plugins = config.plugins ?? [];
  const parser = config.parser ?? createParser(plugins);
  const shortcuts = plugins.flatMap((plugin) => plugin.shortcuts ?? []);
  const slashCommands = plugins.flatMap((plugin) => plugin.slashCommands ?? []);
  const cmExtensions = plugins.flatMap((plugin) => plugin.cmExtensions ?? []);
  const widgetDefs = plugins.flatMap((plugin) => plugin.widgets ?? []);
  const parseDelayMs = config.parseDelayMs ?? 0;
  const emitter = new EventEmitter<EditorEventMap>();
  let destroyed = false;
  let focused = false;
  let parseTimer: ReturnType<typeof setTimeout> | undefined;
  let currentAst = parseDocument(parser, config.initialValue ?? "");
  let api!: EditorAPI;

  function setFocused(next: boolean) {
    if (destroyed || focused === next) {
      return;
    }

    focused = next;

    if (next) {
      config.onFocus?.();
      emitter.emit("focus");
      return;
    }

    config.onBlur?.();
    emitter.emit("blur");
  }

  function emitChange(markdown: string) {
    if (destroyed) {
      return;
    }

    currentAst = parseDocument(parser, markdown);
    config.onChange?.(markdown, currentAst);
    emitter.emit("change", markdown, currentAst);
  }

  function scheduleChange(markdown: string) {
    if (parseTimer) {
      clearTimeout(parseTimer);
      parseTimer = undefined;
    }

    if (parseDelayMs <= 0) {
      emitChange(markdown);
      return;
    }

    parseTimer = setTimeout(() => {
      parseTimer = undefined;
      emitChange(markdown);
    }, parseDelayMs);
  }

  const shortcutExtensions =
    shortcuts.length > 0
      ? [
          keymap.of(
            shortcuts.map((shortcut) => ({
              key: shortcut.key,
              run: () => shortcut.run(api)
            }))
          )
        ]
      : [];

  const view = new EditorView({
    parent: config.container,
    state: EditorState.create({
      doc: config.initialValue ?? "",
      extensions: [
        EditorView.domEventHandlers({
          focus() {
            setFocused(true);
            return false;
          },
          blur() {
            setFocused(false);
            return false;
          }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            scheduleChange(update.state.doc.toString());
          }

          if ((update.selectionSet || update.docChanged) && !destroyed) {
            const sel = update.state.selection.main;

            if (update.selectionSet) {
              emitter.emit("selectionChange", { anchor: sel.anchor, head: sel.head });
            }

            if (slashCommands.length > 0) {
              const doc = update.state.doc.toString();
              const state = computeSlashState(doc, sel.head, slashCommands);
              let coords: { left: number; top: number; bottom: number } | null = null;

              if (state.isOpen && state.from !== null) {
                try {
                  const raw = update.view.coordsAtPos(state.from);
                  if (raw) {
                    coords = { left: raw.left, top: raw.top, bottom: raw.bottom };
                  }
                } catch { /* out of range */ }
              }

              emitter.emit("slashMenuChange", { ...state, coords });
            }
          }
        }),
        ...createLivePreviewExtension(parser, config.livePreview),
        ...createWidgetExtension(parser, widgetDefs),
        ...shortcutExtensions,
        ...cmExtensions
      ]
    })
  });

  api = {
    getDocument() {
      return view.state.doc.toString();
    },
    getAst() {
      return currentAst;
    },
    getSlashCommands() {
      return slashCommands;
    },
    uploadAsset(file) {
      if (destroyed || !config.onAssetUpload) {
        return Promise.resolve(null);
      }

      return config.onAssetUpload(file);
    },
    setSelection(anchor, head = anchor) {
      if (destroyed) {
        return;
      }

      view.dispatch({
        selection: { anchor, head }
      });
    },
    setDocument(next) {
      if (destroyed) {
        return;
      }

      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: next
        }
      });
    },
    focus() {
      if (destroyed) {
        return;
      }

      view.focus();
      setFocused(true);
    },
    blur() {
      if (destroyed) {
        return;
      }

      view.contentDOM.blur();
      setFocused(false);
    },
    runShortcut(key) {
      if (destroyed) {
        return false;
      }

      const shortcut = shortcuts.find((entry) => entry.key === key);
      return shortcut ? shortcut.run(api) : false;
    },
    on(event, handler) {
      emitter.on(event, handler);
    },
    off(event, handler) {
      emitter.off(event, handler);
    },
    getCoordsAtPos(pos) {
      if (destroyed) return null;
      try {
        return view.coordsAtPos(pos);
      } catch {
        return null;
      }
    },
    destroy() {
      destroyed = true;
      focused = false;
      if (parseTimer) {
        clearTimeout(parseTimer);
        parseTimer = undefined;
      }
      emitter.clear();
      view.destroy();
    }
  };

  return api;
}
