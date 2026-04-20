import type { LinkIndex, BacklinkHit } from "./link-index";

export interface BacklinksPanelOptions {
  index: LinkIndex;
  onOpenFile(filePath: string): void;
  getActiveFile(): string | null;
}

export interface BacklinksPanel {
  element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  return slash >= 0 ? norm.slice(slash + 1) : norm;
}

const PANEL_STYLES = `
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--nexus-border, #eee);
  background: var(--nexus-bg, #fff);
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  overflow: hidden;
`;

const HEADER_STYLES = `
  padding: 8px 10px;
  border-bottom: 1px solid var(--nexus-border, #eee);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--nexus-text-muted, #888);
  flex-shrink: 0;
`;

const SECTION_HEADER_STYLES = `
  padding: 8px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--nexus-text-muted, #888);
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid var(--nexus-border-subtle, #f2f2f2);
  background: var(--nexus-bg, #fff);
  position: sticky;
  top: 0;
  z-index: 1;
`;

const LIST_STYLES = `
  flex: 1;
  overflow-y: auto;
`;

const EMPTY_STYLES = `
  padding: 8px 12px 12px;
  color: var(--nexus-text-faint, #bbb);
  font-size: 12px;
  font-style: italic;
`;

const ITEM_STYLES = `
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  padding: 6px 10px;
  color: var(--nexus-text, #24292e);
  border-bottom: 1px solid var(--nexus-border-subtle, #f2f2f2);
`;

const ITEM_TITLE_STYLES = `
  font-weight: 600;
  font-size: 12px;
  color: var(--nexus-text, #24292e);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ITEM_SNIPPET_STYLES = `
  font-size: 12px;
  color: var(--nexus-text-muted, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const BADGE_STYLES = `
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--nexus-bg-muted, #eef);
  color: var(--nexus-text-muted, #666);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
`;

export function createBacklinksPanel(options: BacklinksPanelOptions): BacklinksPanel {
  const { index, onOpenFile, getActiveFile } = options;

  const root = document.createElement("aside");
  root.className = "backlinks-panel";
  root.style.cssText = PANEL_STYLES;

  const header = document.createElement("div");
  header.style.cssText = HEADER_STYLES;
  header.textContent = "Backlinks";
  root.appendChild(header);

  const list = document.createElement("div");
  list.style.cssText = LIST_STYLES;
  root.appendChild(list);

  function renderSectionHeader(title: string, count: number, parent: HTMLElement): void {
    const h = document.createElement("div");
    h.style.cssText = SECTION_HEADER_STYLES;
    const label = document.createElement("span");
    label.textContent = title;
    const badge = document.createElement("span");
    badge.style.cssText = BADGE_STYLES;
    badge.textContent = String(count);
    h.append(label, badge);
    parent.appendChild(h);
  }

  function renderItem(hit: BacklinkHit, parent: HTMLElement): void {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = ITEM_STYLES;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "var(--nexus-bg-muted, #f5f5f5)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
    });
    btn.addEventListener("click", () => onOpenFile(hit.sourcePath));

    const title = document.createElement("div");
    title.style.cssText = ITEM_TITLE_STYLES;
    title.textContent = basename(hit.sourcePath);
    title.title = hit.sourcePath;
    btn.appendChild(title);

    const snippet = document.createElement("div");
    snippet.style.cssText = ITEM_SNIPPET_STYLES;
    snippet.textContent = hit.snippet || "(empty)";
    btn.appendChild(snippet);

    parent.appendChild(btn);
  }

  function renderEmpty(reason: string, parent: HTMLElement): void {
    const empty = document.createElement("div");
    empty.style.cssText = EMPTY_STYLES;
    empty.textContent = reason;
    parent.appendChild(empty);
  }

  function refresh(): void {
    list.textContent = "";
    const active = getActiveFile();
    if (!active) {
      header.textContent = "Backlinks";
      renderEmpty("No active file", list);
      return;
    }

    const linked = index.getBacklinks(active);
    const unlinked = index.getUnlinkedMentions(active);
    header.textContent = `Backlinks · ${linked.length} linked · ${unlinked.length} mention${unlinked.length === 1 ? "" : "s"}`;

    // Linked mentions section
    renderSectionHeader("Linked mentions", linked.length, list);
    if (linked.length === 0) {
      renderEmpty("No linked mentions", list);
    } else {
      for (const hit of linked) renderItem(hit, list);
    }

    // Unlinked mentions section
    renderSectionHeader("Unlinked mentions", unlinked.length, list);
    if (unlinked.length === 0) {
      renderEmpty("No unlinked mentions", list);
    } else {
      for (const hit of unlinked) renderItem(hit, list);
    }
  }

  const unsubscribe = index.subscribe(() => refresh());
  refresh();

  return {
    element: root,
    refresh,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
