export async function configure({ lib, game, get, _status, ui, ai }) {
  const response = await fetch("/api/session");
  if (!response.ok) {
    location.replace("/");
    throw Error("请先加入房间");
  }
  const session = await response.json();
  const jgs = (window.__jgs = {
    lib,
    game,
    get,
    _status,
    ui,
    session,
    pending: new Map(),
    offline: new Set(),
  });
  Object.assign(lib.config, {
    mode: "connect",
    show_splash: "off",
    new_tutorial: true,
    connect_mode: "identity",
    connect_nickname: session.nickname,
    connect_avatar: "caocao",
    characters: ["standard", "jiaoguosha"],
    cards: ["standard", "extra"],
    extensions: [],
    extension_auto_import: false,
    connect_characters: [],
    connect_cards: [],
    show_auto: false,
    show_pause: false,
    background_music: "music_off",
    background_audio: false,
    background_speak: false,
    totouched: true,
    touchscreen: matchMedia("(pointer:coarse)").matches,
    phonelayout: matchMedia("(pointer:coarse)").matches,
  });
  lib.config.mode_config.connect = {
    ...lib.config.mode_config.connect,
    read_clipboard: false,
    hall_button: false,
  };
  delete lib.config.directstartmode;
  delete lib.config.tmp_owner_roomId;
  delete lib.config.tmp_user_roomId;
  if (localStorage.getItem("jgs-generation") !== session.generation) {
    delete lib.config.reconnect_info;
    game.saveConfig("reconnect_info");
    localStorage.setItem("jgs-generation", session.generation);
  }
  game.onlineKey = session.onlineKey;
  game.roomId = session.roomKey;
  lib.configOL.mode = "identity";
  const wsURL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/socket`;
  // This socket serves the exact same app as the page; external servers retain the upstream trust check.
  const requireSandbox = game.requireSandboxOn;
  game.requireSandboxOn = function (ip) {
    if (ip !== wsURL) return requireSandbox.call(this, ip);
  };
  lib.config.card_style = "default";
  const connectPlayers = ui.create.connectPlayers;
  ui.create.connectPlayers = function (...args) {
    const value = connectPlayers.apply(this, args);
    document.getElementById("jgs-loading")?.remove();
    if (ui.connectStartBar)
      ui.connectStartBar.firstChild.textContent = `${session.players}人标准身份局 · ${session.fillAI ? "点击开始，空位由人机补齐" : "等待朋友入座"}`;
    ui.connectShareButton?.hide();
    return value;
  };
  const roomInfo = ui.create.roomInfo;
  ui.create.roomInfo = function (...args) {
    const value = roomInfo.apply(this, args);
    ui.roomInfo?.hide();
    return value;
  };
  lib.onload2.push(() => {
    const connect = lib.imported.mode.connect;
    const start = connect.start;
    connect.start = async function (...args) {
      await start.apply(this, args);
      if (ui.ipnode) {
        ui.ipnode.textContent = wsURL;
        ui.ipbutton.click();
      }
    };
  });
  const switchMode = game.switchMode;
  game.switchMode = function (name, config) {
    if (name === "identity") {
      const defaults = {};
      for (const [key, item] of Object.entries(lib.mode.identity.connect)) {
        if (key.startsWith("connect_") && item && "init" in item)
          defaults[key.slice(8)] = item.init;
      }
      config = {
        ...defaults,
        mode: "identity",
        identity_mode: "normal",
        player_number: String(session.players),
        number: session.players,
        characterPack:
          session.characterPack === "jiaoguosha"
            ? ["jiaoguosha"]
            : session.characterPack === "mixed"
              ? ["standard", "jiaoguosha"]
              : ["standard"],
        cardPack: ["standard", "extra"],
        banned: ["old_re_lidian", "ganfuren", "gongsunzan"],
        bannedcards: [],
        double_character: false,
        double_nei: false,
        special_identity: false,
        enable_commoner: false,
        enable_year_limit: false,
        observe: false,
        observe_handcard: false,
        choose_timeout: 30,
        zhinang_tricks: ["guohe", "wuxie", "wuzhong"],
      };
    }
    return switchMode.call(this, name, config);
  };
  const roomlist = lib.message.client.roomlist;
  lib.message.client.roomlist = function (...args) {
    game.onlineKey = session.onlineKey;
    game.roomId = session.roomKey;
    lib.configOL.mode = "identity";
    return roomlist.apply(this, args);
  };
  lib.message.client.enterroomfailed = () => {
    _status.enteringroom = false;
    setTimeout(() => {
      if (game.ws?.readyState === 1)
        game.send(
          "server",
          "enter",
          session.roomKey,
          session.nickname,
          "caocao",
        );
    }, 1000);
  };
  lib.message.client.selfclose = () => location.replace("/");
  const reinit = lib.message.client.reinit;
  lib.message.client.reinit = function (...args) {
    document.getElementById("jgs-loading")?.remove();
    // Rejoining misses identity's initial broadcast that prunes unloaded alternate generals.
    const config = args[0],
      allowed = new Set(
        (config.characterPack || ["standard"]).flatMap((pack) =>
          Object.keys(lib.characterPack[pack] || {}),
        ),
      );
    for (const key of Object.keys(lib.characterReplace)) {
      lib.characterReplace[key] = lib.characterReplace[key].filter(
        (name) =>
          allowed.has(name) &&
          !!lib.character[name] &&
          !config.banned?.includes(name),
      );
    }
    const value = reinit.apply(this, args);
    setTimeout(() => lib.jgs?.refreshBacks(), 100);
    return value;
  };
  game.countChoose = () => {
    _status.imchoosing = true;
  };
  // The upstream engine controls seats without a client socket using its built-in AI.
  const randomMapOL = game.randomMapOL;
  game.randomMapOL = function (...args) {
    const result = randomMapOL.apply(this, args);
    if (session.fillAI) {
      const names = game.players
        .filter((p) => p !== game.me && !p.ws)
        .map((p, i) => [p.playerid, `人机·${i + 1}`]);
      game.broadcastAll(function (names) {
        for (const [id, nickname] of names) {
          const p = lib.playerOL[id];
          p.nickname = nickname;
          p.setNickname();
        }
      }, names);
    }
    return result;
  };
  jgs.canStartGame = () => {
    const seats = game.connectPlayers || [];
    const humans = seats.filter((p) => p.nickname);
    if (lib.node?.clients?.some((client) => !client.closed && !client.inited))
      return false;
    if (humans.some((p) => p.playerid !== "1" && !p.ws?.inited)) return false;
    if (session.fillAI ? humans.length < 1 : humans.length !== session.players)
      return false;
    // Clicking native empty seats must not change the chosen table size.
    lib.configOL.number = session.players;
    lib.configOL.player_number = String(session.players);
    seats.forEach((p) => p.classList.remove("unselectable2"));
    return true;
  };
  // Keep the engine's wait callbacks, but stop all timeout-driven AI choices.
  const playerProto = lib.element.Player.prototype;
  const send = playerProto.send;
  const wait = playerProto.wait;
  playerProto.wait = function (...args) {
    const result = wait.apply(this, args);
    if (this.__jgsLastSend) jgs.pending.set(this.playerid, this.__jgsLastSend);
    return result;
  };
  const unwait = playerProto.unwait;
  playerProto.unwait = function (...args) {
    jgs.pending.delete(this.playerid);
    delete this.__jgsLastSend;
    return unwait.apply(this, args);
  };
  // chooseButtonOL sends after wait(), while other choices send before wait().
  playerProto.send = function (...args) {
    if (typeof args[0] === "function") {
      this.__jgsLastSend = args;
      const waiting = lib.node?.torespond?.[this.playerid];
      if (waiting === "_noname_waiting" || waiting?._noname_waiting)
        jgs.pending.set(this.playerid, args);
    }
    return send.apply(this, args);
  };
  let release;
  let gate = Promise.resolve();
  const waitPause = _status.pauseManager.waitPause.bind(_status.pauseManager);
  _status.pauseManager.waitPause = async (...args) => {
    await gate;
    await waitPause(...args);
    await gate;
  };
  const close = lib.element.Client.prototype.close;
  lib.element.Client.prototype.close = function (...args) {
    if (
      !_status.waitingForPlayer &&
      lib.playerOL[this.id]?.ws === this &&
      !_status.over
    ) {
      if (!jgs.offline.size) gate = new Promise((r) => (release = r));
      jgs.offline.add(this.id);
      updateWaiting();
    }
    return close.apply(this, args);
  };
  const reinited = lib.message.server.reinited;
  lib.message.server.reinited = function (...args) {
    const result = reinited.apply(this, args);
    this.send(function (jokers) {
      _status.jgs_jokers = jokers;
      lib.jgs?.refreshBacks();
    }, _status.jgs_jokers || null);
    const pending = jgs.pending.get(this.id);
    if (pending) this.send(...pending);
    jgs.offline.delete(this.id);
    if (!jgs.offline.size) release?.();
    updateWaiting();
    return result;
  };
  const startGame = lib.message.server.startGame;
  lib.message.server.startGame = function (...args) {
    if (!jgs.canStartGame()) return;
    return startGame.apply(this, args);
  };
  lib.onover.push(() => {
    jgs.offline.clear();
    release?.();
    updateWaiting();
  });
  jgs.showWaiting = (names) => {
    jgs.waitingNames = names;
    const n = document.getElementById("jgs-disconnected");
    if (n) {
      n.hidden = !names.length;
      n.textContent = `正在等待 ${names.join("、")} 回来\n请使用原来的浏览器重新打开链接`;
    }
  };
  function updateWaiting() {
    const names = [...jgs.offline].map(
      (id) => lib.playerOL[id]?.nickname.replace(" - 离线", "") || "玩家",
    );
    jgs.showWaiting(names);
    game.broadcast(function (names) {
      window.__jgs?.showWaiting(names);
    }, names);
  }
  const bar = document.createElement("div");
  bar.id = "jgs-bar";
  const brand = document.createElement("strong");
  brand.textContent = "胶国杀 · 朋友局";
  bar.append(brand);
  const text = document.createElement("span");
  text.textContent = `${session.nickname} · ${session.players}人身份局 · ${session.fillAI ? "人机补位" : "可一直等待"}`;
  bar.append(text);
  const share = document.createElement("button");
  share.textContent = "邀请朋友";
  share.onclick = async () => {
    try {
      const status = await (await fetch("/api/status")).json();
      if (status.networkMode === "public" && !status.invite) {
        alert(status.tunnelError || "外网入口正在建立，请稍后再试。");
        return;
      }
      const invite = status.invite || location.origin + "/";
      try {
        await navigator.clipboard.writeText(invite);
        share.textContent = "链接已复制";
      } catch {
        prompt("复制链接，口令单独告诉朋友", invite);
      }
    } catch {
      alert("暂时无法连接房主，请稍后再试。");
    }
  };
  bar.append(share);
  if (session.role === "host") {
    const end = document.createElement("button");
    end.textContent = "结束并重开";
    end.onclick = async () => {
      if (confirm("结束当前对局，返回开房页面？")) {
        await fetch("/api/end", { method: "POST" });
        location.assign("/");
      }
    };
    bar.append(end);
  }
  const overlay = document.createElement("div");
  overlay.id = "jgs-disconnected";
  overlay.hidden = true;
  const orientation = document.createElement("div");
  orientation.id = "jgs-orientation";
  orientation.textContent = "横屏游玩，牌桌和手牌更清楚";
  document.body.append(bar, overlay, orientation);
}
