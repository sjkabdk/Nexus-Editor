import remarkGfm from "remark-gfm";

import type { NexusPlugin } from "@nexus/core";

export function createGfmPreset(): NexusPlugin {
  return {
    name: "preset-gfm",
    remarkPlugins: [remarkGfm]
  };
}
