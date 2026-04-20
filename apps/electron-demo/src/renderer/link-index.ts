import { scanWikiLinks, type WikiLinkMatch } from "@nexus/core";

export interface BacklinkHit {
  sourcePath: string;
  target: string;
  from: number;
  to: number;
  snippet: string;
}

export type LinkIndexListener = () => void;

function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  return slash >= 0 ? norm.slice(slash + 1) : norm;
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function dirname(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  return slash >= 0 ? norm.slice(0, slash) : "";
}

function joinPath(dir: string, rel: string): string {
  if (!dir) return rel;
  return `${dir}/${rel}`.replace(/\\/g, "/");
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Strip Obsidian-style anchors from a link target:
 *   "Foo"              → "Foo"
 *   "Foo#Heading"      → "Foo"
 *   "Foo^block-id"     → "Foo"
 *   "Foo/Bar#Heading"  → "Foo/Bar"
 * An empty bare target (e.g. "#Heading") returns empty.
 */
export function stripAnchor(target: string): string {
  const hash = target.indexOf("#");
  const caret = target.indexOf("^");
  const cuts = [hash, caret].filter((i) => i >= 0);
  if (cuts.length === 0) return target.trim();
  const cut = Math.min(...cuts);
  return target.slice(0, cut).trim();
}

function snippetAround(content: string, from: number, to: number): string {
  const lineStart = content.lastIndexOf("\n", from - 1) + 1;
  const nl = content.indexOf("\n", to);
  const lineEnd = nl === -1 ? content.length : nl;
  return content.slice(lineStart, lineEnd).trim();
}

/**
 * Vault-scoped bidirectional wiki-link index.
 *
 * Keys are ABSOLUTE file paths as returned by the electron bridge. All match
 * offsets are absolute offsets inside the source file's content string.
 */
export class LinkIndex {
  /** Forward edges: source path → list of wiki links it contains. */
  private forward = new Map<string, WikiLinkMatch[]>();
  /** Reverse index: resolved target path → list of (source, match) pairs. */
  private backward = new Map<string, BacklinkHit[]>();
  /** Content cache — needed for recomputing snippets after active-file edits. */
  private contents = new Map<string, string>();
  /** basename (without extension, lowercase) → set of absolute paths. */
  private byBasename = new Map<string, Set<string>>();

  private listeners = new Set<LinkIndexListener>();

  /** Replace the entire index with `files`. */
  rebuild(files: Array<{ path: string; content: string }>): void {
    this.forward.clear();
    this.backward.clear();
    this.contents.clear();
    this.byBasename.clear();
    for (const f of files) {
      this.indexFile(f.path, f.content);
    }
    this.rebuildBackward();
    this.notify();
  }

  /** Incremental update for a single file's contents. */
  updateFile(path: string, content: string): void {
    this.removeFromBasenames(path);
    this.indexFile(path, content);
    this.rebuildBackward();
    this.notify();
  }

  /** Drop a file and all its outgoing/incoming edges. */
  removeFile(path: string): void {
    this.removeFromBasenames(path);
    this.forward.delete(path);
    this.contents.delete(path);
    this.rebuildBackward();
    this.notify();
  }

  /** Rename `oldPath` → `newPath`, preserving content. */
  renameFile(oldPath: string, newPath: string): void {
    const content = this.contents.get(oldPath);
    if (content == null) return;
    this.removeFile(oldPath);
    this.updateFile(newPath, content);
  }

  /** All known note names (basename without extension), deduplicated. */
  getAllNoteNames(): string[] {
    const out = new Set<string>();
    for (const abs of this.forward.keys()) {
      out.add(stripExt(basename(abs)));
    }
    for (const abs of this.contents.keys()) {
      out.add(stripExt(basename(abs)));
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  /** Get inbound wiki-link references for an absolute target path. */
  getBacklinks(targetPath: string): BacklinkHit[] {
    return this.backward.get(normalizeSlashes(targetPath)) ?? [];
  }

  /**
   * Find plain-text occurrences of the target file's basename (sans extension)
   * across every other file in the vault, excluding any occurrence that falls
   * inside an existing wiki link. Case-insensitive, word-boundary matched.
   *
   * Corresponds to Obsidian's "Unlinked mentions" section.
   */
  getUnlinkedMentions(targetPath: string): BacklinkHit[] {
    const norm = normalizeSlashes(targetPath);
    const needle = stripExt(basename(norm));
    if (!needle) return [];
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");

    const out: BacklinkHit[] = [];
    for (const [source, content] of this.contents) {
      if (source === norm) continue; // skip self
      const wikiRanges = this.forward.get(source) ?? [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        // Skip if the match falls inside an existing wiki link range.
        const insideLink = wikiRanges.some((wl) => start >= wl.from && end <= wl.to);
        if (insideLink) continue;
        out.push({
          sourcePath: source,
          target: needle,
          from: start,
          to: end,
          snippet: snippetAround(content, start, end),
        });
      }
    }
    return out;
  }

  /** All source files (absolute paths) currently in the index. */
  getAllFiles(): string[] {
    return [...this.contents.keys()];
  }

  /**
   * Resolve a wiki-link name from a source file to an absolute target path.
   * Order: exact match → relative to source dir → same-dir basename → global
   * unique basename. Returns null when no candidate fits.
   */
  resolve(name: string, fromPath: string | null | undefined): string | null {
    if (!name) return null;
    // Strip Obsidian anchors — `#heading` and `^blockid` are navigation hints,
    // not part of the file identity. v1 resolves to the underlying file; v2
    // will honor the anchor. Without this strip, `[[Foo#Bar]]` is treated as
    // a literal filename and falsely reports unresolved.
    const bare = stripAnchor(name);
    if (!bare) return null;
    name = bare;
    const normFrom = fromPath ? normalizeSlashes(fromPath) : null;
    const candidates = this.contents;

    // Rule 1 — exact absolute path.
    if (candidates.has(name)) return name;
    const normName = normalizeSlashes(name);
    if (candidates.has(normName)) return normName;

    // Rule 2 — relative path joined with the source directory.
    if (normFrom) {
      const dir = dirname(normFrom);
      const joined = joinPath(dir, normName);
      if (candidates.has(joined)) return joined;
      const joinedMd = joined.endsWith(".md") ? joined : `${joined}.md`;
      if (candidates.has(joinedMd)) return joinedMd;
    }

    // Rule 3 — same-directory basename.
    if (normFrom) {
      const dir = dirname(normFrom);
      const bn = stripExt(basename(normName)).toLowerCase();
      const bucket = this.byBasename.get(bn);
      if (bucket) {
        for (const abs of bucket) {
          if (dirname(abs).toLowerCase() === dir.toLowerCase()) return abs;
        }
      }
    }

    // Rule 4 — globally unique basename.
    const bn = stripExt(basename(normName)).toLowerCase();
    const bucket = this.byBasename.get(bn);
    if (bucket && bucket.size === 1) {
      return [...bucket][0];
    }

    return null;
  }

  subscribe(listener: LinkIndexListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of [...this.listeners]) {
      try {
        l();
      } catch {
        /* swallow */
      }
    }
  }

  private indexFile(rawPath: string, content: string): void {
    const path = normalizeSlashes(rawPath);
    const matches = scanWikiLinks(content);
    this.forward.set(path, matches);
    this.contents.set(path, content);
    const bn = stripExt(basename(path)).toLowerCase();
    let bucket = this.byBasename.get(bn);
    if (!bucket) {
      bucket = new Set();
      this.byBasename.set(bn, bucket);
    }
    bucket.add(path);
  }

  private removeFromBasenames(rawPath: string): void {
    const path = normalizeSlashes(rawPath);
    const bn = stripExt(basename(path)).toLowerCase();
    const bucket = this.byBasename.get(bn);
    if (bucket) {
      bucket.delete(path);
      if (bucket.size === 0) this.byBasename.delete(bn);
    }
  }

  /**
   * Rebuild the backward map from scratch. O(E) where E is total outgoing
   * edges — cheap enough for interactive editing and dramatically simpler
   * than maintaining differential invariants.
   */
  private rebuildBackward(): void {
    this.backward.clear();
    for (const [source, matches] of this.forward) {
      const content = this.contents.get(source) ?? "";
      for (const m of matches) {
        const target = this.resolve(m.target, source);
        if (!target) continue;
        let bucket = this.backward.get(target);
        if (!bucket) {
          bucket = [];
          this.backward.set(target, bucket);
        }
        bucket.push({
          sourcePath: source,
          target: m.target,
          from: m.from,
          to: m.to,
          snippet: snippetAround(content, m.from, m.to),
        });
      }
    }
  }
}
