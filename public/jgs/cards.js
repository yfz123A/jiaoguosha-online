const grid = document.getElementById("cards");
const status = document.getElementById("status");
const viewer = document.getElementById("viewer");
const full = document.getElementById("full-card");
let cards = [];
function show(card) {
  document.getElementById("card-name").textContent = card.name;
  document.getElementById("original").href = card.image;
  full.alt = card.name + (card.title ? " · " + card.title : "");
  full.src = card.image;
  viewer.showModal();
  viewer.scrollTop = 0;
}
function render(category) {
  grid.replaceChildren();
  grid.classList.toggle("references", category !== "heroes");
  document
    .querySelectorAll("[data-category]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.category === category)),
    );
  for (const card of cards.filter((c) => c.category === category)) {
    const button = document.createElement("button");
    button.className = "card" + (category === "heroes" ? "" : " reference");
    button.dataset.id = card.id;
    const image = new Image();
    image.src = card.thumbnail;
    image.alt = "";
    image.loading = "lazy";
    const name = document.createElement("strong");
    name.textContent = card.name;
    button.append(image, name);
    if (card.title) {
      const title = document.createElement("small");
      title.textContent = card.title;
      button.append(title);
    }
    button.onclick = () => show(card);
    grid.append(button);
  }
}
document.getElementById("close").onclick = () => viewer.close();
viewer.addEventListener("click", (e) => {
  if (e.target === viewer) viewer.close();
});
try {
  const response = await fetch("/image/jiaoguosha/index.json");
  if (!response.ok) throw Error("素材未就绪");
  cards = await response.json();
  status.hidden = true;
  render("heroes");
  for (const button of document.querySelectorAll("[data-category]"))
    button.onclick = () => render(button.dataset.category);
} catch {
  status.textContent =
    "资料暂时无法加载，请刷新重试；首次安装需先完成游戏构建。";
}
