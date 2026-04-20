import { describe, expect, it } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { LinkIndex } from "../src/renderer/link-index";

const VAULT_ROOT = path.resolve(__dirname, "../sample-vault");
const SUPPORTED = new Set([".md", ".markdown", ".txt"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);

async function collect(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collect(p, acc);
    } else if (e.isFile() && SUPPORTED.has(path.extname(e.name).toLowerCase())) {
      acc.push(p);
    }
  }
}

async function buildIndex(): Promise<LinkIndex> {
  const paths: string[] = [];
  await collect(VAULT_ROOT, paths);
  const files = await Promise.all(
    paths.map(async (p) => ({ path: p, content: await readFile(p, "utf-8") }))
  );
  const idx = new LinkIndex();
  idx.rebuild(files);
  return idx;
}

/**
 * These tests verify that the sample vault ships a topology that exercises
 * every wiki-link behavior we care about: resolved/unresolved, aliases,
 * globally-unique basenames, same-directory collisions, and the hub note.
 * If a maintainer breaks the fixture content, these tests fail.
 */
describe("sample-vault fixture — end-to-end wiki-link behavior", () => {
  it("the vault directory exists and contains the hub", async () => {
    const st = await stat(path.join(VAULT_ROOT, "index.md"));
    expect(st.isFile()).toBe(true);
  });

  it("every note links back to index.md (hub topology)", async () => {
    const idx = await buildIndex();
    const hub = path.join(VAULT_ROOT, "index.md");
    const hits = idx.getBacklinks(hub);
    const sources = new Set(hits.map((h) => path.relative(VAULT_ROOT, h.sourcePath)));
    // README is documentation, not a note that must link in; every *other*
    // markdown file should.
    const expected = [
      "Daily/2026-04-20.md",
      "People/Alice.md",
      "People/Bob.md",
      "Projects/Ideas.md",
      "Projects/Nexus-Editor.md",
      "Topics/AI.md",
      "Topics/Testing.md",
      "ghost-demo.md",
      "personal/Diary.md",
      "personal/Meeting.md",
      "work/Inbox.md",
      "work/Meeting.md",
    ];
    for (const e of expected) expect(sources.has(e)).toBe(true);
  });

  it("[[AI]] from Daily resolves to Topics/AI.md (globally unique basename)", async () => {
    const idx = await buildIndex();
    const daily = path.join(VAULT_ROOT, "Daily/2026-04-20.md");
    expect(idx.resolve("AI", daily)).toBe(path.join(VAULT_ROOT, "Topics/AI.md"));
  });

  it("[[Meeting]] from work/Inbox.md resolves to work/Meeting.md (same-dir wins)", async () => {
    const idx = await buildIndex();
    const inbox = path.join(VAULT_ROOT, "work/Inbox.md");
    expect(idx.resolve("Meeting", inbox)).toBe(path.join(VAULT_ROOT, "work/Meeting.md"));
  });

  it("[[Meeting]] from personal/Diary.md resolves to personal/Meeting.md (symmetric)", async () => {
    const idx = await buildIndex();
    const diary = path.join(VAULT_ROOT, "personal/Diary.md");
    expect(idx.resolve("Meeting", diary)).toBe(path.join(VAULT_ROOT, "personal/Meeting.md"));
  });

  it("[[Ghost Note]] in ghost-demo.md is unresolved (creates-on-click scenario)", async () => {
    const idx = await buildIndex();
    const ghost = path.join(VAULT_ROOT, "ghost-demo.md");
    expect(idx.resolve("Ghost Note", ghost)).toBeNull();
    expect(idx.resolve("NonExistent", ghost)).toBeNull();
  });

  it("escape sequence \\[[NotALink]] is not indexed", async () => {
    const idx = await buildIndex();
    // NotALink should not be resolvable via any rule — it must never appear
    // as a valid target because the scanner skipped it.
    expect(idx.resolve("NotALink", path.join(VAULT_ROOT, "ghost-demo.md"))).toBeNull();
    // And no file's forward edges include a "NotALink" target.
    for (const source of idx.getAllFiles()) {
      const hits = idx.getBacklinks(source);
      for (const h of hits) {
        expect(h.target).not.toBe("NotALink");
      }
    }
  });

  it("aliased links still resolve by target, not alias", async () => {
    const idx = await buildIndex();
    // Daily/2026-04-20 has [[People/Alice|Alice]]; backlinks to People/Alice
    // must list the Daily file, proving the resolver used the target side.
    const alicePath = path.join(VAULT_ROOT, "People/Alice.md");
    const hits = idx.getBacklinks(alicePath);
    const sources = hits.map((h) => path.relative(VAULT_ROOT, h.sourcePath));
    expect(sources).toContain("Daily/2026-04-20.md");
  });

  it("Bob.md has an unlinked mention in Alice.md (plain text 'Bob' outside brackets)", async () => {
    const idx = await buildIndex();
    const bob = path.join(VAULT_ROOT, "People/Bob.md");
    const mentions = idx.getUnlinkedMentions(bob);
    const sources = mentions.map((m) => path.relative(VAULT_ROOT, m.sourcePath));
    expect(sources).toContain("People/Alice.md");
  });

  it("AI.md has an unlinked mention in Alice.md and Daily/2026-04-20.md has a linked one", async () => {
    const idx = await buildIndex();
    const ai = path.join(VAULT_ROOT, "Topics/AI.md");
    const unlinked = idx.getUnlinkedMentions(ai).map((m) => path.relative(VAULT_ROOT, m.sourcePath));
    const linked = idx.getBacklinks(ai).map((m) => path.relative(VAULT_ROOT, m.sourcePath));
    expect(unlinked).toContain("People/Alice.md"); // plain text "AI" in Alice.md
    expect(linked).toContain("Daily/2026-04-20.md"); // [[AI]] in the daily
  });

  it("v2-shaped anchors in Ideas.md resolve to the underlying file, not ghosts", async () => {
    const idx = await buildIndex();
    const ideas = path.join(VAULT_ROOT, "Projects/Ideas.md");
    expect(idx.resolve("Projects/Nexus-Editor#Context", ideas)).toBe(
      path.join(VAULT_ROOT, "Projects/Nexus-Editor.md")
    );
    expect(idx.resolve("Projects/Nexus-Editor^some-block", ideas)).toBe(
      path.join(VAULT_ROOT, "Projects/Nexus-Editor.md")
    );
  });

  it("getAllNoteNames lists unique basenames including Meeting only once", async () => {
    const idx = await buildIndex();
    const names = idx.getAllNoteNames();
    // Duplicates dedup'd — "Meeting" (work vs personal) must appear once.
    expect(names.filter((n) => n === "Meeting")).toHaveLength(1);
    // Key notes present.
    for (const n of ["index", "AI", "Alice", "Bob", "Nexus-Editor", "Ideas", "ghost-demo"]) {
      expect(names).toContain(n);
    }
  });
});
