# Nexus-Editor

A headless Markdown editor engine built on [CodeMirror 6](https://codemirror.net/) and the [unified](https://unifiedjs.com/) ecosystem. Framework-agnostic core with official React and Vue bindings.

[中文文档](./README.zh.md)

## Features

- **Headless** — no built-in UI. Render with any framework or plain DOM.
- **AST-Driven** — real-time Markdown → mdast parsing with every keystroke.
- **Live Preview** — inline rendering that reveals raw syntax on cursor focus (Obsidian-style).
- **Plugin System** — three tiers: shortcuts & slash commands, remark plugins & widgets, raw CM6 extensions.
- **Event System** — subscribe to `change`, `focus`, `blur`, `selectionChange`, `slashMenuChange`.
- **Widget API** — render custom components for any AST node type (code blocks, tables, diagrams).
- **Local-First** — built for Electron/Tauri with file IO hooks and debounced parsing.

## Packages

| Package | Description |
|---|---|
| `@nexus/core` | Editor engine — CM6 state, AST pipeline, live preview, events, widget API |
| `@nexus/react` | React binding — `useEditor` hook and `<Editor />` component |
| `@nexus/vue` | Vue 3 binding — `useEditor` composable |
| `@nexus/preset-gfm` | GitHub Flavored Markdown preset (tables, strikethrough, task lists) |
| `@nexus/plugin-history` | Undo/redo with `Ctrl+Z` / `Ctrl+Shift+Z` |
| `@nexus/plugin-search` | Search and replace helpers |
| `@nexus/plugin-slash` | Slash command detection and filtering |

## Quick Start

### Vanilla (Plain DOM)

```ts
import { createEditor } from "@nexus/core";
import { createGfmPreset } from "@nexus/preset-gfm";
import { createHistoryPlugin } from "@nexus/plugin-history";

const editor = createEditor({
  container: document.getElementById("editor")!,
  initialValue: "# Hello\n\nStart typing...",
  plugins: [createGfmPreset(), createHistoryPlugin()],
  livePreview: true,
  onChange(doc, ast) {
    console.log("Markdown:", doc);
    console.log("AST:", ast);
  },
});
```

### React

```tsx
import { Editor } from "@nexus/react";
import { createGfmPreset } from "@nexus/preset-gfm";

function App() {
  return (
    <Editor
      initialValue="# Hello"
      plugins={[createGfmPreset()]}
      livePreview
      onChange={(doc, ast) => console.log(doc)}
    />
  );
}
```

### Vue

```vue
<script setup>
import { Editor } from "@nexus/vue";
import { createGfmPreset } from "@nexus/preset-gfm";
</script>

<template>
  <Editor
    initial-value="# Hello"
    :plugins="[createGfmPreset()]"
    :live-preview="true"
    @change="(doc) => console.log(doc)"
  />
</template>
```

## Editor API

`createEditor(config)` returns an `EditorAPI` with:

```ts
editor.getDocument()          // current Markdown string
editor.getAst()               // current mdast Root
editor.setDocument(md)         // replace entire document
editor.setSelection(pos)       // move cursor
editor.focus() / editor.blur()
editor.destroy()

// Event system
editor.on("change", (doc, ast) => { ... })
editor.on("selectionChange", ({ anchor, head }) => { ... })
editor.on("slashMenuChange", ({ isOpen, query, commands, coords }) => { ... })
editor.off("change", handler)

// Coordinates (for floating UI)
editor.getCoordsAtPos(pos)     // { left, right, top, bottom } | null
```

## Plugin System

Plugins can hook into three tiers:

```ts
const myPlugin: NexusPlugin = {
  name: "my-plugin",

  // Tier 1: Shortcuts & slash commands
  shortcuts: [{ key: "Mod-b", run: (editor) => { /* toggle bold */ return true; } }],
  slashCommands: [{ id: "heading", title: "Heading", keywords: ["h1"] }],

  // Tier 2: AST & widgets
  remarkPlugins: [remarkMath],
  widgets: [{
    nodeType: "code",
    match: (node) => node.lang === "mermaid",
    render: (node, source) => renderMermaidChart(source),
    destroy: (el) => el.remove(),
  }],

  // Tier 3: Raw CM6
  cmExtensions: [myCodeMirrorExtension],
};
```

## Development

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # run all tests

# Electron demo
pnpm dev:electron-demo
```

## License

MIT
