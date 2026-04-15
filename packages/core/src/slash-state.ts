import type { SlashCommandDef } from "./types";

export interface SlashMatch {
  from: number;
  to: number;
  query: string;
}

export function getSlashMatch(doc: string, cursor: number): SlashMatch | null {
  const before = doc.slice(0, cursor);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.slice(lineStart);
  const slashIndex = line.lastIndexOf("/");

  if (slashIndex < 0) return null;

  const charBefore = slashIndex > 0 ? line[slashIndex - 1] : undefined;
  if (charBefore !== undefined && charBefore.trim() !== "") return null;

  const query = line.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    from: lineStart + slashIndex,
    to: cursor,
    query,
  };
}

export function filterSlashCommands(
  commands: SlashCommandDef[],
  query: string
): SlashCommandDef[] {
  if (query === "") return commands;

  const lower = query.toLowerCase();
  return commands.filter((cmd) => {
    if (cmd.title.toLowerCase().includes(lower)) return true;
    return cmd.keywords?.some((kw) => kw.toLowerCase().includes(lower)) ?? false;
  });
}

export function computeSlashState(
  doc: string,
  cursor: number,
  commands: SlashCommandDef[]
): { isOpen: boolean; from: number | null; to: number | null; query: string; commands: SlashCommandDef[] } {
  const match = getSlashMatch(doc, cursor);
  if (!match) {
    return { isOpen: false, from: null, to: null, query: "", commands: [] };
  }

  return {
    isOpen: true,
    from: match.from,
    to: match.to,
    query: match.query,
    commands: filterSlashCommands(commands, match.query),
  };
}
