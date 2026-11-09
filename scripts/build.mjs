import { execFileSync, spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeSkills } from "./native-skills.mjs";
import { buildArtwork } from "./build-artwork.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = resolve(root, "vendor/noname"),
  core = resolve(vendor, "apps/core");
if (!existsSync(resolve(core, "node_modules/vite")))
  throw Error("请先运行 npm run setup");
cpSync(
  resolve(root, "game/jiaoguosha"),
  resolve(core, "character/jiaoguosha"),
  { recursive: true },
);
await nativeSkills(core, resolve(core, "character/jiaoguosha"));
function original(path) {
  return execFileSync("git", ["show", `HEAD:apps/core/${path}`], {
    cwd: vendor,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).replace(/\r\n/g, "\n");
}
function patch(path, transform) {
  writeFileSync(resolve(core, path), transform(original(path)));
}
function replace(source, from, to) {
  if (!source.includes(from))
    throw Error(`上游补丁定位失败: ${from.slice(0, 80)}`);
  return source.replace(from, to);
}
patch("scripts/build.ts", (s) => {
  s = replace(s, 'import jit from "@noname/jit";', "");
  s = replace(
    s,
    "generateImportMap(importMap), jit()",
    "generateImportMap(importMap)",
  );
  s = replace(
    s,
    '.filter(entry => entry.isDirectory() || type !== "character")',
    `.filter(entry => ({character:['standard','jiaoguosha'],card:['standard.js','extra.js'],mode:['identity.js','connect.js']}[type]).includes(entry.name))`,
  );
  s = replace(s, "if (import.meta.main) {", "if (true) {");
  return s;
});
patch("noname/init/index.ts", (s) =>
  replace(
    s,
    "await loadConfig();",
    `await loadConfig();\n\tconst jgsPath = '/jgs/integration.js';\n\tawait (await import(/* @vite-ignore */ jgsPath)).configure({lib,game,get,_status,ui,ai});`,
  )
    .replace(
      'parseInt(localStorage.getItem(lib.configprefix + "loadtime") || "10000")',
      "120000",
    )
    .replace(
      "setTimeout(lib.init.reset, 10000)",
      "setTimeout(lib.init.reset, 120000)",
    ),
);
patch("noname/library/element/client.js", (s) =>
  replace(
    s,
    'player.unwait("ai");',
    'if (!window.__jgs) player.unwait("ai");',
  ).replace(
    "else if (lib.playerOL[this.id]) {",
    "else if (lib.playerOL[this.id] && lib.playerOL[this.id].ws === this) {",
  ),
);
patch("noname/library/element/player.js", (s) =>
  replace(
    s,
    "clearTimeout(lib.node.torespondtimeout[this.playerid]);\n\t\t\tif (this.ws",
    "clearTimeout(lib.node.torespondtimeout[this.playerid]);\n\t\t\tif (window.__jgs) return;\n\t\t\tif (this.ws",
  ).replaceAll(
    "return ui.selected.cards?.includes(card);",
    'return ui.selected.cards?.includes(card) || card.hasGaintag("eternal_jgs_back");',
  ),
);
patch("noname/get/index.js", (s) =>
  s.replaceAll(
    "return ui.selected.cards?.includes(card);",
    'return ui.selected.cards?.includes(card) || card.hasGaintag("eternal_jgs_back");',
  ),
);
patch("noname/library/element/content.ts", (s) =>
  replace(
    s,
    'if (cardInfo.noEffect || !player.getCards("j").includes(event.card)) {',
    'if (cardInfo.noEffect || event.card.hasGaintag("eternal_jgs_back") || !player.getCards("j").includes(event.card)) {',
  ),
);
patch("mode/identity.js", (s) => {
  s = replace(
    s,
    "const chooseButtonEvent = game.zhu.chooseButton(true);",
    `const reserved=window.__jgs?.session.testHero;\nif(reserved){event.list.remove(reserved);event.list2.remove(reserved);list=game.zhu===game.me?[reserved]:list.filter(n=>n!==reserved);}\nconst chooseButtonEvent = game.zhu.chooseButton(true);`,
  );
  return replace(
    s,
    'list.push([currentPlayer, [str, [event.list.randomRemove(Math.min(num, num2)), "characterx"]], selectButton, true]);',
    'list.push([currentPlayer, [str, [currentPlayer===game.me && window.__jgs?.session.testHero ? [window.__jgs.session.testHero] : event.list.randomRemove(Math.min(num, num2)), "characterx"]], selectButton, true]);',
  );
});
patch("noname/ui/create/index.js", (s) =>
  replace(
    s,
    "if (num >= lib.configOL.number - 1) {",
    "if (!window.__jgs.canStartGame()) {",
  ).replace(
    "至少要有两名玩家才能开始游戏！",
    "请等所有真人玩家入座后再开始游戏。",
  ),
);
patch(
  "game/package.js",
  (s) =>
    s +
    `\nObject.assign(window.noname_package,{character:{standard:'标准',jiaoguosha:'胶国杀'},card:{standard:'标准',extra:'军争'},mode:{identity:'身份',connect:'联机'},play:{},music:{},background:{ol_bg:'龙纹'},submode:{identity:{normal:'标准身份'}}});\n`,
);
patch("game/config.json", (s) => {
  const c = JSON.parse(s);
  Object.assign(c, {
    mode: "connect",
    show_splash: "off",
    new_tutorial: true,
    characters: ["standard", "jiaoguosha"],
    cards: ["standard", "extra"],
    extensions: [],
    plays: [],
    extension_auto_import: false,
    background_music: "music_off",
    background_audio: false,
    background_speak: false,
    show_auto: false,
    show_pause: false,
    connect_characters: [],
    connect_cards: [],
  });
  return JSON.stringify(c, null, 2) + "\n";
});
const result = spawnSync(
  process.execPath,
  [resolve(root, "node_modules/tsx/dist/cli.mjs"), "scripts/build.ts"],
  { cwd: core, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
const output = resolve(root, "dist/game");
mkdirSync(output, { recursive: true });
cpSync(resolve(core, "dist"), output, { recursive: true });
cpSync(resolve(core, "image"), resolve(output, "image"), { recursive: true });
await buildArtwork(output);
cpSync(resolve(vendor, "LICENSE"), resolve(output, "LICENSE"));
// The production entry uses only precompiled JS, without the development file server or JIT service worker.
let html = readFileSync(resolve(output, "index.html"), "utf8").replace(
  "<title>无名杀</title>",
  "<title>胶国杀 · 朋友局</title>",
);
html = html.replace(
  "</head>",
  '<link rel="stylesheet" href="/jgs/game.css"></head>',
);
html = html.replace(
  /<link[^>]+rel="modulepreload"[^>]+href="\.\/vue"[^>]*>/g,
  "",
);
html = html.replace(/<script[^>]+src="(?:\.\/)?vue"[^>]*><\/script>/g, "");
// Preserve module names used by the engine's serialized functions, but avoid hundreds of simultaneous tunnel requests.
const modules = [
  ...html.matchAll(
    /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g,
  ),
].map((m) => m[1].replace(/^\.\//, "/"));
modules.push(
  "/character/standard.js",
  "/character/jiaoguosha.js",
  "/card/standard.js",
  "/card/extra.js",
  "/mode/identity.js",
  "/mode/connect.js",
  "/game/config.json",
  "/game/package.js",
);
writeFileSync(
  resolve(output, "boot-manifest.json"),
  JSON.stringify({
    version: Date.now().toString(36),
    modules: [...new Set(modules)],
  }),
);
html = html
  .replace(/<script[^>]+type="module"[^>]+src="[^"]+"[^>]*><\/script>/g, "")
  .replace(/<link[^>]+rel="modulepreload"[^>]*>/g, "");
html = html.replace(
  "</head>",
  '<script type="module" src="/jgs/boot.js"></script></head>',
);
writeFileSync(resolve(output, "index.html"), html);
console.log("胶国杀网页构建完成：dist/game。运行 npm start 开局。");
