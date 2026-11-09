import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createApp } from "../server/index.mjs";

async function fixture(t) {
  const app = await createApp({ adminToken: "test-admin" });
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.port}`;
  async function request(path, data, { cookie, admin, origin: source } = {}) {
    const res = await fetch(origin + path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(admin ? { Authorization: "Bearer test-admin" } : {}),
        ...(source ? { Origin: source } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return {
      status: res.status,
      cookie: res.headers.get("set-cookie")?.split(";")[0],
      body: await res.json(),
    };
  }
  const host = await request(
    "/api/room",
    { nickname: "房主", password: "test1234", players: 4 },
    { admin: true },
  );
  return { app, origin, request, host };
}

test("host-only creation, password authentication, nickname validation and room capacity", async (t) => {
  const { request, host } = await fixture(t);
  assert.equal(host.status, 200);
  assert.equal(
    (
      await request("/api/room", {
        nickname: "冒充房主",
        password: "abcd",
        players: 4,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/join", { nickname: "玩家甲", password: "wrong" }))
      .status,
    403,
  );
  assert.equal(
    (await request("/api/join", { nickname: "<img>", password: "test1234" }))
      .status,
    400,
  );
  const first = await request("/api/join", {
    nickname: "玩家甲",
    password: "test1234",
  });
  assert.equal(first.status, 200);
  assert.ok(first.cookie);
  assert.equal(
    (await request("/api/session", null, { cookie: first.cookie })).body
      .nickname,
    "玩家甲",
  );
  assert.equal(
    (await request("/api/join", { nickname: "玩家甲", password: "test1234" }))
      .status,
    409,
  );
  for (const nickname of ["玩家乙", "玩家丙"])
    assert.equal(
      (await request("/api/join", { nickname, password: "test1234" })).status,
      200,
    );
  assert.equal(
    (await request("/api/join", { nickname: "玩家丁", password: "test1234" }))
      .status,
    409,
  );
  assert.equal(
    (await request("/api/end", {}, { cookie: first.cookie })).status,
    403,
  );
});

test("cross-origin room mutations and unauthenticated websocket upgrades are rejected", async (t) => {
  const { request, origin, host } = await fixture(t);
  assert.equal(
    (
      await request(
        "/api/end",
        {},
        { cookie: host.cookie, origin: "https://unrelated.invalid" },
      )
    ).status,
    403,
  );
  const ws = new WebSocket(origin.replace("http:", "ws:") + "/socket", {
    origin,
  });
  const code = await new Promise((resolve) => {
    ws.on("unexpected-response", (_req, res) => {
      resolve(res.statusCode);
      res.resume();
      ws.terminate();
    });
    ws.on("error", () => {});
  });
  assert.equal(code, 401);
});

test("AI fill is an explicit host room option and cannot be enabled by joining players", async (t) => {
  const { request, host } = await fixture(t);
  assert.equal(host.body.fillAI, false);
  assert.equal(
    (
      await request(
        "/api/room",
        {
          nickname: "测试房主",
          password: "test1234",
          players: 4,
          fillAI: "true",
        },
        { cookie: host.cookie },
      )
    ).status,
    400,
  );
  const room = await request(
    "/api/room",
    { nickname: "测试房主", password: "test1234", players: 6, fillAI: true },
    { cookie: host.cookie },
  );
  assert.equal(room.status, 200);
  assert.equal(room.body.fillAI, true);
  assert.equal((await request("/api/status")).body.room.fillAI, true);
  const guest = await request("/api/join", {
    nickname: "真人朋友",
    password: "test1234",
    fillAI: false,
  });
  assert.equal(guest.status, 200);
  assert.equal(guest.body.fillAI, true);
});

test("relay binds game identities to authenticated sessions and excludes new arrivals after start", async (t) => {
  const { request, origin, host, app } = await fixture(t);
  const guest = await request("/api/join", {
    nickname: "玩家甲",
    password: "test1234",
  });
  function connect(session) {
    const ws = new WebSocket(origin.replace("http:", "ws:") + "/socket", {
      origin,
      headers: { Cookie: session.cookie },
    });
    const messages = [];
    ws.on("message", (b) => messages.push(JSON.parse(b.toString())));
    ws.messages = messages;
    return ws;
  }
  async function next(ws, type) {
    for (let i = 0; i < 100; i++) {
      const at = ws.messages.findIndex((m) => m[0] === type);
      if (at >= 0) return ws.messages.splice(at, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("Timed out: " + type);
  }
  const owner = connect(host);
  await once(owner, "open");
  await next(owner, "roomlist");
  owner.send(JSON.stringify(["server", "key", [host.body.onlineKey]]));
  owner.send(
    JSON.stringify(["server", "create", host.body.roomKey, "房主", "caocao"]),
  );
  await next(owner, "createroom");
  owner.send(
    JSON.stringify(["server", "config", { gameStarted: false, number: 4 }]),
  );
  const player = connect(guest);
  await once(player, "open");
  await next(player, "roomlist");
  player.send(JSON.stringify(["server", "key", [guest.body.onlineKey]]));
  player.send(
    JSON.stringify(["server", "enter", guest.body.roomKey, "玩家甲", "caocao"]),
  );
  const [, wsid] = await next(owner, "onconnection");
  owner.send(
    JSON.stringify([
      "server",
      "send",
      wsid,
      JSON.stringify(["init", "seat-1", {}]),
    ]),
  );
  await next(player, "init");
  player.send(
    JSON.stringify(["init", 1, { id: "someone-elses-seat", nickname: "冒充" }]),
  );
  const forwarded = JSON.parse((await next(owner, "onmessage"))[2]);
  assert.equal(forwarded[2].id, "seat-1");
  assert.equal(forwarded[2].nickname, "玩家甲");
  owner.send(
    JSON.stringify(["server", "config", { gameStarted: true, number: 4 }]),
  );
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    (await request("/api/join", { nickname: "新玩家", password: "test1234" }))
      .status,
    409,
  );
  player.close();
  await next(owner, "onclose");
  const reconnect = connect(guest);
  await once(reconnect, "open");
  await next(reconnect, "roomlist");
  reconnect.send(JSON.stringify(["server", "key", [guest.body.onlineKey]]));
  reconnect.send(JSON.stringify(["server", "enter", guest.body.roomKey]));
  assert.ok((await next(owner, "onconnection"))[1]);
  owner.close();
  await next(reconnect, "selfclose");
  assert.equal(app.state.room.ended, true);
});
