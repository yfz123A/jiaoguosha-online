import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
export function startTunnel({ binary, port, onURL, onError }) {
  if (!existsSync(binary))
    throw Error(
      "缺少外网连接工具，请运行 scripts/download-tunnel.ps1，或双击“外网联机.cmd”。",
    );
  const child = spawn(
    binary,
    [
      "tunnel",
      "--no-autoupdate",
      "--protocol",
      "http2",
      "--url",
      `http://127.0.0.1:${port}`,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let found = false,
    registered = false,
    url,
    tail = "";
  const consume = (buffer) => {
    tail = (tail + buffer.toString()).slice(-10000);
    const match = tail.match(
      /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/,
    );
    if (match) url = match[0] + "/";
    if (tail.includes("Registered tunnel connection")) registered = true;
    if (url && registered && !found) {
      found = true;
      onURL(url);
    }
  };
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  child.on("error", onError);
  child.on("exit", (code, signal) => {
    if (code && !signal)
      onError(Error(`外网连接已停止（${code}）。本地房间仍可使用。`));
  });
  const timeout = setTimeout(() => {
    if (!found)
      onError(Error("外网入口尚未建立，请检查网络后重试；本地房间仍可使用。"));
  }, 60000);
  timeout.unref();
  return {
    stop() {
      clearTimeout(timeout);
      child.kill();
    },
    process: child,
  };
}
