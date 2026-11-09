// Fetch into the browser HTTP cache before evaluating the upstream entry module.
// Six bounded requests per player stay below the free relay's concurrent-request limit.
const panel = document.createElement("div");
panel.id = "jgs-loading";
panel.style.cssText =
  "position:fixed;inset:0;z-index:20000;background:#151c1a;color:#ead9b7;display:grid;place-content:center;text-align:center;font:16px system-ui;gap:18px;padding:30px";
const title = document.createElement("strong");
title.textContent = "正在准备牌桌";
const progress = document.createElement("span");
progress.textContent = "首次加载需要一点时间，请保持页面打开。";
panel.append(title, progress);
document.body.append(panel);
try {
  const response = await fetch("/boot-manifest.json", { cache: "no-store" });
  if (!response.ok) throw Error("未能读取游戏文件清单");
  const { modules, version } = await response.json();
  let cursor = 0,
    done = 0;
  const cache =
    localStorage.getItem("jgs-build-version") === version
      ? "default"
      : "reload";
  async function fetchModule(path) {
    for (let retry = 0; ; retry++) {
      try {
        const r = await fetch(path, { cache });
        if (!r.ok) throw Error(`文件加载失败（${r.status}）`);
        await r.arrayBuffer();
        return;
      } catch (e) {
        if (retry >= 2) throw e;
        await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
      }
    }
  }
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < modules.length) {
        const path = modules[cursor++];
        await fetchModule(path);
        progress.textContent = `正在加载 ${Math.round((++done / modules.length) * 100)}% · 下次进入会更快`;
      }
    }),
  );
  localStorage.setItem("jgs-build-version", version);
  progress.textContent = "正在连接房间…";
  await import("/noname/entry.js");
} catch (e) {
  title.textContent = "暂时未能打开牌桌";
  progress.textContent = `${e.message}。请确认房主仍在线，稍后重试。`;
  const retry = document.createElement("button");
  retry.textContent = "重新加载";
  retry.onclick = () => location.reload();
  panel.append(retry);
}
