import { describe, expect, it } from "vitest";

import { createGfmPreset } from "../../preset-gfm/src/index";
import { createEditor } from "../src/index";

describe("live preview", () => {
  // ── Inline formatting ──
  // Note: inline markers are hidden when cursor is on a DIFFERENT line (line-level detection).
  // Tests use multi-line content with cursor moved to a separate line.

  it("hides markers and shows styled text for inline formatting", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text **bold** *italic* `code` [link](https://example.com)\n\nend",
      livePreview: true
    });

    // Move cursor to a different line
    editor.setSelection(editor.getDocument().length);

    const text = container.textContent ?? "";
    expect(text).toContain("bold");
    expect(text).toContain("italic");
    expect(text).toContain("code");
    expect(text).toContain("link");
    // Markers hidden (replaced)
    expect(text).not.toContain("**");
    expect(container.querySelector("[data-link-url]")).not.toBeNull();
    editor.destroy();
  });

  it("restores raw markdown when cursor enters the same line", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text **bold**\n\nend",
      livePreview: true
    });

    // Cursor on different line → markers hidden
    editor.setSelection(editor.getDocument().length);
    expect(container.textContent).not.toContain("**");

    // Cursor on same line → markers visible
    editor.setSelection(8);
    expect(container.textContent).toContain("**bold**");
    editor.destroy();
  });

  it("hides strikethrough markers when GFM is enabled", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text ~~deleted~~\n\nend",
      livePreview: true,
      plugins: [createGfmPreset()]
    });

    editor.setSelection(editor.getDocument().length);

    const text = container.textContent ?? "";
    expect(text).toContain("deleted");
    expect(text).not.toContain("~~");
    editor.destroy();
  });

  it("re-renders inline formatting after document updates", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text **bold**\n\nend",
      livePreview: true
    });

    editor.setDocument("Text **changed**\n\nend");
    editor.setSelection(editor.getDocument().length);

    const text = container.textContent ?? "";
    expect(text).toContain("changed");
    expect(text).not.toContain("**");
    editor.destroy();
  });

  // ── Nested inline formatting ──

  it("renders nested bold+italic with combined styles", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text ***bold italic***\n\nend",
      livePreview: true
    });

    editor.setSelection(editor.getDocument().length);

    const text = container.textContent ?? "";
    expect(text).toContain("bold italic");
    expect(text).not.toContain("***");
    expect(text).not.toContain("**");
    editor.destroy();
  });

  it("renders mixed marker nesting **_text_** with both styles", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text **_mixed_**\n\nend",
      livePreview: true
    });

    editor.setSelection(editor.getDocument().length);

    const text = container.textContent ?? "";
    expect(text).toContain("mixed");
    expect(text).not.toContain("**");
    expect(text).not.toContain("_");
    editor.destroy();
  });

  // ── Link Ctrl+Click ──

  it("adds data-link-url attribute to mark-decorated links", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Click [here](https://example.com)\n\nend",
      livePreview: true
    });

    editor.setSelection(editor.getDocument().length);

    const linkEl = container.querySelector("[data-link-url]");
    expect(linkEl).not.toBeNull();
    expect(linkEl?.getAttribute("data-link-url")).toBe("https://example.com");
    editor.destroy();
  });

  it("renders links inside ordered lists correctly", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "## 目录\n\n1. [项目概述](#项目概述)\n2. [快速开始](#快速开始)\n3. [主要功能](#主要功能)\n\nend",
      livePreview: true
    });

    editor.setSelection(editor.getDocument().length);

    const links = container.querySelectorAll("[data-link-url]");
    expect(links.length).toBe(3);
    expect(links[0].textContent).toBe("项目概述");
    expect(links[1].textContent).toBe("快速开始");
    expect(links[2].textContent).toBe("主要功能");
    editor.destroy();
  });

  it("hides link markers visually and adds data-link-url", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Click [here](https://example.com) now\n\nend",
      livePreview: true
    });

    editor.setSelection(editor.getDocument().length);

    const linkEl = container.querySelector("[data-link-url]");
    expect(linkEl).not.toBeNull();
    expect(linkEl?.textContent).toBe("here");
    expect(linkEl?.getAttribute("data-link-url")).toBe("https://example.com");
    editor.destroy();
  });

  // ── Headings ──

  it("renders headings with bold text and heading level attribute", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Intro\n\n# Heading",
      livePreview: true
    });

    expect(container.querySelector("[data-heading-level='1']")?.textContent).toBe("Heading");
    editor.destroy();
  });

  // ── Block elements ──

  it("renders blockquotes and images as block previews", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Intro\n\n> Quote\n\n![Alt](https://example.com/image.png)",
      livePreview: true
    });

    expect(container.querySelector("blockquote")?.textContent).toBe("Quote");
    expect(container.querySelector("[data-live-preview-image]")?.getAttribute("data-live-preview-image")).toBe(
      "https://example.com/image.png"
    );
    editor.destroy();
  });

  it("renders thematic break as hr element", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n---\n\nMore",
      livePreview: true
    });

    expect(container.querySelector("hr")).not.toBeNull();
    editor.destroy();
  });

  // ── Code blocks ──

  it("renders code blocks with syntax highlighting and language label", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n```js\nconsole.log(1)\n```",
      livePreview: true
    });

    expect(container.textContent).toContain("console.log(1)");
    // Code block has role=code and aria-label with language
    const codeLine = container.querySelector("[role='code']");
    expect(codeLine?.getAttribute("aria-label")).toBe("Code block: js");
    editor.destroy();
  });

  it("shows fence lines when cursor enters code block", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n```js\nconsole.log(1)\n```",
      livePreview: true
    });

    const textBefore = container.textContent ?? "";
    expect(textBefore).toContain("console.log(1)");

    editor.setSelection(12);

    const textAfter = container.textContent ?? "";
    expect(textAfter).toContain("```js");
    expect(textAfter).toContain("console.log(1)");
    editor.destroy();
  });

  it("applies code block background to all content lines", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n```py\nx = 1\ny = 2\n```",
      livePreview: true
    });

    const codeLines = Array.from(container.querySelectorAll(".cm-line")).filter(
      (line) => (line as HTMLElement).style.background === "rgb(246, 248, 250)"
        || (line as HTMLElement).getAttribute("style")?.includes("background")
    );
    expect(codeLines.length).toBeGreaterThanOrEqual(2);
    editor.destroy();
  });

  // ── Indented code blocks ──

  it("renders indented code blocks with background styling", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n    indented code\n    second line",
      livePreview: true
    });

    const text = container.textContent ?? "";
    expect(text).toContain("indented code");
    expect(text).toContain("second line");
    const codeLines = Array.from(container.querySelectorAll(".cm-line")).filter(
      (line) => (line as HTMLElement).getAttribute("style")?.includes("monospace")
    );
    expect(codeLines.length).toBeGreaterThanOrEqual(2);
    editor.destroy();
  });

  // ── Footnotes ──

  it("renders footnote references as superscript when GFM is enabled", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text with footnote[^1]\n\n[^1]: Definition text",
      livePreview: true,
      plugins: [createGfmPreset()]
    });

    const sup = container.querySelector("sup");
    expect(sup).not.toBeNull();
    expect(sup?.textContent).toBe("1");
    editor.destroy();
  });

  // ── Autolinks ──

  it("renders GFM autolinks as styled links", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Visit https://example.com today\n\nend",
      livePreview: true,
      plugins: [createGfmPreset()]
    });

    editor.setSelection(editor.getDocument().length);

    const linkEl = container.querySelector("[data-link-url]");
    expect(linkEl).not.toBeNull();
    expect(linkEl?.getAttribute("data-link-url")).toBe("https://example.com");
    editor.destroy();
  });

  // ── Tables ──

  it("renders tables as editable widget with grip cells", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Text\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
      livePreview: true,
      plugins: [createGfmPreset()]
    });

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const ths = table?.querySelectorAll("th");
    expect(ths!.length).toBeGreaterThanOrEqual(3);
    expect(ths![1]?.textContent).toBe("A");
    expect(ths![1]?.classList.contains("nexus-cell")).toBe(true);
    editor.destroy();
  });

  // ── Custom renderers ──

  it("allows host renderers to override default node rendering", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "Intro\n\n# Heading",
      livePreview: {
        renderers: {
          heading({ text }) {
            const element = document.createElement("div");
            element.setAttribute("data-heading", "custom");
            element.textContent = text.toUpperCase();
            return element;
          }
        }
      }
    });

    expect(container.querySelector("[data-heading='custom']")?.textContent).toBe("HEADING");
    editor.destroy();
  });

  it("passes the raw markdown source into custom renderers", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "end\n\nText **bold**",
      livePreview: {
        renderers: {
          strong({ source }) {
            const element = document.createElement("span");
            element.setAttribute("data-source", source);
            return element;
          }
        }
      }
    });

    // Cursor on first line, away from the bold
    editor.setSelection(0);

    expect(container.querySelector("[data-source]")?.getAttribute("data-source")).toBe("**bold**");
    editor.destroy();
  });

  it("uses default mark decoration for node types without custom renderer", () => {
    const container = document.createElement("div");
    const editor = createEditor({
      container,
      initialValue: "end\n\nText **bold** *italic*",
      livePreview: {
        renderers: {
          strong({ text }) {
            const element = document.createElement("span");
            element.textContent = text.toUpperCase();
            return element;
          }
        }
      }
    });

    editor.setSelection(0);

    // Custom renderer for strong
    expect(container.querySelector("span")?.textContent).toBe("BOLD");
    // Default mark decoration for italic — markers replaced
    const text = container.textContent ?? "";
    expect(text).toContain("italic");
    expect(text).not.toContain("*italic*");
    editor.destroy();
  });
});
