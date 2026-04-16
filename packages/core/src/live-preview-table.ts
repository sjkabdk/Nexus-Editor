import { EditorView, WidgetType } from "@codemirror/view";
import type { Table } from "mdast";

import type { LivePreviewLabels } from "./types";

let tableEditingCount = 0;

export function isTableEditing(): boolean {
  return tableEditingCount > 0;
}

const SEPARATOR_RE = /^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?\s*$/;

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

function rebuildFullTable(
  sourceLines: string[],
  tableFrom: number,
  view: EditorView
): void {
  const newSource = sourceLines.join("\n");
  const oldLen = sourceLines.reduce((s, l, i) => s + l.length + (i < sourceLines.length - 1 ? 1 : 0), 0);
  // Recalculate old length from view doc
  const doc = view.state.doc.toString();
  const tableEnd = doc.indexOf("\n", tableFrom + newSource.length - 1);
  // Simple: replace from tableFrom to the end of what we know
  let end = tableFrom;
  for (const line of sourceLines) {
    end += line.length + 1;
  }
  end--; // remove trailing \n overshoot

  view.dispatch({
    changes: { from: tableFrom, to: end, insert: newSource }
  });
}

export class EditableTableWidget extends WidgetType {
  private editing = false;

  constructor(
    private node: Table,
    private tableFrom: number,
    private source: string,
    private viewRef: { current: EditorView | null },
    private labels: Required<LivePreviewLabels>
  ) {
    super();
  }

  eq(other: EditableTableWidget): boolean {
    if (this.editing) return true;
    return this.source === other.source;
  }

  ignoreEvent(): boolean {
    return true;
  }

  private dispatchFullSource(newSource: string): void {
    const v = this.viewRef.current;
    if (!v) return;
    const tableEnd = this.tableFrom + this.source.length;
    v.dispatch({ changes: { from: this.tableFrom, to: tableEnd, insert: newSource } });
  }

  private deleteColumn(colIdx: number): void {
    const lines = this.source.split("\n");
    const newLines = lines.map((line) => {
      const cells = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      if (cells.length <= 1) return line; // don't delete last column
      cells.splice(colIdx, 1);
      return "|" + cells.join("|") + "|";
    });
    this.dispatchFullSource(newLines.join("\n"));
  }

  private deleteRow(rowIdx: number): void {
    const lines = this.source.split("\n");
    // Map AST row index to source line index (skip separator)
    const dataLineIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!SEPARATOR_RE.test(lines[i])) dataLineIndices.push(i);
    }
    const lineIdx = dataLineIndices[rowIdx];
    if (lineIdx === undefined || dataLineIndices.length <= 1) return;
    lines.splice(lineIdx, 1);
    this.dispatchFullSource(lines.join("\n"));
  }

  private addColumn(): void {
    const lines = this.source.split("\n");
    const newLines = lines.map((line) => {
      if (SEPARATOR_RE.test(line)) return line.replace(/\|?\s*$/, " | --- |");
      return line.replace(/\|?\s*$/, " |  |");
    });
    this.dispatchFullSource(newLines.join("\n"));
  }

  private addRow(): void {
    const colCount = (this.node.children?.[0] as any)?.children?.length ?? 2;
    const cells = Array(colCount).fill("  ");
    const newRow = "\n| " + cells.join(" | ") + " |";
    const v = this.viewRef.current;
    if (!v) return;
    const tableEnd = this.tableFrom + this.source.length;
    v.dispatch({ changes: { from: tableEnd, insert: newRow } });
  }

  private moveColumn(fromIdx: number, toIdx: number): void {
    const lines = this.source.split("\n");
    const newLines = lines.map((line) => {
      const parts = line.split("|");
      // parts: ["", " cell1 ", " cell2 ", ... , ""]
      const cells = parts.slice(1, -1);
      if (fromIdx >= cells.length || toIdx >= cells.length) return line;
      const [moved] = cells.splice(fromIdx, 1);
      cells.splice(toIdx, 0, moved);
      return "|" + cells.join("|") + "|";
    });
    this.dispatchFullSource(newLines.join("\n"));
  }

  private moveRow(fromIdx: number, toIdx: number): void {
    const lines = this.source.split("\n");
    const dataLineIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!SEPARATOR_RE.test(lines[i])) dataLineIndices.push(i);
    }
    const srcLine = dataLineIndices[fromIdx];
    const dstLine = dataLineIndices[toIdx];
    if (srcLine === undefined || dstLine === undefined) return;
    const [moved] = lines.splice(srcLine, 1);
    lines.splice(dstLine, 0, moved);
    this.dispatchFullSource(lines.join("\n"));
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.display = "inline-block";
    wrapper.style.position = "relative";

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.display = "table";

    const rows = this.node.children ?? [];
    if (rows.length === 0) { wrapper.appendChild(table); return wrapper; }

    const sourceLines = this.source.split("\n");
    const dataLineIndices: number[] = [];
    for (let i = 0; i < sourceLines.length; i++) {
      if (!SEPARATOR_RE.test(sourceLines[i])) dataLineIndices.push(i);
    }

    const self = this;
    const colCount = ("children" in rows[0] && Array.isArray(rows[0].children))
      ? rows[0].children.length : 0;

    // Shared drag state scoped to this table instance
    let dragColIdx = -1;
    let dragRowIdx = -1;

    // Column grip row (drag handles above each column)
    const gripRow = document.createElement("tr");
    // Empty cell for row-grip column
    const gripCorner = document.createElement("td");
    gripCorner.style.cssText = "border:none;padding:0;width:20px;";
    gripRow.appendChild(gripCorner);

    for (let c = 0; c < colCount; c++) {
      const gripTd = document.createElement("td");
      gripTd.style.cssText =
        "padding:2px 10px;text-align:center;border:none;cursor:grab;" +
        "color:#ccc;font-size:12px;user-select:none;height:18px;";
      gripTd.textContent = "⋮⋮";
      gripTd.draggable = true;
      gripTd.title = "Drag to reorder column";

      gripTd.addEventListener("dragstart", (e) => {
        dragColIdx = c;
        dragRowIdx = -1;
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData("text/plain", "col");
      });
      gripTd.addEventListener("dragover", (e) => {
        if (dragColIdx >= 0) { e.preventDefault(); gripTd.style.background = "#e8f0fe"; }
      });
      gripTd.addEventListener("dragleave", () => { gripTd.style.background = ""; });
      gripTd.addEventListener("drop", (e) => {
        e.preventDefault();
        gripTd.style.background = "";
        if (dragColIdx >= 0 && dragColIdx !== c) self.moveColumn(dragColIdx, c);
        dragColIdx = -1;
      });
      gripTd.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (colCount > 1) self.deleteColumn(c);
      });

      gripRow.appendChild(gripTd);
    }
    table.appendChild(gripRow);

    // Data rows
    let rowIdx = 0;
    for (const astRow of rows) {
      const isHeader = rowIdx === 0;
      const tr = document.createElement("tr");
      const astCells = "children" in astRow && Array.isArray(astRow.children) ? astRow.children : [];
      const sourceLineIdx = dataLineIndices[rowIdx];
      const currentRowIdx = rowIdx;

      // Row grip cell (left side of each row)
      const rowGrip = document.createElement("td");
      rowGrip.style.cssText =
        "padding:2px 4px;text-align:center;border:none;cursor:grab;" +
        "color:#ccc;font-size:12px;user-select:none;width:20px;";
      rowGrip.textContent = "⋮⋮";
      rowGrip.draggable = true;
      rowGrip.title = "Drag to reorder row";

      rowGrip.addEventListener("dragstart", (e) => {
        dragRowIdx = currentRowIdx;
        dragColIdx = -1;
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData("text/plain", "row");
        tr.style.opacity = "0.5";
      });
      rowGrip.addEventListener("dragend", () => { tr.style.opacity = "1"; });

      // Drop target: the entire row accepts row drops
      tr.addEventListener("dragover", (e) => {
        if (dragRowIdx >= 0) { e.preventDefault(); tr.style.background = "#e8f0fe"; }
      });
      tr.addEventListener("dragleave", () => { tr.style.background = ""; });
      tr.addEventListener("drop", (e) => {
        e.preventDefault();
        tr.style.background = "";
        if (dragRowIdx >= 0 && dragRowIdx !== currentRowIdx) {
          self.moveRow(dragRowIdx, currentRowIdx);
        }
        dragRowIdx = -1;
      });

      tr.addEventListener("contextmenu", (e) => {
        // Only trigger on the grip cell, not content cells
        if (e.target === rowGrip && rows.length > 2) {
          e.preventDefault();
          self.deleteRow(currentRowIdx);
        }
      });

      tr.appendChild(rowGrip);

      for (let colIdx = 0; colIdx < astCells.length; colIdx++) {
        const td = document.createElement(isHeader ? "th" : "td");
        td.contentEditable = "true";
        td.textContent = extractCellText(astCells[colIdx]);
        td.style.cssText =
          "border:1px solid #ddd;padding:6px 10px;text-align:left;" +
          "outline:none;min-width:40px;";
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
          v.dispatch({ changes: { from: lineOffset, to: lineEnd, insert: newLine } });
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

    // "+" buttons
    const btnBase =
      "width:20px;height:20px;border:1px solid #ddd;border-radius:50%;" +
      "background:#fff;cursor:pointer;font-size:14px;line-height:1;" +
      "display:flex;align-items:center;justify-content:center;" +
      "color:#999;padding:0;opacity:0;transition:opacity .15s;";

    const addColBtn = document.createElement("button");
    addColBtn.textContent = "+";
    addColBtn.title = self.labels.addColumn;
    addColBtn.style.cssText = btnBase + "position:absolute;right:-24px;top:50%;transform:translateY(-50%);";
    addColBtn.addEventListener("click", () => self.addColumn());
    wrapper.appendChild(addColBtn);

    const addRowBtn = document.createElement("button");
    addRowBtn.textContent = "+";
    addRowBtn.title = self.labels.addRow;
    addRowBtn.style.cssText = btnBase + "margin:4px auto 0;position:relative;";
    addRowBtn.addEventListener("click", () => self.addRow());
    wrapper.appendChild(addRowBtn);

    wrapper.addEventListener("mouseenter", () => {
      addColBtn.style.opacity = "1";
      addRowBtn.style.opacity = "1";
    });
    wrapper.addEventListener("mouseleave", () => {
      addColBtn.style.opacity = "0";
      addRowBtn.style.opacity = "0";
    });

    return wrapper;
  }
}
