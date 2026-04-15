import type { Root } from "mdast";
import type { Plugin } from "unified";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index";

describe("createEditor", () => {
  it("creates an editor with the initial document", () => {
    const container = document.createElement("div");
    const editor = createEditor({ container, initialValue: "# Hello" });

    expect(editor.getDocument()).toBe("# Hello");
    editor.destroy();
  });

  it("emits change, focus, and blur hooks with canonical document values", () => {
    const container = document.createElement("div");
    const events: string[] = [];
    const docs: string[] = [];
    const editor = createEditor({
      container,
      initialValue: "start",
      onChange(doc) {
        docs.push(doc);
      },
      onFocus() {
        events.push("focus");
      },
      onBlur() {
        events.push("blur");
      }
    });

    editor.focus();
    editor.setDocument("next");
    editor.blur();

    expect(editor.getDocument()).toBe("next");
    expect(docs).toEqual(["next"]);
    expect(events).toEqual(["focus", "blur"]);
    editor.destroy();
  });

  it("emits a parsed AST for the current markdown document", () => {
    const container = document.createElement("div");
    const nodeTypes: string[] = [];
    const editor = createEditor({
      container,
      onChange(_doc, ast) {
        nodeTypes.push(ast.type);
        nodeTypes.push(ast.children[0]?.type ?? "missing");
      }
    });

    editor.setDocument("# Heading");

    expect(nodeTypes).toEqual(["root", "heading"]);
    editor.destroy();
  });

  it("keeps the editor usable when the parser throws", () => {
    const container = document.createElement("div");
    const docs: string[] = [];
    const editor = createEditor({
      container,
      parser: {
        parse() {
          throw new Error("boom");
        }
      },
      onChange(doc) {
        docs.push(doc);
      }
    });

    editor.setDocument("after failure");

    expect(editor.getDocument()).toBe("after failure");
    expect(docs).toEqual(["after failure"]);
    editor.destroy();
  });

  it("composes remark and shortcut plugin contributions", () => {
    const container = document.createElement("div");
    let nodeTypes: string[] = [];
    let shortcutResult = false;
    const appendParagraph: Plugin<[], Root, Root> = function () {
      return (tree) => {
        tree.children.push({
          type: "paragraph",
          children: [{ type: "text", value: "plugin" }]
        });
      };
    };
    const editor = createEditor({
      container,
      plugins: [
        {
          name: "remark-transform",
          remarkPlugins: [appendParagraph]
        },
        {
          name: "shortcut",
          shortcuts: [
            {
              key: "Mod-k",
              run(api) {
                api.setDocument("shortcut-ran");
                shortcutResult = true;
                return true;
              }
            }
          ]
        }
      ],
      onChange(_doc, ast) {
        nodeTypes = ast.children.map((child: { type: string }) => child.type);
      }
    });

    editor.setDocument("# Heading");

    expect(nodeTypes).toEqual(["heading", "paragraph"]);
    expect(editor.runShortcut("Mod-k")).toBe(true);
    expect(shortcutResult).toBe(true);
    expect(editor.getDocument()).toBe("shortcut-ran");
    editor.destroy();
  });
});
