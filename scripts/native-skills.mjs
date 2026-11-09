// Extract the fixed upstream implementations and their statically named dependencies.
// Generated files are build artifacts. The upstream GPL license applies to them.
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export async function nativeSkills(core, output) {
  const require = createRequire(
    realpathSync(resolve(core, "node_modules/vite/package.json")),
  );
  const { parseAst } = await import(
    pathToFileURL(require.resolve("rollup/parseAst"))
  );
  const skills = new Map(),
    translations = new Map();
  for (const dir of readdirSync(resolve(core, "character"), {
    withFileTypes: true,
  })) {
    if (!dir.isDirectory() || dir.name === "jiaoguosha") continue;
    for (const [file, variable, map] of [
      ["skill.js", "skills", skills],
      ["translate.js", "translates", translations],
    ]) {
      let text;
      try {
        text = readFileSync(
          resolve(core, "character", dir.name, file),
          "utf8",
        ).replace(/^\uFEFF/, "");
      } catch {
        continue;
      }
      const ast = parseAst(text);
      const decl = ast.body
        .flatMap((n) =>
          n.type === "VariableDeclaration" ? n.declarations : [],
        )
        .find((n) => n.id.name === variable);
      if (!decl?.init?.properties) continue;
      for (const p of decl.init.properties) {
        const key = p.key?.name || p.key?.value;
        if (key)
          map.set(key, { source: dir.name, code: text.slice(p.start, p.end) });
      }
    }
  }
  const roots = [
    "new_yajiao",
    "clanhuanjia",
    "starjiaohao",
    "yanjiao",
    "jiaozhao",
    "oljiaowei",
    "jiaozi",
    "starjiaowang",
    "spyingjia",
    "shanjia",
    "jiaojin",
    "zhaxiang",
    "dbzhuifeng",
    "xinzhilve",
    "qiangxi",
    "weikui",
    "zhanyi",
    "aocai",
    "olxiaofan",
  ];
  const selected = new Set();
  function include(name) {
    if (selected.has(name) || !skills.has(name)) return;
    selected.add(name);
    const code = skills.get(name).code;
    for (const match of code.matchAll(
      /(?:lib\.skill\.([\w]+)|["']([\w]+)["'])/g,
    )) {
      const key = match[1] || match[2];
      if (skills.has(key)) include(key);
      else {
        // Named subskills are registered by the engine from their parent's subSkill object.
        const parent = [...skills.keys()]
          .filter((k) => key.startsWith(k + "_"))
          .sort((a, b) => b.length - a.length)[0];
        if (parent) include(parent);
      }
    }
  }
  for (const name of roots) {
    if (!skills.has(name)) throw Error(`Missing upstream skill ${name}`);
    include(name);
  }
  const keys = [...selected].sort();
  const translate = [...translations].filter(([key]) =>
    keys.some((k) => key === k || key.startsWith(k + "_")),
  );
  writeFileSync(
    resolve(output, "native.js"),
    `// Derived from pinned libnoname/noname; GPL-3.0-only.\nimport {lib,game,ui,get,ai,_status} from 'noname';\nexport const native = {\n${keys.map((k) => skills.get(k).code).join(",\n")}\n};\nexport const nativeTranslate = {\n${translate.map(([, v]) => v.code).join(",\n")}\n};\n`,
  );
  console.log(`胶国杀专属技能依赖：${keys.length} 个上游技能。`);
}
