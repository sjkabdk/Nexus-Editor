import { StateField, type Extension, type Range, type SelectionRange, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { Heading, List, Root, Table } from "mdast";

import { collectLivePreviewRanges, selectionIntersects } from "./live-preview-ranges";
import { renderLivePreviewNode } from "./live-preview-renderers";
import { EditableTableWidget, isTableEditing } from "./live-preview-table";
import type {
  LivePreviewConfig,
  LivePreviewLabels,
  LivePreviewNodeType,
  LivePreviewRenderer,
  ParserLike
} from "./types";

interface NormalizedLivePreviewConfig {
  enabled: boolean;
  renderers: Partial<Record<LivePreviewNodeType, LivePreviewRenderer>>;
  labels: Required<LivePreviewLabels>;
}

const DEFAULT_LABELS: Required<LivePreviewLabels> = {
  addColumn: "Add column",
  addRow: "Add row",
};

function createEmptyAst(): Root {
  return { type: "root", children: [] };
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
    return { enabled: false, renderers: {}, labels: DEFAULT_LABELS };
  }
  if (config === true) {
    return { enabled: true, renderers: {}, labels: DEFAULT_LABELS };
  }
  return {
    enabled: config.enabled ?? true,
    renderers: config.renderers ?? {},
    labels: { ...DEFAULT_LABELS, ...config.labels }
  };
}

function createWidget(element: HTMLElement, swallowEvents = false): WidgetType {
  return new (class extends WidgetType {
    toDOM() { return element; }
    ignoreEvent() { return swallowEvents; }
  })();
}

const BLOCK_NODE_TYPES = new Set(["blockquote", "code", "thematicBreak"]);

const HEADING_FONT_SIZE: Record<number, string> = {
  1: "1.6em", 2: "1.4em", 3: "1.2em", 4: "1.1em", 5: "1.05em", 6: "1em"
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

        const toggleFrom = checkStart + 1;
        checkbox.addEventListener("click", (e) => {
          e.preventDefault();
          const v = viewRef.current;
          if (!v) return;
          v.dispatch({
            changes: { from: toggleFrom, to: toggleFrom + 1, insert: isChecked ? " " : "x" }
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

function buildDecorations(
  doc: string,
  selection: readonly SelectionRange[],
  parser: ParserLike,
  config: NormalizedLivePreviewConfig,
  viewRef: { current: EditorView | null }
): DecorationSet {
  if (!config.enabled) return Decoration.none;

  const ast = parseDocument(parser, doc);
  const ranges = collectLivePreviewRanges(ast, doc, selection);
  const decos: Range<Decoration>[] = [];
  const parentSpans: [number, number][] = [];

  for (const range of ranges) {
    if (parentSpans.some(([from, to]) => range.from >= from && range.to <= to)) continue;

    if (range.node.type === "heading" && !config.renderers.heading) {
      buildHeadingDecorations(range as { from: number; to: number; node: Heading }, selection, decos);
    } else if (range.node.type === "table" && !config.renderers.table) {
      decos.push(
        Decoration.replace({
          widget: new EditableTableWidget(
            range.node as Table, range.from, range.source, viewRef, config.labels
          ),
          block: true
        }).range(range.from, range.to)
      );
    } else if (range.node.type === "list") {
      buildListDecorations(range as { from: number; to: number; node: List }, doc, decos, viewRef);
    } else if (range.node.type === "image") {
      const cursorOnImage = selectionIntersects(range.from, range.to, selection);
      if (cursorOnImage) {
        decos.push(Decoration.mark({ attributes: { style: "color: #aaa" } }).range(range.from, range.to));
        const preview = document.createElement("span");
        const img = document.createElement("img");
        img.src = range.node.url;
        img.alt = range.node.alt ?? "";
        img.referrerPolicy = "no-referrer";
        img.style.display = "block";
        img.style.maxWidth = "100%";
        preview.appendChild(img);
        decos.push(Decoration.widget({ widget: createWidget(preview), side: 1 }).range(range.to));
      } else {
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
          widget: createWidget(renderLivePreviewNode(range.node, range.source, config.renderers), isBlock),
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
  if (!normalized.enabled) return [];

  const viewRef: { current: EditorView | null } = { current: null };

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state.doc.toString(), state.selection.ranges, parser, normalized, viewRef);
    },
    update(decos: DecorationSet, tr: Transaction) {
      if (tr.docChanged && isTableEditing()) {
        return decos.map(tr.changes);
      }
      if (tr.docChanged || tr.selection) {
        return buildDecorations(tr.state.doc.toString(), tr.state.selection.ranges, parser, normalized, viewRef);
      }
      return decos;
    },
    provide(field) {
      return EditorView.decorations.from(field);
    }
  });

  const viewCapture = EditorView.updateListener.of((update) => {
    viewRef.current = update.view;
  });

  return [field, viewCapture];
}
