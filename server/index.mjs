import http from "node:http";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { createLobby } from "./lobby.mjs";
import { startTunnel } from "./tunnel.mjs";
import { spawn } from "node:child_process";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
const compress = promisify(gzip);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const customHeroes = new Set(
  JSON.parse(
    await readFile(resolve(root, "game/jiaoguosha/roster.json"), "utf8"),
  ).map((r) => r.id),
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
const token = () => randomBytes(24).toString("base64url");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function createApp({
  port = 0,
  host = "127.0.0.1",
  adminToken = token(),
  gameDir = resolve(root, "dist/game"),
} = {}) {
  const sessions = new Map();
  const failures = new Map();
  const compressed = new Map();
  const state = {
    room: null,
    networkMode: "local",
    tunnelError: null,
    resetLobby: () => {},
  };
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024 * 1024,
  });
  const lobby = createLobby(wss, state);
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": mime[".json"],
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const sessionOf = (req) =>
    sessions.get(
      (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("jgs_session="))
        ?.slice(12),
    );
  const publicSession = (s) => ({
    nickname: s.nickname,
    role: s.role,
    onlineKey: s.onlineKey,
    roomKey: state.room.key,
    players: state.room.players,
    fillAI: state.room.fillAI,
    characterPack: state.room.characterPack,
    testHero: s.role === "host" ? state.room.testHero : null,
    generation: state.room.generation,
  });
  const cookie = (req, res, s) =>
    res.setHeader(
      "Set-Cookie",
      `jgs_session=${s.id}; HttpOnly; SameSite=Strict; Path=/${req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`,
    );
  const validateName = (value) =>
    typeof value === "string" && /^[\p{L}\p{N}_ ·-]{1,12}$/u.test(value.trim());
  async function body(req) {
    let text = "";
    for await (const part of req) {
      text += part;
      if (text.length > 4096) throw new Error("请求过大");
    }
    return JSON.parse(text || "{}");
  }
  async function staticFile(req, res, base, path) {
    const full = resolve(base, "." + path);
    if (
      !full.startsWith(base + sep) ||
      path.split("/").some((p) => p.startsWith(".") && p !== ".pnpm") ||
      path.includes("\\")
    )
      return json(res, 404, { error: "文件不存在" });
    let info;
    try {
      info = await stat(full);
    } catch {
      return json(res, 404, { error: "文件不存在" });
    }
    if (!info.isFile()) return json(res, 404, { error: "文件不存在" });
    const headers = {
      "Content-Type": mime[extname(full)] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control":
        extname(full) === ".html"
          ? "no-store"
          : base === resolve(root, "public")
            ? "no-cache"
            : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    if (
      info.size > 1024 &&
      /\.(js|json|css|html)$/.test(full) &&
      /\bgzip\b/.test(req.headers["accept-encoding"] || "")
    ) {
      let cached = compressed.get(full);
      if (!cached || cached.time !== info.mtimeMs) {
        cached = {
          time: info.mtimeMs,
          data: await compress(await readFile(full)),
        };
        if (compressed.size > 400) compressed.clear();
        compressed.set(full, cached);
      }
      res.writeHead(200, {
        ...headers,
        "Content-Encoding": "gzip",
        "Content-Length": cached.data.length,
        Vary: "Accept-Encoding",
      });
      return res.end(req.method === "HEAD" ? undefined : cached.data);
    }
    res.writeHead(200, headers);
    if (req.method === "HEAD") res.end();
    else createReadStream(full).pipe(res);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Referrer-Policy", "same-origin");
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      const session = sessionOf(req);
      if (req.method === "POST") {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host)
          return json(res, 403, { error: "请求来源不匹配" });
      }
      if (pathname === "/api/status" && req.method === "GET")
        return json(res, 200, {
          ready: existsSync(resolve(gameDir, "index.html")),
          room: state.room
            ? {
                players: state.room.players,
                fillAI: state.room.fillAI,
                characterPack: state.room.characterPack,
                started: state.room.started,
                ended: state.room.ended,
                connected: lobby.count(),
              }
            : null,
          invite: state.invite || null,
          networkMode: state.networkMode,
          tunnelError: state.tunnelError,
        });
      if (pathname === "/api/session" && req.method === "GET")
        return session &&
          state.room &&
          session.generation === state.room.generation
          ? json(res, 200, publicSession(session))
          : json(res, 401, { error: "请先加入房间" });
      if (pathname === "/api/room" && req.method === "POST") {
        const data = await body(req);
        if (
          !equal(
            req.headers.authorization?.replace(/^Bearer /, ""),
            adminToken,
          ) &&
          session?.role !== "host"
        )
          return json(res, 403, {
            error: "请从电脑启动窗口的房主入口创建房间",
          });
        if (
          !validateName(data.nickname) ||
          ![4, 5, 6].includes(data.players) ||
          (data.fillAI !== undefined && typeof data.fillAI !== "boolean") ||
          (data.characterPack !== undefined &&
            !["standard", "jiaoguosha", "mixed"].includes(
              data.characterPack,
            )) ||
          (data.testHero &&
            (!customHeroes.has(data.testHero) ||
              data.fillAI !== true ||
              !["jiaoguosha", "mixed"].includes(data.characterPack))) ||
          typeof data.password !== "string" ||
          data.password.length < 4 ||
          data.password.length > 64
        )
          return json(res, 400, {
            error: "昵称需1–12个文字或数字，口令需4–64位，人数为4–6人",
          });
        state.resetLobby();
        sessions.clear();
        failures.clear();
        const generation = token(),
          salt = token(),
          key = token();
        state.room = {
          players: data.players,
          fillAI: data.fillAI === true,
          characterPack: data.characterPack || "standard",
          testHero: data.testHero || null,
          salt,
          digest: scryptSync(data.password, salt, 32),
          key,
          generation,
          started: false,
          ended: false,
        };
        const s = {
          id: token(),
          role: "host",
          nickname: data.nickname.trim(),
          onlineKey: key,
          generation,
        };
        sessions.set(s.id, s);
        cookie(req, res, s);
        return json(res, 200, publicSession(s));
      }
      if (pathname === "/api/join" && req.method === "POST") {
        if (!state.room || state.room.ended)
          return json(res, 409, { error: "房主尚未开房，或本局已结束" });
        const data = await body(req);
        const ip = req.socket.remoteAddress;
        const failure = failures.get(ip);
        if (failure?.count >= 10 && Date.now() - failure.time < 60000)
          return json(res, 429, { error: "口令错误次数过多，请一分钟后再试" });
        if (
          !validateName(data.nickname) ||
          typeof data.password !== "string" ||
          data.password.length > 64
        )
          return json(res, 400, { error: "请填写有效昵称和房间口令" });
        const digest = scryptSync(data.password, state.room.salt, 32);
        if (!timingSafeEqual(digest, state.room.digest)) {
          failures.set(ip, {
            count:
              (failure && Date.now() - failure.time < 60000
                ? failure.count
                : 0) + 1,
            time: Date.now(),
          });
          return json(res, 403, { error: "房间口令不正确" });
        }
        if (session && session.generation === state.room.generation) {
          cookie(req, res, session);
          return json(res, 200, publicSession(session));
        }
        if (state.room.started)
          return json(res, 409, {
            error: "对局已开始，请使用原来的浏览器返回对局",
          });
        if (
          [...sessions.values()].some(
            (s) => s.nickname === data.nickname.trim(),
          )
        )
          return json(res, 409, { error: "这个昵称已在房间中，请换一个昵称" });
        if (sessions.size >= state.room.players)
          return json(res, 409, { error: "房间已满" });
        const s = {
          id: token(),
          role: "guest",
          nickname: data.nickname.trim(),
          onlineKey: token(),
          generation: state.room.generation,
        };
        sessions.set(s.id, s);
        cookie(req, res, s);
        return json(res, 200, publicSession(s));
      }
      if (pathname === "/api/end" && req.method === "POST") {
        if (session?.role !== "host")
          return json(res, 403, { error: "只有房主可以结束本局" });
        state.room.ended = true;
        state.resetLobby();
        return json(res, 200, { ok: true });
      }
      if (pathname.startsWith("/api/"))
        return json(res, 404, { error: "接口不存在" });
      if (!["GET", "HEAD"].includes(req.method))
        return json(res, 405, { error: "不支持的请求" });
      if (pathname === "/play/") {
        res.writeHead(302, { Location: "/play" });
        return res.end();
      }
      if (pathname === "/play") {
        if (
          !session ||
          !state.room ||
          session.generation !== state.room.generation ||
          state.room.ended
        ) {
          res.writeHead(302, { Location: "/" });
          return res.end();
        }
        return staticFile(req, res, gameDir, "/index.html");
      }
      if (pathname === "/")
        return staticFile(req, res, resolve(root, "public"), "/index.html");
      if (pathname === "/preload.js" || pathname.startsWith("/jgs/"))
        return staticFile(req, res, resolve(root, "public"), pathname);
      const moduleAlias = pathname.match(
        /^\/(mode|character|card)\/(identity|connect|standard|extra)\/index\.js$/,
      );
      if (moduleAlias)
        return staticFile(
          req,
          res,
          gameDir,
          `/${moduleAlias[1]}/${moduleAlias[2]}.js`,
        );
      return staticFile(req, res, gameDir, pathname);
    } catch (e) {
      if (!res.headersSent) json(res, 400, { error: "请求无效" });
      else res.destroy();
    }
  });
  server.on("upgrade", (req, socket, head) => {
    const session = sessionOf(req);
    let validOrigin = false;
    try {
      validOrigin =
        req.headers.origin &&
        new URL(req.headers.origin).host === req.headers.host;
    } catch {}
    if (
      req.url !== "/socket" ||
      !validOrigin ||
      !session ||
      !state.room ||
      state.room.ended ||
      session.generation !== state.room.generation
    ) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req, session),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    server,
    state,
    adminToken,
    port: server.address().port,
    close: async () => {
      lobby.close();
      wss.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!existsSync(resolve(root, "dist/game/index.html"))) {
    console.error("游戏尚未构建，请先运行 npm run setup 和 npm run build。");
    process.exit(1);
  }
  const app = await createApp({
    port: Number(process.env.PORT || 8080),
    host: process.env.HOST || "127.0.0.1",
  });
  const address = `http://localhost:${app.port}/#host=${app.adminToken}`;
  await mkdir(resolve(root, ".runtime"), { recursive: true });
  await writeFile(
    resolve(root, ".runtime/host.json"),
    JSON.stringify({ url: address, port: app.port, pid: process.pid }),
  );
  console.log(
    `\n胶国杀联机已启动\n房主入口：${address}\n朋友入口：http://localhost:${app.port}/ （异地请启动外网联机）\n关闭本窗口或按 Ctrl+C 停止。\n`,
  );
  let tunnel;
  if (process.argv.includes("--public")) {
    app.state.networkMode = "public";
    try {
      tunnel = startTunnel({
        binary: resolve(root, ".runtime/cloudflared.exe"),
        port: app.port,
        onURL: (url) => {
          app.state.invite = url;
          app.state.tunnelError = null;
          console.log(`\n朋友入口：${url}\n请把此链接和房间口令告诉朋友。\n`);
        },
        onError: (e) => {
          app.state.invite = null;
          app.state.tunnelError = e.message;
          console.error(e.message);
        },
      });
    } catch (e) {
      app.state.tunnelError = e.message;
      console.error(e.message);
    }
  }
  if (process.argv.includes("--open")) {
    if (process.platform === "win32")
      spawn("cmd.exe", ["/d", "/s", "/c", `start "" "${address}"`], {
        windowsHide: true,
        stdio: "ignore",
      });
    else
      spawn(process.platform === "darwin" ? "open" : "xdg-open", [address], {
        stdio: "ignore",
      });
  }
  const stop = async () => {
    tunnel?.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
