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
    "设置人数和口令。等朋友全部入座后，在牌桌中开始游戏。";
  $("player-label").hidden = false;
  $("submit").textContent = "创建房间 →";
}
if (isHost) hostView();
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
  try {
    const nickname = $("nickname").value.trim();
    await api(isHost ? "/api/room" : "/api/join", {
      nickname,
      password: $("password").value,
      players: Number($("players").value),
    });
    localStorage.setItem("jgs-nickname", nickname);
    localStorage.setItem("gplv3_noname_alerted", "true");
    location.assign("/play");
  } catch (e) {
    $("error").textContent = e.message;
    $("submit").disabled = false;
  }
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
            : `${s.room.connected} / ${s.room.players} 人已连接`;
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
setInterval(update, 5000);
