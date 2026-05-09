import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function withWeixinFetchCompatibility(root: string, env: Record<string, string | undefined>): Record<string, string> {
  const next = Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const preloadPath = weixinFetchPreloadPath(root);
  if (!existsSync(preloadPath)) return next;

  const importOption = `--import ${pathToFileURL(preloadPath).href}`;
  const existing = next.NODE_OPTIONS?.trim() ?? "";
  next.NODE_OPTIONS = existing.includes(importOption) ? existing : [importOption, existing].filter(Boolean).join(" ");
  return next;
}

export function weixinFetchPreloadPath(root: string): string {
  return join(root, "core", "node", "dist", "weixin-fetch-preload.js");
}
