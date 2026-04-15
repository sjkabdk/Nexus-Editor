# Nexus-Editor

基于 [CodeMirror 6](https://codemirror.net/) 和 [unified](https://unifiedjs.com/) 生态构建的 **无头 (Headless) Markdown 编辑器引擎**。框架无关的核心包，附带官方 React 和 Vue 绑定。

[English](./README.md)

## 特性

- **无头设计** — 不内置 UI 组件，完全由宿主框架控制渲染与样式。
- **语法树驱动** — 每次输入实时生成 mdast 抽象语法树。
- **实时预览** — 类 Obsidian 的内联渲染，光标聚焦时展开原始语法。
- **插件系统** — 三层架构：快捷键与斜杠命令、remark 插件与自定义 Widget、原生 CM6 扩展。
- **事件系统** — 订阅 `change`、`focus`、`blur`、`selectionChange`、`slashMenuChange` 事件。
- **Widget API** — 为任意 AST 节点类型（代码块、表格、图表等）渲染自定义组件。
- **本地优先** — 为 Electron/Tauri 场景设计，内置文件 IO 钩子与防抖解析。

## 包结构

| 包名 | 说明 |
|---|---|
| `@nexus/core` | 编辑器引擎 — CM6 状态机、AST 管道、实时预览、事件系统、Widget API |
| `@nexus/react` | React 绑定 — `useEditor` Hook 和 `<Editor />` 组件 |
| `@nexus/vue` | Vue 3 绑定 — `useEditor` 组合式函数 |
| `@nexus/preset-gfm` | GitHub Flavored Markdown 预设（表格、删除线、任务列表） |
| `@nexus/plugin-history` | 撤销/重做，支持 `Ctrl+Z` / `Ctrl+Shift+Z` |
| `@nexus/plugin-search` | 搜索替换辅助函数 |
| `@nexus/plugin-slash` | 斜杠命令检测与过滤 |

## 快速开始

### 原生 DOM

```ts
import { createEditor } from "@nexus/core";
import { createGfmPreset } from "@nexus/preset-gfm";
import { createHistoryPlugin } from "@nexus/plugin-history";

const editor = createEditor({
  container: document.getElementById("editor")!,
  initialValue: "# 你好\n\n开始编辑...",
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
      initialValue="# 你好"
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
    initial-value="# 你好"
    :plugins="[createGfmPreset()]"
    :live-preview="true"
    @change="(doc) => console.log(doc)"
  />
</template>
```

## 编辑器 API

`createEditor(config)` 返回 `EditorAPI`：

```ts
editor.getDocument()          // 当前 Markdown 文本
editor.getAst()               // 当前 mdast 语法树
editor.setDocument(md)         // 替换整个文档
editor.setSelection(pos)       // 移动光标
editor.focus() / editor.blur()
editor.destroy()

// 事件系统
editor.on("change", (doc, ast) => { ... })
editor.on("selectionChange", ({ anchor, head }) => { ... })
editor.on("slashMenuChange", ({ isOpen, query, commands, coords }) => { ... })
editor.off("change", handler)

// 坐标（用于浮动 UI 定位）
editor.getCoordsAtPos(pos)     // { left, right, top, bottom } | null
```

## 插件系统

插件可以接入三个层级：

```ts
const myPlugin: NexusPlugin = {
  name: "my-plugin",

  // 第一层：快捷键与斜杠命令
  shortcuts: [{ key: "Mod-b", run: (editor) => { /* 切换加粗 */ return true; } }],
  slashCommands: [{ id: "heading", title: "标题", keywords: ["h1"] }],

  // 第二层：AST 与 Widget
  remarkPlugins: [remarkMath],
  widgets: [{
    nodeType: "code",
    match: (node) => node.lang === "mermaid",
    render: (node, source) => renderMermaidChart(source),
    destroy: (el) => el.remove(),
  }],

  // 第三层：原生 CM6 扩展
  cmExtensions: [myCodeMirrorExtension],
};
```

## 开发

```bash
pnpm install
pnpm build          # 构建所有包
pnpm test           # 运行所有测试

# Electron 演示应用
pnpm dev:electron-demo
```

## 许可证

MIT
