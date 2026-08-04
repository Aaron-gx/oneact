import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [resolve(here, "src/index.ts")],
  bundle: true, format: "cjs", platform: "node", target: "node18",
  outfile: resolve(here, "dist/mcp.cjs"),
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
console.log("✓ built dist/mcp.cjs");
