const $ = (id) => document.getElementById(id);
const hash = new URLSearchParams(location.hash.slice(1));
const hostToken = hash.get("host");
if (hostToken) {
  sessionStorage.setItem("jgs-host-token", hostToken);
  history.replaceState(null, "", location.pathname);
}
let isHost = !!sessionStorage.getItem("jgs-host-token");
async function api(path, body) {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(isHost
              ? {
                  Authorization: `Bearer ${sessionStorage.getItem("jgs-host-token")}`,
                }
              : {}),
          },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "连接失败");
  return data;
}
function hostView() {
  $("heading").textContent = "准备今晚的牌局";
  $("hint").textContent =
    "自己测试可直接创建单人测试房。和朋友玩时，在下面设置总人数、口令及开局方式。";
  $("player-label").hidden = false;
  $("ai-label").hidden = false;
  $("quick-test").hidden = false;
  $("pack-label").hidden = false;
  $("hero-label").hidden = false;
  $("submit").textContent = "创建房间 →";
}
if (isHost) hostView();
const roster = await fetch("/jgs/roster.json").then((r) => r.json());
for (const hero of roster) {
  const option = document.createElement("option");
  option.value = hero.id;
  option.textContent = `${hero.name} · ${hero.title}`;
  $("test-hero").append(option);
}
$("character-pack").onchange = () => {
  if ($("character-pack").value === "standard") $("test-hero").value = "";
  $("test-hero").disabled = $("character-pack").value === "standard";
};
$("test-hero").onchange = () => {
  if ($("test-hero").value) $("fill-ai").value = "true";
};
$("fill-ai").onchange = () => {
  if ($("fill-ai").value === "false") $("test-hero").value = "";
};
$("nickname").value = localStorage.getItem("jgs-nickname") || "";
try {
  const session = await api("/api/session");
  isHost = session.role === "host";
  if (isHost) hostView();
  $("nickname").value = session.nickname;
  $("resume").hidden = false;
} catch {}
$("resume").onclick = () => location.assign("/play");
$("entry").onsubmit = async (event) => {
  event.preventDefault();
  $("error").textContent = "";
  $("submit").disabled = true;
  $("quick-test").disabled = true;
  try {
    const nickname = $("nickname").value.trim();
    await api(isHost ? "/api/room" : "/api/join", {
      nickname,
      password: $("password").value,
      players: Number($("players").value),
      fillAI: $("fill-ai").value === "true",
      characterPack: $("character-pack").value,
      testHero: $("test-hero").value || undefined,
    });
    localStorage.setItem("jgs-nickname", nickname);
    localStorage.setItem("gplv3_noname_alerted", "true");
    location.assign("/play");
  } catch (e) {
    $("error").textContent = e.message;
    $("submit").disabled = false;
    $("quick-test").disabled = false;
  }
};
$("quick-test").onclick = () => {
  if (!$("nickname").value.trim()) $("nickname").value = "测试玩家";
  if (!$("password").value) $("password").value = crypto.randomUUID();
  $("fill-ai").value = "true";
  $("entry").requestSubmit();
};
async function update() {
  try {
    const s = await api("/api/status");
    $("status").textContent = !s.ready
      ? "正在准备游戏"
      : !s.room
        ? "等待房主开房"
        : s.room.ended
          ? "本局已结束"
          : s.room.started
            ? "对局进行中"
            : `${s.room.connected} / ${s.room.players} 真人已连接${s.room.fillAI ? " · 空位补人机" : ""}`;
    if (isHost) {
      $("share").hidden = false;
      const pending = s.networkMode === "public" && !s.invite;
      $("invite").value = pending
        ? s.tunnelError || "正在建立外网入口…"
        : s.invite || location.origin + "/";
      $("copy").disabled = pending;
    }
  } catch {
    $("status").textContent = "暂时无法连接房主";
  }
}
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("invite").value);
    $("copy").textContent = "已复制";
  } catch {
    $("invite").select();
    $("copy").textContent = "请复制上方链接";
  }
};
await update();
$("submit").disabled = false;
$("quick-test").disabled = false;
setInterval(update, 5000);
