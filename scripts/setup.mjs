import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = resolve(root, "vendor/noname");
const upstream = JSON.parse(readFileSync(resolve(root, "upstream.json")));
function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: vendor,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    ...options,
  });
}
mkdirSync(resolve(root, "vendor"), { recursive: true });
let proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (!proxy && process.platform === "win32") {
  try {
    proxy = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$u=[Uri]'https://github.com';$p=[System.Net.WebRequest]::GetSystemWebProxy().GetProxy($u);if($p -ne $u){$p.AbsoluteUri}",
      ],
      { encoding: "utf8" },
    ).trim();
  } catch {}
}
const proxyArgs = proxy ? ["-c", `http.proxy=${proxy}`] : [];
if (!existsSync(resolve(vendor, ".git"))) {
  execFileSync(
    "git",
    [
      ...proxyArgs,
      "clone",
      "--filter=blob:none",
      "--depth",
      "1",
      "--no-checkout",
      upstream.repository,
      vendor,
    ],
    { stdio: "inherit" },
  );
}
if (proxy) git(["config", "--local", "http.https://github.com/.proxy", proxy]);
const head = git(["rev-parse", "HEAD"], {
  encoding: "utf8",
  stdio: "pipe",
}).trim();
if (head !== upstream.commit)
  git(["fetch", "--depth", "1", "origin", upstream.commit]);
const base = [
  "/*",
  "!/apps/electron/",
  "!/apps/mobile/",
  "!/apps/core/image/*",
  "!/apps/core/audio/",
  "!/apps/core/font/",
];
git(["sparse-checkout", "set", "--no-cone", "--stdin"], {
  input: base.join("\n") + "\n",
});
git(["checkout", "--detach", upstream.commit]);
const { default: characters } = await import(
  pathToFileURL(resolve(vendor, "apps/core/character/standard/character.js"))
);
const patterns = [
  ...base,
  "/apps/core/font/",
  "/apps/core/image/card/",
  "/apps/core/image/background/",
  "!/apps/core/image/background/*",
  "/apps/core/image/background/ol_bg.jpg",
  "/apps/core/image/character/",
  "!/apps/core/image/character/*",
  "/apps/core/image/character/hidden_image.jpg",
];
patterns.push(
  "/apps/core/image/character/default_silhouette_male.jpg",
  "/apps/core/image/character/default_silhouette_female.jpg",
);
for (const [name, data] of Object.entries(characters))
  patterns.push("/apps/core/" + (data.img || `image/character/${name}.jpg`));
git(["sparse-checkout", "set", "--no-cone", "--stdin"], {
  input: patterns.join("\n") + "\n",
});
copyFileSync(resolve(vendor, "LICENSE"), resolve(root, "LICENSE"));
console.log("安装已固定版本的网页底座依赖…");
const install = spawnSync("pnpm --filter noname... install --frozen-lockfile", {
  cwd: vendor,
  shell: true,
  stdio: "inherit",
});
if (install.status !== 0) process.exit(install.status || 1);
console.log("底座准备完成。运行 npm run build 构建游戏。");
