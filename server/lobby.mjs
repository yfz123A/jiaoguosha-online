import { randomBytes } from "node:crypto";

// The wire messages follow libnoname/noname's room relay protocol.
// Authentication and the single-room lifecycle belong to the local HTTP server.
export function createLobby(wss, state) {
  const clients = new Map();
  let owner;
  let config;
  const id = () => randomBytes(12).toString("hex");
  const send = (ws, ...args) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify(args));
  };
  const list = () =>
    owner && config
      ? [
          [
            owner.session.nickname,
            "caocao",
            config,
            clients.size,
            state.room.key,
          ],
        ]
      : [];
  const update = () => {
    for (const ws of clients.values())
      if (!ws.owner && ws !== owner) send(ws, "updaterooms", list(), []);
  };
  const reset = () => {
    owner = undefined;
    config = undefined;
    for (const ws of clients.values()) {
      send(ws, "selfclose");
      ws.close(4000, "房主结束了本局");
    }
    clients.clear();
  };
  state.resetLobby = reset;
  wss.on("connection", (ws, req, session) => {
    ws.session = session;
    ws.wsid = id();
    ws.alive = true;
    ws.on("pong", () => {
      ws.alive = true;
    });
    clients.set(ws.wsid, ws);
    send(ws, "roomlist", list(), [], [], ws.wsid);
    ws.on("message", (data) => {
      const raw = data.toString();
      if (raw === "heartbeat") return;
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return ws.close(1008, "Invalid message");
      }
      if (!Array.isArray(message)) return ws.close(1008, "Invalid message");
      if (ws.owner) {
        // A session can only reclaim its own engine identity.
        if (message[0] === "init" && message[2]) {
          if (session.engineId) message[2].id = session.engineId;
          else delete message[2].id;
          message[2].nickname = session.nickname;
        }
        return send(ws.owner, "onmessage", ws.wsid, JSON.stringify(message));
      }
      if (message.shift() !== "server") return;
      const [type, ...args] = message;
      if (type === "key") {
        if (args[0]?.[0] !== session.onlineKey)
          return ws.close(1008, "Invalid identity");
        ws.identified = true;
        return;
      }
      if (!ws.identified) return ws.close(1008, "Authentication required");
      if (type === "create") {
        if (session.role !== "host" || owner || args[0] !== state.room.key)
          return send(ws, "enterroomfailed");
        owner = ws;
        send(ws, "createroom", state.room.key);
      } else if (type === "config" && ws === owner) {
        config = {
          ...args[0],
          number: state.room.players,
          player_number: String(state.room.players),
          observe: false,
          observe_handcard: false,
        };
        state.room.started = !!config.gameStarted;
        update();
      } else if (type === "enter") {
        if (args[0] !== state.room.key || !owner || !config)
          return send(ws, "enterroomfailed");
        if (state.room.started && !session.engineId)
          return send(ws, "denied", "gaming");
        for (const other of clients.values()) {
          if (other !== ws && other.session === session && other.owner) {
            other.replaced = true;
            send(owner, "onclose", other.wsid);
            other.close(4001, "在另一个页面重新连接");
          }
        }
        ws.owner = owner;
        send(owner, "onconnection", ws.wsid);
      } else if (type === "send" && ws === owner) {
        const target = clients.get(args[0]);
        if (target?.owner !== ws) return;
        try {
          const payload = JSON.parse(args[1]);
          if (payload[0] === "init") target.session.engineId = payload[1];
          target.send(args[1]);
        } catch {
          target.close(1008);
        }
      } else if (type === "close" && ws === owner) {
        const target = clients.get(args[0]);
        if (target?.owner === ws) target.close();
      } else if (type === "changeAvatar") {
        update();
      }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      clients.delete(ws.wsid);
      if (ws === owner) {
        state.room.started = false;
        state.room.ended = true;
        reset();
      } else if (ws.owner === owner && !ws.replaced) {
        send(owner, "onclose", ws.wsid);
      }
      update();
    });
  });
  const timer = setInterval(() => {
    for (const ws of clients.values()) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 15000);
  timer.unref();
  return {
    close() {
      clearInterval(timer);
      reset();
    },
    count: () => clients.size,
  };
}
