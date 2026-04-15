import type { Extension } from "@codemirror/state";
import type { Root } from "mdast";
import type { Plugin } from "unified";

export interface ParserLike {
  parse(markdown: string): Root;
}

export interface EditorConfig {
  container: HTMLElement;
  initialValue?: string;
  parser?: ParserLike;
  plugins?: NexusPlugin[];
  onChange?: (doc: string, ast: Root) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface EditorAPI {
  getDocument(): string;
  setDocument(next: string): void;
  focus(): void;
  blur(): void;
  runShortcut(key: string): boolean;
  destroy(): void;
}

export interface NexusPlugin {
  name: string;
  shortcuts?: Array<{ key: string; run: (editor: EditorAPI) => boolean }>;
  remarkPlugins?: Array<Plugin<[], Root, Root>>;
  cmExtensions?: Extension[];
}
