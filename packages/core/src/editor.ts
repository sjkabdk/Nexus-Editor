import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { EditorAPI, EditorConfig, NexusPlugin, ParserLike } from "./types";

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
  const cmExtensions = plugins.flatMap((plugin) => plugin.cmExtensions ?? []);
  const view = new EditorView({
    parent: config.container,
    state: EditorState.create({
      doc: config.initialValue ?? "",
      extensions: cmExtensions
    })
  });

  const api: EditorAPI = {
    getDocument() {
      return view.state.doc.toString();
    },
    setDocument(next) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: next
        }
      });
      config.onChange?.(
        view.state.doc.toString(),
        parseDocument(parser, view.state.doc.toString())
      );
    },
    focus() {
      view.focus();
      config.onFocus?.();
    },
    blur() {
      view.contentDOM.blur();
      config.onBlur?.();
    },
    runShortcut(key) {
      const shortcut = shortcuts.find((entry) => entry.key === key);
      return shortcut ? shortcut.run(api) : false;
    },
    destroy() {
      view.destroy();
    }
  };

  return api;
}
