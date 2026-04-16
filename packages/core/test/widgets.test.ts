import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index";

describe("widget extension", () => {
  it("renders a widget for a matching AST node type", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n```js\nconsole.log(1)\n```",
      plugins: [
        {
          name: "code-widget",
          widgets: [
            {
              nodeType: "code",
              render(node, source) {
                const el = document.createElement("div");
                el.setAttribute("data-widget", "code");
                el.textContent = source;
                return el;
              },
            },
          ],
        },
      ],
    });

    expect(
      container.querySelector("[data-widget='code']")
    ).not.toBeNull();
    editor.destroy();
  });

  it("restores raw markdown when cursor intersects the widget range", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n```js\nconsole.log(1)\n```",
      plugins: [
        {
          name: "code-widget",
          widgets: [
            {
              nodeType: "code",
              render() {
                const el = document.createElement("div");
                el.setAttribute("data-widget", "code");
                return el;
              },
            },
          ],
        },
      ],
    });

    expect(container.querySelector("[data-widget='code']")).not.toBeNull();

    // Move cursor inside the code block
    editor.setSelection(10);

    expect(container.querySelector("[data-widget='code']")).toBeNull();
    expect(container.textContent).toContain("```js");
    editor.destroy();
  });

  it("uses the match predicate to refine node matching", () => {
    const container = document.createElement("div");
    // Prefix with "Text\n\n" so cursor at 0 doesn't intersect the code blocks
    const editor = createEditor({
      container,
      initialValue:
        "Text\n\n```mermaid\ngraph LR\n```\n\n```js\nconsole.log(1)\n```",
      plugins: [
        {
          name: "mermaid-widget",
          widgets: [
            {
              nodeType: "code",
              match: (node: any) => node.lang === "mermaid",
              render() {
                const el = document.createElement("div");
                el.setAttribute("data-widget", "mermaid");
                return el;
              },
            },
          ],
        },
      ],
    });

    expect(container.querySelector("[data-widget='mermaid']")).not.toBeNull();
    // The js code block should NOT be widget-rendered
    expect(container.textContent).toContain("console.log(1)");
    editor.destroy();
  });

  it("calls destroy callback when widget is removed", () => {
    const destroyFn = vi.fn();
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n```js\ncode\n```",
      plugins: [
        {
          name: "code-widget",
          widgets: [
            {
              nodeType: "code",
              render() {
                const el = document.createElement("div");
                el.setAttribute("data-widget", "code");
                return el;
              },
              destroy: destroyFn,
            },
          ],
        },
      ],
    });

    expect(container.querySelector("[data-widget='code']")).not.toBeNull();

    // Moving cursor into the code block triggers re-render, destroying the old widget
    editor.setSelection(10);

    expect(destroyFn).toHaveBeenCalled();
    editor.destroy();
  });

  it("composes widgets from multiple plugins", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n```js\ncode\n```\n\n---",
      plugins: [
        {
          name: "code-widget",
          widgets: [
            {
              nodeType: "code",
              render() {
                const el = document.createElement("div");
                el.setAttribute("data-widget", "code");
                return el;
              },
            },
          ],
        },
        {
          name: "break-widget",
          widgets: [
            {
              nodeType: "thematicBreak",
              render() {
                const el = document.createElement("hr");
                el.setAttribute("data-widget", "hr");
                return el;
              },
            },
          ],
        },
      ],
    });

    expect(container.querySelector("[data-widget='code']")).not.toBeNull();
    expect(container.querySelector("[data-widget='hr']")).not.toBeNull();
    editor.destroy();
  });

  it("coexists with live preview without overlap", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text **bold**",
      livePreview: true,
      plugins: [
        {
          name: "noop-widget",
          widgets: [
            {
              nodeType: "definition",
              render() {
                return document.createElement("div");
              },
            },
          ],
        },
      ],
    });

    // Live preview still renders bold when widget extension is active
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    editor.destroy();
  });

  it("produces no extensions when no widgets are registered", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text **bold**",
      livePreview: true,
    });

    expect(container.querySelector("strong")?.textContent).toBe("bold");
    editor.destroy();
  });
});
