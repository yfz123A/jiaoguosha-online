// Fast iteration for pack-only changes; a fresh checkout still uses npm run build.
import { cpSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nativeSkills } from "./native-skills.mjs";
import { buildArtwork } from "./build-artwork.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  core = resolve(root, "vendor/noname/apps/core");
cpSync(
  resolve(root, "game/jiaoguosha"),
  resolve(core, "character/jiaoguosha"),
  { recursive: true },
);
await nativeSkills(core, resolve(core, "character/jiaoguosha"));
const { build } = await import(
  pathToFileURL(
    realpathSync(resolve(core, "node_modules/vite/dist/node/index.js")),
  )
);
await build({
  root: core,
  configFile: false,
  build: {
    target: ["chrome91", "safari16.4"],
    minify: false,
    emptyOutDir: false,
    outDir: resolve(root, "dist/game/character"),
    rollupOptions: {
      input: { jiaoguosha: resolve(core, "character/jiaoguosha/index.js") },
      external: ["noname"],
      output: { entryFileNames: "[name].js", chunkFileNames: "[name].js" },
    },
  },
});
await buildArtwork();
const file = resolve(root, "dist/game/boot-manifest.json"),
  manifest = JSON.parse(readFileSync(file, "utf8"));
manifest.version = Date.now().toString(36);
writeFileSync(file, JSON.stringify(manifest));
