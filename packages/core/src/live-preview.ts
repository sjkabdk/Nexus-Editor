import { StateField, type Extension, type Range, type SelectionRange, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { Heading, List, Root, Table } from "mdast";

import { collectLivePreviewRanges, selectionIntersects } from "./live-preview-ranges";
import { renderLivePreviewNode } from "./live-preview-renderers";
import type {
  LivePreviewConfig,
  LivePreviewNodeType,
  LivePreviewRenderer,
  ParserLike
} from "./types";

interface NormalizedLivePreviewConfig {
  enabled: boolean;
  renderers: Partial<Record<LivePreviewNodeType, LivePreviewRenderer>>;
}

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

function normalizeConfig(
  config: boolean | LivePreviewConfig | undefined
): NormalizedLivePreviewConfig {
  if (!config) {
    return {
      enabled: false,
      renderers: {}
    };
  }

  if (config === true) {
    return {
      enabled: true,
      renderers: {}
    };
  }

  return {
    enabled: config.enabled ?? true,
    renderers: config.renderers ?? {}
  };
}

function createWidget(element: HTMLElement, swallowEvents = false): WidgetType {
  return new (class extends WidgetType {
    toDOM() {
      return element;
    }

    ignoreEvent() {
      return swallowEvents;
    }
  })();
}

const BLOCK_NODE_TYPES = new Set(["blockquote", "code", "thematicBreak"]);

// Module-level flag: how many table cells are currently focused
let tableEditingCount = 0;

const HEADING_FONT_SIZE: Record<number, string> = {
  1: "1.6em",
  2: "1.4em",
  3: "1.2em",
  4: "1.1em",
  5: "1.05em",
  6: "1em"
};

function buildHeadingDecorations(
  range: { from: number; to: number; node: Heading },
  selection: readonly SelectionRange[],
  decos: Range<Decoration>[]
): void {
  const firstChild = range.node.children[0];
  const textStart = firstChild?.position?.start?.offset;

  if (typeof textStart === "number" && textStart > range.from && textStart <= range.to) {
    const fontSize = HEADING_FONT_SIZE[range.node.depth] ?? "1em";
    const cursorOnHeading = selectionIntersects(range.from, range.to, selection);

    if (cursorOnHeading) {
      decos.push(
        Decoration.mark({
          attributes: { style: `font-weight: bold; font-size: ${fontSize}; color: #aaa` }
        }).range(range.from, textStart)
      );
    } else {
      decos.push(Decoration.replace({}).range(range.from, textStart));
    }

    decos.push(
      Decoration.mark({
        attributes: {
          style: `font-weight: bold; font-size: ${fontSize}`,
          "data-heading-level": String(range.node.depth)
        }
      }).range(textStart, range.to)
    );
  }
}

function extractCellText(cell: any): string {
  if (!cell || !("children" in cell) || !Array.isArray(cell.children)) return "";
  return cell.children
    .map((c: any) => {
      if ("value" in c && typeof c.value === "string") return c.value;
      if ("children" in c && Array.isArray(c.children)) {
        return c.children.map((n: any) => ("value" in n ? n.value : "")).join("");
      }
      return "";
    })
    .join("");
}

class EditableTableWidget extends WidgetType {
  private editing = false;

  constructor(
    private node: Table,
    private tableFrom: number,
    private source: string,
    private viewRef: { current: EditorView | null }
  ) {
    super();
  }

  eq(other: EditableTableWidget): boolean {
    // While a cell is being edited, keep the existing DOM to preserve focus
    if (this.editing) return true;
    return this.source === other.source;
  }

  ignoreEvent(): boolean {
    return true;
  }

  private addColumn(): void {
    const v = this.viewRef.current;
    if (!v) return;
    const lines = this.source.split("\n");
    const newLines = lines.map((line) => {
      if (SEPARATOR_RE.test(line)) return line.replace(/\|?\s*$/, " | --- |");
      return line.replace(/\|?\s*$/, " |  |");
    });
    const tableEnd = this.tableFrom + this.source.length;
    v.dispatch({ changes: { from: this.tableFrom, to: tableEnd, insert: newLines.join("\n") } });
  }

  private addRow(): void {
    const v = this.viewRef.current;
    if (!v) return;
    const colCount = (this.node.children?.[0] as any)?.children?.length ?? 2;
    const cells = Array(colCount).fill("  ");
    const newRow = "\n| " + cells.join(" | ") + " |";
    const tableEnd = this.tableFrom + this.source.length;
    v.dispatch({ changes: { from: tableEnd, insert: newRow } });
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.display = "inline-block";
    wrapper.style.position = "relative";

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.display = "table";

    const rows = this.node.children ?? [];
    if (rows.length === 0) return wrapper;

    const sourceLines = this.source.split("\n");
    const dataLineIndices: number[] = [];
    for (let i = 0; i < sourceLines.length; i++) {
      if (!SEPARATOR_RE.test(sourceLines[i])) {
        dataLineIndices.push(i);
      }
    }

    const self = this;
    let rowIdx = 0;
    for (const astRow of rows) {
      const isHeader = rowIdx === 0;
      const tr = document.createElement("tr");
      const astCells = "children" in astRow && Array.isArray(astRow.children) ? astRow.children : [];
      const sourceLineIdx = dataLineIndices[rowIdx];

      for (let colIdx = 0; colIdx < astCells.length; colIdx++) {
        const td = document.createElement(isHeader ? "th" : "td");
        td.contentEditable = "true";
        td.textContent = extractCellText(astCells[colIdx]);
        td.style.border = "1px solid #ddd";
        td.style.padding = "6px 10px";
        td.style.textAlign = "left";
        td.style.outline = "none";
        td.style.minWidth = "40px";
        if (isHeader) {
          td.style.fontWeight = "bold";
          td.style.background = "#f6f8fa";
        }

        td.addEventListener("focus", () => { self.editing = true; tableEditingCount++; });
        td.addEventListener("blur", () => { self.editing = false; tableEditingCount--; });

        td.addEventListener("input", () => {
          const v = self.viewRef.current;
          if (!v || sourceLineIdx === undefined) return;

          const cellEls = tr.querySelectorAll("th, td");
          const cellValues: string[] = [];
          cellEls.forEach((el) => cellValues.push(el.textContent ?? ""));

          const newLine = "| " + cellValues.join(" | ") + " |";

          let lineOffset = self.tableFrom;
          for (let i = 0; i < sourceLineIdx; i++) {
            lineOffset += sourceLines[i].length + 1;
          }
          const lineEnd = lineOffset + sourceLines[sourceLineIdx].length;
          sourceLines[sourceLineIdx] = newLine;

          v.dispatch({
            changes: { from: lineOffset, to: lineEnd, insert: newLine }
          });
        });

        td.addEventListener("keydown", (e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const allCells = table.querySelectorAll("th[contenteditable], td[contenteditable]");
            const idx = Array.from(allCells).indexOf(td);
            const next = e.shiftKey ? idx - 1 : idx + 1;
            if (next >= 0 && next < allCells.length) {
              (allCells[next] as HTMLElement).focus();
            }
          }
        });

        tr.appendChild(td);
      }
      table.appendChild(tr);
      rowIdx++;
    }

    wrapper.appendChild(table);

    // "+" button on the right — add column
    const addColBtn = document.createElement("button");
    addColBtn.textContent = "+";
    addColBtn.title = "在右侧新增列";
    addColBtn.style.cssText =
      "position:absolute;right:-24px;top:50%;transform:translateY(-50%);" +
      "width:20px;height:20px;border:1px solid #ddd;border-radius:50%;" +
      "background:#fff;cursor:pointer;font-size:14px;line-height:1;" +
      "display:flex;align-items:center;justify-content:center;color:#999;padding:0;";
    addColBtn.addEventListener("click", () => self.addColumn());
    wrapper.appendChild(addColBtn);

    // "+" button at the bottom — add row
    const addRowBtn = document.createElement("button");
    addRowBtn.textContent = "+";
    addRowBtn.title = "在下方新增行";
    addRowBtn.style.cssText =
      "display:flex;align-items:center;justify-content:center;" +
      "width:20px;height:20px;border:1px solid #ddd;border-radius:50%;" +
      "background:#fff;cursor:pointer;font-size:14px;line-height:1;" +
      "color:#999;margin:4px auto 0;padding:0;";
    addRowBtn.addEventListener("click", () => self.addRow());
    wrapper.appendChild(addRowBtn);

    return wrapper;
  }
}

const SEPARATOR_RE = /^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?\s*$/;

const LIST_MARKER_RE = /^(\s*)([-*+]|\d+[.)]) /;
const CHECKBOX_RE = /^\[([ xX])\] /;

function buildListDecorations(
  range: { from: number; to: number; node: List },
  doc: string,
  decos: Range<Decoration>[],
  viewRef: { current: EditorView | null }
): void {
  const source = doc.slice(range.from, range.to);
  const lines = source.split("\n");
  let offset = range.from;
  const isOrdered = range.node.ordered === true;
  let orderNum = range.node.start ?? 1;

  for (const line of lines) {
    const lineEnd = offset + line.length;
    const markerMatch = LIST_MARKER_RE.exec(line);

    if (markerMatch) {
      const indent = markerMatch[1];
      const markerStart = offset + indent.length;
      const markerEnd = offset + markerMatch[0].length;

      const bullet = document.createElement("span");
      if (isOrdered) {
        bullet.textContent = `${orderNum}. `;
        bullet.style.color = "#888";
        orderNum++;
      } else {
        bullet.textContent = "\u2022 ";
        bullet.style.color = "#888";
      }
      decos.push(
        Decoration.replace({ widget: createWidget(bullet) }).range(markerStart, markerEnd)
      );

      const afterMarker = line.slice(markerMatch[0].length);
      const checkMatch = CHECKBOX_RE.exec(afterMarker);
      if (checkMatch) {
        const checkStart = markerEnd;
        const checkEnd = markerEnd + checkMatch[0].length;
        const isChecked = checkMatch[1] !== " ";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isChecked;
        checkbox.style.marginRight = "4px";
        checkbox.style.verticalAlign = "middle";
        checkbox.style.cursor = "pointer";

        // Clicking toggles [ ] ↔ [x] in the document
        const toggleFrom = checkStart + 1; // position of ' ' or 'x' inside [_]
        checkbox.addEventListener("click", (e) => {
          e.preventDefault();
          const v = viewRef.current;
          if (!v) return;
          const newChar = isChecked ? " " : "x";
          v.dispatch({
            changes: { from: toggleFrom, to: toggleFrom + 1, insert: newChar }
          });
        });

        decos.push(
          Decoration.replace({ widget: createWidget(checkbox) }).range(checkStart, checkEnd)
        );

        if (isChecked && checkEnd < lineEnd) {
          decos.push(
            Decoration.mark({
              attributes: { style: "text-decoration: line-through; color: #999" }
            }).range(checkEnd, lineEnd)
          );
        }
      }
    }

    offset = lineEnd + 1;
  }
}

function buildTableDecorations(
  range: { from: number; to: number },
  doc: string,
  decos: Range<Decoration>[]
): void {
  const source = doc.slice(range.from, range.to);
  const lines = source.split("\n");
  let offset = range.from;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEnd = offset + line.length;

    if (SEPARATOR_RE.test(line)) {
      // Hide separator line entirely (collapse the preceding newline too)
      const hideFrom = offset > range.from ? offset - 1 : offset;
      decos.push(Decoration.replace({}).range(hideFrom, lineEnd));
      offset = lineEnd + 1;
      continue;
    }

    // Find pipe positions on this line
    const pipes: number[] = [];
    for (let j = 0; j < line.length; j++) {
      if (line[j] === "|") pipes.push(offset + j);
    }

    if (pipes.length >= 2) {
      // Hide leading pipe + space after it
      const firstPipe = pipes[0];
      const afterFirst = firstPipe + 1;
      if (line.trimStart().startsWith("|")) {
        decos.push(Decoration.replace({}).range(firstPipe, afterFirst));
      }

      // Hide trailing pipe + space before it
      const lastPipe = pipes[pipes.length - 1];
      if (line.trimEnd().endsWith("|")) {
        decos.push(Decoration.replace({}).range(lastPipe, lastPipe + 1));
      }

      // Dim middle pipes
      for (let j = 1; j < pipes.length - 1; j++) {
        decos.push(
          Decoration.mark({
            attributes: { style: "color: #ccc" }
          }).range(pipes[j], pipes[j] + 1)
        );
      }
    }

    // Bold header row (first non-separator line)
    if (i === 0) {
      decos.push(
        Decoration.mark({
          attributes: { style: "font-weight: bold" }
        }).range(offset, lineEnd)
      );
    }

    offset = lineEnd + 1;
  }
}

function buildDecorations(
  doc: string,
  selection: readonly SelectionRange[],
  parser: ParserLike,
  config: NormalizedLivePreviewConfig,
  viewRef: { current: EditorView | null }
): DecorationSet {
  if (!config.enabled) {
    return Decoration.none;
  }

  const ast = parseDocument(parser, doc);
  const ranges = collectLivePreviewRanges(ast, doc, selection);
  const decos: Range<Decoration>[] = [];

  const parentSpans: [number, number][] = [];

  for (const range of ranges) {
    if (parentSpans.some(([from, to]) => range.from >= from && range.to <= to)) {
      continue;
    }

    if (range.node.type === "heading" && !config.renderers.heading) {
      buildHeadingDecorations(
        range as { from: number; to: number; node: Heading },
        selection,
        decos
      );
    } else if (range.node.type === "table" && !config.renderers.table) {
      decos.push(
        Decoration.replace({
          widget: new EditableTableWidget(
            range.node as Table,
            range.from,
            range.source,
            viewRef
          ),
          block: true
        }).range(range.from, range.to)
      );
    } else if (range.node.type === "list") {
      buildListDecorations(
        range as { from: number; to: number; node: List },
        doc,
        decos,
        viewRef
      );
    } else if (range.node.type === "image") {
      const cursorOnImage = selectionIntersects(range.from, range.to, selection);

      if (cursorOnImage) {
        // Cursor on image: dim the ![alt](url) syntax, show image preview below
        decos.push(
          Decoration.mark({
            attributes: { style: "color: #aaa" }
          }).range(range.from, range.to)
        );
        const preview = document.createElement("span");
        const img = document.createElement("img");
        img.src = range.node.url;
        img.alt = range.node.alt ?? "";
        img.referrerPolicy = "no-referrer";
        img.style.display = "block";
        img.style.maxWidth = "100%";
        preview.appendChild(img);
        decos.push(
          Decoration.widget({
            widget: createWidget(preview),
            side: 1
          }).range(range.to)
        );
      } else {
        // Cursor away: use standard widget replacement
        decos.push(
          Decoration.replace({
            widget: createWidget(renderLivePreviewNode(range.node, range.source, config.renderers))
          }).range(range.from, range.to)
        );
      }
    } else {
      if (range.node.type === "heading" || range.node.type === "table" || range.node.type === "list") {
        parentSpans.push([range.from, range.to]);
      }

      const isBlock = BLOCK_NODE_TYPES.has(range.node.type);
      decos.push(
        Decoration.replace({
          widget: createWidget(
            renderLivePreviewNode(range.node, range.source, config.renderers),
            isBlock
          ),
          block: isBlock
        }).range(range.from, range.to)
      );
    }
  }

  return Decoration.set(decos, true);
}

export function createLivePreviewExtension(
  parser: ParserLike,
  config: boolean | LivePreviewConfig | undefined
): Extension[] {
  const normalized = normalizeConfig(config);

  if (!normalized.enabled) {
    return [];
  }

  const viewRef: { current: EditorView | null } = { current: null };

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(
        state.doc.toString(),
        state.selection.ranges,
        parser,
        normalized,
        viewRef
      );
    },
    update(decos: DecorationSet, tr: Transaction) {
      if (tr.docChanged && tableEditingCount > 0) {
        // A table cell is being edited — remap positions instead of
        // rebuilding, so the widget DOM (and focus) is preserved.
        return decos.map(tr.changes);
      }
      if (tr.docChanged || tr.selection) {
        return buildDecorations(
          tr.state.doc.toString(),
          tr.state.selection.ranges,
          parser,
          normalized,
          viewRef
        );
      }
      return decos;
    },
    provide(field) {
      return EditorView.decorations.from(field);
    }
  });

  // ViewPlugin to capture the EditorView reference for checkbox interactions
  const viewCapture = EditorView.updateListener.of((update) => {
    viewRef.current = update.view;
  });

  return [field, viewCapture];
}
