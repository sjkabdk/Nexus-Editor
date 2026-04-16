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
      if ("children" in c && Array.isArray(c.children))
        return c.children.map((n: any) => ("value" in n ? n.value : "")).join("");
      return "";
    })
    .join("");
}

export class EditableTableWidget extends WidgetType {
  private editing = false;

  constructor(
    private node: Table,
    private tableFrom: number,
    private source: string,
    private viewRef: { current: EditorView | null },
    private labels: Required<LivePreviewLabels>
  ) { super(); }

  eq(other: EditableTableWidget): boolean {
    if (this.editing) return true;
    return this.source === other.source;
  }

  ignoreEvent(): boolean { return true; }

  private dispatch(newSource: string): void {
    const v = this.viewRef.current;
    if (!v) return;
    v.dispatch({ changes: { from: this.tableFrom, to: this.tableFrom + this.source.length, insert: newSource } });
  }

  private deleteColumn(colIdx: number): void {
    const lines = this.source.split("\n");
    const newLines = lines.map((line) => {
      const cells = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      if (cells.length <= 1) return line;
      cells.splice(colIdx, 1);
      return "|" + cells.join("|") + "|";
    });
    this.dispatch(newLines.join("\n"));
  }

  private deleteRow(rowIdx: number): void {
    const lines = this.source.split("\n");
    const dataLines: number[] = [];
    for (let i = 0; i < lines.length; i++) if (!SEPARATOR_RE.test(lines[i])) dataLines.push(i);
    const lineIdx = dataLines[rowIdx];
    if (lineIdx === undefined || dataLines.length <= 1) return;
    lines.splice(lineIdx, 1);
    this.dispatch(lines.join("\n"));
  }

  private addColumn(): void {
    const lines = this.source.split("\n");
    const nl = lines.map((l) => SEPARATOR_RE.test(l) ? l.replace(/\|?\s*$/, " | --- |") : l.replace(/\|?\s*$/, " |  |"));
    this.dispatch(nl.join("\n"));
  }

  private addRow(): void {
    const cc = (this.node.children?.[0] as any)?.children?.length ?? 2;
    const nr = "\n| " + Array(cc).fill("  ").join(" | ") + " |";
    const v = this.viewRef.current;
    if (!v) return;
    v.dispatch({ changes: { from: this.tableFrom + this.source.length, insert: nr } });
  }

  private moveColumn(from: number, to: number): void {
    const lines = this.source.split("\n");
    const nl = lines.map((line) => {
      const p = line.split("|"), cells = p.slice(1, -1);
      if (from >= cells.length || to >= cells.length) return line;
      const [m] = cells.splice(from, 1);
      cells.splice(to, 0, m);
      return "|" + cells.join("|") + "|";
    });
    this.dispatch(nl.join("\n"));
  }

  private moveRow(from: number, to: number): void {
    const lines = this.source.split("\n");
    const dl: number[] = [];
    for (let i = 0; i < lines.length; i++) if (!SEPARATOR_RE.test(lines[i])) dl.push(i);
    const s = dl[from], d = dl[to];
    if (s === undefined || d === undefined) return;
    const [m] = lines.splice(s, 1);
    lines.splice(d, 0, m);
    this.dispatch(lines.join("\n"));
  }

  toDOM(): HTMLElement {
    const self = this;
    const rows = this.node.children ?? [];
    const colCount = ("children" in rows[0] && Array.isArray(rows[0].children)) ? rows[0].children.length : 0;
    const sourceLines = this.source.split("\n");
    const dataLineIndices: number[] = [];
    for (let i = 0; i < sourceLines.length; i++) if (!SEPARATOR_RE.test(sourceLines[i])) dataLineIndices.push(i);

    // Outer wrapper with rounded border (Obsidian style)
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:inline-block;position:relative;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin:4px 0;";

    // Top drag handle (centered, moves entire table block)
    const handle = document.createElement("div");
    handle.style.cssText =
      "display:flex;justify-content:center;padding:4px 0;cursor:grab;user-select:none;" +
      "opacity:0;transition:opacity .15s;background:#f8f8f8;border-bottom:1px solid #eee;";
    const handleIcon = document.createElement("span");
    handleIcon.textContent = "⋮⋮⋮";
    handleIcon.style.cssText = "color:#bbb;font-size:11px;letter-spacing:2px;";
    handle.appendChild(handleIcon);
    wrapper.appendChild(handle);

    // Table element
    const table = document.createElement("table");
    table.style.cssText = "border-collapse:collapse;display:table;";
    if (rows.length === 0) { wrapper.appendChild(table); return wrapper; }

    // Column hover grips (invisible by default, appear on column hover)
    let dragColIdx = -1;
    let dragRowIdx = -1;

    // Build rows
    let rowIdx = 0;
    for (const astRow of rows) {
      const isHeader = rowIdx === 0;
      const tr = document.createElement("tr");
      const astCells = "children" in astRow && Array.isArray(astRow.children) ? astRow.children : [];
      const sourceLineIdx = dataLineIndices[rowIdx];
      const curRowIdx = rowIdx;

      for (let colIdx = 0; colIdx < astCells.length; colIdx++) {
        const td = document.createElement(isHeader ? "th" : "td");
        td.contentEditable = "true";
        td.textContent = extractCellText(astCells[colIdx]);
        td.style.cssText =
          "border-bottom:1px solid #eee;border-right:1px solid #eee;padding:8px 12px;" +
          "text-align:left;outline:none;min-width:60px;vertical-align:top;";
        if (isHeader) td.style.cssText += "font-weight:bold;background:#fafafa;";

        // Last column: no right border
        if (colIdx === astCells.length - 1) td.style.borderRight = "none";

        td.addEventListener("focus", () => { self.editing = true; tableEditingCount++; });
        td.addEventListener("blur", () => { self.editing = false; tableEditingCount--; });

        td.addEventListener("input", () => {
          const v = self.viewRef.current;
          if (!v || sourceLineIdx === undefined) return;
          const vals: string[] = [];
          tr.querySelectorAll("th,td").forEach((el) => vals.push(el.textContent ?? ""));
          const newLine = "| " + vals.join(" | ") + " |";
          let off = self.tableFrom;
          for (let i = 0; i < sourceLineIdx; i++) off += sourceLines[i].length + 1;
          const end = off + sourceLines[sourceLineIdx].length;
          sourceLines[sourceLineIdx] = newLine;
          v.dispatch({ changes: { from: off, to: end, insert: newLine } });
        });

        td.addEventListener("keydown", (e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const all = table.querySelectorAll("th[contenteditable],td[contenteditable]");
            const idx = Array.from(all).indexOf(td);
            const next = e.shiftKey ? idx - 1 : idx + 1;
            if (next >= 0 && next < all.length) (all[next] as HTMLElement).focus();
          }
        });

        // Column drag: header cells are column drag sources
        if (isHeader) {
          td.draggable = true;
          td.addEventListener("dragstart", (e) => {
            dragColIdx = colIdx; dragRowIdx = -1;
            e.dataTransfer!.effectAllowed = "move";
            e.dataTransfer!.setData("text/x-nexus-col", String(colIdx));
            td.style.opacity = "0.5";
          });
          td.addEventListener("dragend", () => { td.style.opacity = "1"; });
        }

        // Column drop target (all cells in a column accept drops)
        td.addEventListener("dragover", (e) => {
          if (dragColIdx >= 0 && dragColIdx !== colIdx) {
            e.preventDefault();
            td.style.borderLeft = "2px solid #6c8dfa";
          }
          if (dragRowIdx >= 0 && dragRowIdx !== curRowIdx) {
            e.preventDefault();
            tr.style.borderTop = "2px solid #6c8dfa";
          }
        });
        td.addEventListener("dragleave", () => {
          td.style.borderLeft = "";
          tr.style.borderTop = "";
        });
        td.addEventListener("drop", (e) => {
          e.preventDefault();
          td.style.borderLeft = "";
          tr.style.borderTop = "";
          if (dragColIdx >= 0 && dragColIdx !== colIdx) {
            self.moveColumn(dragColIdx, colIdx);
            dragColIdx = -1;
          }
          if (dragRowIdx >= 0 && dragRowIdx !== curRowIdx) {
            self.moveRow(dragRowIdx, curRowIdx);
            dragRowIdx = -1;
          }
        });

        tr.appendChild(td);
      }

      // Row drag: non-header rows are draggable from left edge area
      if (!isHeader) {
        tr.addEventListener("mousedown", (e) => {
          // Only start drag from the leftmost 20px of the row
          const rect = tr.getBoundingClientRect();
          if (e.clientX - rect.left > 20) return;
          tr.draggable = true;
        });
        tr.addEventListener("dragstart", (e) => {
          dragRowIdx = curRowIdx; dragColIdx = -1;
          e.dataTransfer!.effectAllowed = "move";
          e.dataTransfer!.setData("text/x-nexus-row", String(curRowIdx));
          tr.style.opacity = "0.5";
        });
        tr.addEventListener("dragend", () => { tr.style.opacity = "1"; tr.draggable = false; });
      }

      // Right-click context menu
      tr.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, self, curRowIdx, isHeader, colCount, rows.length, wrapper);
      });

      table.appendChild(tr);
      rowIdx++;
    }

    wrapper.appendChild(table);

    // "+" buttons (hidden, appear on hover)
    const btnCss = "position:absolute;width:20px;height:20px;border:1px solid #ddd;" +
      "border-radius:50%;background:#fff;cursor:pointer;font-size:14px;line-height:1;" +
      "display:flex;align-items:center;justify-content:center;color:#999;padding:0;" +
      "opacity:0;transition:opacity .15s;";

    const addCol = document.createElement("button");
    addCol.textContent = "+";
    addCol.title = self.labels.addColumn;
    addCol.style.cssText = btnCss + "right:-24px;top:50%;transform:translateY(-50%);";
    addCol.addEventListener("click", () => self.addColumn());
    wrapper.appendChild(addCol);

    const addRow = document.createElement("button");
    addRow.textContent = "+";
    addRow.title = self.labels.addRow;
    addRow.style.cssText = btnCss + "bottom:-24px;left:50%;transform:translateX(-50%);";
    addRow.addEventListener("click", () => self.addRow());
    wrapper.appendChild(addRow);

    // Show/hide on hover
    wrapper.addEventListener("mouseenter", () => {
      handle.style.opacity = "1";
      addCol.style.opacity = "1";
      addRow.style.opacity = "1";
    });
    wrapper.addEventListener("mouseleave", () => {
      handle.style.opacity = "0";
      addCol.style.opacity = "0";
      addRow.style.opacity = "0";
    });

    return wrapper;
  }
}

function showContextMenu(
  x: number, y: number,
  widget: EditableTableWidget,
  rowIdx: number, isHeader: boolean,
  colCount: number, rowCount: number,
  container: HTMLElement
): void {
  // Remove any existing context menu
  container.querySelector(".nexus-table-ctx")?.remove();

  const menu = document.createElement("div");
  menu.className = "nexus-table-ctx";
  menu.style.cssText =
    "position:fixed;z-index:9999;background:#fff;border:1px solid #ddd;border-radius:6px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.12);padding:4px 0;min-width:140px;font-size:13px;";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  function addItem(label: string, action: () => void, disabled = false): void {
    const item = document.createElement("div");
    item.textContent = label;
    item.style.cssText = "padding:6px 16px;cursor:pointer;white-space:nowrap;";
    if (disabled) {
      item.style.color = "#ccc";
      item.style.cursor = "default";
    } else {
      item.addEventListener("mouseenter", () => { item.style.background = "#f0f0f0"; });
      item.addEventListener("mouseleave", () => { item.style.background = ""; });
      item.addEventListener("click", () => { menu.remove(); action(); });
    }
    menu.appendChild(item);
  }

  if (!isHeader && rowCount > 2) {
    addItem("Delete row", () => (widget as any).deleteRow(rowIdx));
  }
  if (colCount > 1) {
    addItem("Delete column", () => (widget as any).deleteColumn(0)); // TODO: detect which column
  }
  addItem("Add row below", () => (widget as any).addRow());
  addItem("Add column right", () => (widget as any).addColumn());

  document.body.appendChild(menu);

  // Close on click outside
  const close = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}
