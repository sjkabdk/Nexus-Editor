import {
  type Extension,
  type Range,
  type SelectionRange,
  StateField,
  type Transaction,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { Content, Parent, Root } from "mdast";

import type { ParserLike, WidgetDefinition } from "./types";

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

function selectionIntersects(
  from: number,
  to: number,
  selection: readonly SelectionRange[]
): boolean {
  return selection.some((range) => {
    const rangeFrom = Math.min(range.anchor, range.head);
    const rangeTo = Math.max(range.anchor, range.head);

    if (range.empty) {
      return range.anchor >= from && range.anchor < to;
    }

    return rangeFrom < to && from < rangeTo;
  });
}

interface WidgetRange {
  from: number;
  to: number;
  node: Content;
  source: string;
  definition: WidgetDefinition;
}

function collectWidgetRanges(
  ast: Root,
  doc: string,
  selection: readonly SelectionRange[],
  widgets: WidgetDefinition[]
): WidgetRange[] {
  const ranges: WidgetRange[] = [];

  function visit(parent: Parent | Root): void {
    for (const child of parent.children) {
      const from = child.position?.start.offset;
      const to = child.position?.end.offset;

      if (typeof from === "number" && typeof to === "number") {
        const matched = widgets.find(
          (w) => w.nodeType === child.type && (!w.match || w.match(child))
        );

        if (matched && !selectionIntersects(from, to, selection)) {
          ranges.push({
            from,
            to,
            node: child,
            source: doc.slice(from, to),
            definition: matched,
          });
          continue;
        }
      }

      if ("children" in child && Array.isArray(child.children)) {
        visit(child as Parent);
      }
    }
  }

  visit(ast);
  return ranges.sort((a, b) => a.from - b.from);
}

class NexusWidget extends WidgetType {
  constructor(
    private definition: WidgetDefinition,
    private node: Content,
    private source: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    return this.definition.render(this.node, this.source);
  }

  destroy(dom: HTMLElement): void {
    this.definition.destroy?.(dom);
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildWidgetDecorations(
  doc: string,
  selection: readonly SelectionRange[],
  parser: ParserLike,
  widgets: WidgetDefinition[]
): DecorationSet {
  const ast = parseDocument(parser, doc);
  const ranges = collectWidgetRanges(ast, doc, selection, widgets);
  const decos: Range<Decoration>[] = [];

  for (const range of ranges) {
    decos.push(
      Decoration.replace({
        widget: new NexusWidget(range.definition, range.node, range.source),
        block: true,
      }).range(range.from, range.to)
    );
  }

  return Decoration.set(decos, true);
}

export function createWidgetExtension(
  parser: ParserLike,
  widgets: WidgetDefinition[]
): Extension[] {
  if (widgets.length === 0) return [];

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildWidgetDecorations(
        state.doc.toString(),
        state.selection.ranges,
        parser,
        widgets
      );
    },
    update(decos: DecorationSet, tr: Transaction) {
      if (tr.docChanged || tr.selection) {
        return buildWidgetDecorations(
          tr.state.doc.toString(),
          tr.state.selection.ranges,
          parser,
          widgets
        );
      }
      return decos;
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });

  return [field];
}
