# Tasks: Add missing features

## Phase 1: P0 — Editing Experience Basics

- [ ] 1.1 Fix nested inline formatting (`***bold italic***`, `**_mixed_**`)
  - Detect marker nesting depth from AST children instead of hardcoded lengths
  - Test with all nesting combinations

- [ ] 1.2 Add Ctrl+Click link opening in mark-based inline mode
  - Current mark decoration has no click handler
  - Add `mousedown` listener on mark-decorated link text
  - Open URL in new tab on Ctrl/Cmd+Click

- [ ] 1.3 Render footnotes `[^1]` / `[^1]: definition`
  - Add `footnoteReference` and `footnoteDefinition` to `LivePreviewNode`
  - Render reference as superscript number
  - Render definition as small text at bottom
  - Requires `remark-gfm` (already parsed)

- [ ] 1.4 Render GFM autolinks as clickable links
  - Detect `autolink` node type from remark-gfm AST
  - Apply same link styling as `[text](url)` nodes

- [ ] 1.5 Support indented code blocks (4-space indent)
  - Currently only fenced code blocks handled
  - Add `code` node detection for indented variant (no `lang` property)

## Phase 2: P1 — Advanced Editing

- [ ] 2.1 Markdown auto-continuation
  - On Enter in a list item: insert new `- ` / `1. ` prefix
  - On Enter in blockquote: insert `> ` prefix
  - On Enter on empty list item: remove marker (exit list)
  - Implement as CM6 `keymap` extension in core

- [ ] 2.2 Fold/unfold for headings
  - Click fold indicator to collapse content under heading until next same-or-higher level heading
  - CM6 `foldGutter()` integration with custom fold ranges based on heading AST

- [ ] 2.3 Fold/unfold for code blocks
  - Collapse code block body, show only language label
  - Unfold on click

- [ ] 2.4 List item drag reorder
  - Similar to table row drag: grip handles on list items
  - Custom mousedown/mousemove/mouseup (no HTML5 drag)
  - Swap underlying markdown lines on drop

- [ ] 2.5 Link hover preview
  - On mouse hover over rendered link: show tooltip with full URL
  - On mouse hover over image link: show small image thumbnail

## Phase 3: P2 — Ecosystem

- [ ] 3.1 Theme system
  - Define `NexusTheme` interface: colors, fonts, spacing, radius
  - Provide `lightTheme` and `darkTheme` presets
  - `EditorConfig.theme` property applies CM6 `EditorView.theme()` + CSS variables
  - Table widget, code block, inline formatting all read from theme variables
  - All hardcoded colors (`#f6f8fa`, `#eee`, `#aaa`, etc.) replaced with CSS variables

- [ ] 3.2 Internationalization framework
  - Extend `LivePreviewLabels` to cover all user-visible strings
  - Add labels for: context menu items, tooltips, fold buttons, placeholder text
  - Provide `en` and `zh` built-in locales
  - Export `NexusLocale` type

- [ ] 3.3 TOC extraction API
  - `editor.getTableOfContents(): TocEntry[]`
  - Each entry: `{ level, text, from, to }`
  - Derived from heading AST nodes

- [ ] 3.4 Markdown-to-HTML export
  - `editor.exportHTML(): string`
  - Uses `remark-rehype` + `rehype-stringify` pipeline
  - Includes syntax-highlighted code blocks

- [ ] 3.5 Mermaid diagram plugin (`@nexus/plugin-mermaid`)
  - Widget definition for `code` nodes with `lang === "mermaid"`
  - Render SVG via `mermaid.render()`
  - Show rendered diagram when cursor outside, raw text when inside

## Phase 4: P3 — Quality

- [ ] 4.1 Accessibility (a11y)
  - Table widget: add `role="grid"`, `aria-label`, `aria-selected` on cells
  - Code block: add `role="code"`, `aria-label` with language
  - Headings: ensure proper heading hierarchy for screen readers
  - Focus management: visible focus indicators, keyboard navigation

- [ ] 4.2 Performance benchmarks
  - Create benchmark suite: 1k, 5k, 10k, 50k line documents
  - Measure: initial parse time, decoration build time, keystroke latency
  - Target: <16ms keystroke latency for 10k lines

- [ ] 4.3 API documentation
  - JSDoc on all public types and functions
  - Generate docs with TypeDoc or similar
  - Publish to docs site or README

- [ ] 4.4 E2E tests
  - Playwright tests for Electron demo
  - Cover: typing, formatting shortcuts, table editing, code block editing
  - CI integration
