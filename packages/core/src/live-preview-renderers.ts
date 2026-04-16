import type {
  LivePreviewNode,
  LivePreviewNodeType,
  LivePreviewRenderContext,
  LivePreviewRenderer
} from "./types";

function getText(node: LivePreviewNode): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }

  if (node.type === "image") {
    return node.alt ?? "";
  }

  if ("children" in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => {
        if ("value" in child && typeof child.value === "string") {
          return child.value;
        }

        if ("children" in child && Array.isArray(child.children)) {
          return child.children
            .map((nested) => ("value" in nested && typeof nested.value === "string" ? nested.value : ""))
            .join("");
        }

        return "";
      })
      .join("");
  }

  return "";
}

export function createDefaultRenderer(context: LivePreviewRenderContext): HTMLElement {
  switch (context.node.type) {
    case "strong": {
      const element = document.createElement("strong");
      element.textContent = context.text;
      return element;
    }
    case "emphasis": {
      const element = document.createElement("em");
      element.textContent = context.text;
      return element;
    }
    case "inlineCode": {
      const element = document.createElement("code");
      element.textContent = context.text;
      return element;
    }
    case "link": {
      const element = document.createElement("a");
      element.textContent = context.text;
      element.href = context.node.url;
      element.rel = "noopener noreferrer";
      element.title = `${context.node.url} (Ctrl+Click to open)`;
      element.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          window.open(context.node.url, "_blank", "noopener,noreferrer");
        }
      });
      return element;
    }
    case "heading": {
      const element = document.createElement("span");
      element.textContent = context.text;
      element.style.display = "block";
      element.style.fontWeight = "bold";
      element.setAttribute("data-heading-level", String(context.node.depth));
      return element;
    }
    case "blockquote": {
      const element = document.createElement("blockquote");
      element.textContent = context.text;
      element.style.display = "block";
      return element;
    }
    case "delete": {
      const element = document.createElement("del");
      element.textContent = context.text;
      return element;
    }
    case "thematicBreak": {
      const element = document.createElement("hr");
      element.style.display = "block";
      return element;
    }
    case "code": {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = context.node.value;
      if (context.node.lang) {
        code.setAttribute("data-language", context.node.lang);
        code.className = `language-${context.node.lang}`;
      }
      pre.style.display = "block";
      pre.style.padding = "8px 12px";
      pre.style.background = "#f6f8fa";
      pre.style.borderRadius = "4px";
      pre.style.overflow = "auto";
      pre.style.fontSize = "0.9em";
      pre.style.fontFamily = "monospace";
      pre.appendChild(code);
      return pre;
    }
    case "table": {
      const table = document.createElement("table");
      table.style.display = "table";
      table.style.borderCollapse = "collapse";
      table.style.width = "100%";

      const rows = context.node.children ?? [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const tr = document.createElement("tr");
        const cells = "children" in row && Array.isArray(row.children) ? row.children : [];
        for (const cell of cells) {
          const td = document.createElement(i === 0 ? "th" : "td");
          td.style.border = "1px solid #ddd";
          td.style.padding = "6px 10px";
          td.style.textAlign = "left";
          if (i === 0) {
            td.style.fontWeight = "bold";
            td.style.background = "#f6f8fa";
          }
          // Extract cell text
          if ("children" in cell && Array.isArray(cell.children)) {
            td.textContent = cell.children
              .map((c: any) => ("value" in c ? c.value : ""))
              .join("");
          }
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      return table;
    }
    case "image": {
      const wrapper = document.createElement("span");
      const label = document.createElement("span");
      const element = document.createElement("img");
      wrapper.setAttribute("data-live-preview-image", context.node.url);
      element.src = context.node.url;
      element.alt = context.node.alt ?? "";
      label.textContent = context.node.alt ?? context.node.url;
      wrapper.appendChild(label);
      wrapper.appendChild(element);
      return wrapper;
    }
  }
}

export function renderLivePreviewNode(
  node: LivePreviewNode,
  source: string,
  renderers: Partial<Record<LivePreviewNodeType, LivePreviewRenderer>>
): HTMLElement {
  const context: LivePreviewRenderContext = {
    node,
    nodeType: node.type,
    source,
    text: getText(node)
  };

  return renderers[node.type]?.(context) ?? createDefaultRenderer(context);
}
