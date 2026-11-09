// Preserve supplied print files. WebP is a web delivery copy; SVG viewports
// display the art area without changing or regenerating the original artwork.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function buildArtwork(output = resolve(root, "dist/game")) {
  const source = resolve(root, "武将资料");
  const heroes = resolve(source, "武将牌-通用牌背20张");
  const roster = JSON.parse(
    readFileSync(resolve(root, "game/jiaoguosha/roster.json"), "utf8"),
  );
  const artwork = JSON.parse(
    readFileSync(resolve(root, "game/jiaoguosha/artwork.json"), "utf8"),
  );
  const cards = resolve(output, "image/jiaoguosha");
  const portraits = resolve(output, "image/character");
  mkdirSync(cards, { recursive: true });
  mkdirSync(portraits, { recursive: true });
  const manifest = [];
  for (const hero of roster) {
    const art = artwork[hero.id];
    if (!art) throw Error(`缺少将面配置：${hero.id}`);
    const prefix = `新UI.JGS${String(art.number).padStart(2, "0")}.`;
    const matches = readdirSync(heroes).filter(
      (n) => n.startsWith(prefix) && n.endsWith(`.${hero.name}.png`),
    );
    if (matches.length !== 1)
      throw Error(`将面对应不唯一：${hero.name}（${prefix}）`);
    const original = resolve(heroes, matches[0]);
    await sharp(original)
      .webp({ quality: 92 })
      .toFile(resolve(cards, `${hero.id}.webp`));
    const { data, info } = await sharp(original)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    const href = `data:image/webp;base64,${data.toString("base64")}`;
    const panels = art.panels || [art.view];
    const height = 300 / panels.length;
    const content = panels
      .map((view, i) => {
        const [x, y, w, h] = view.map(
          (v, j) => v * (j % 2 ? info.height : info.width),
        );
        return `<svg x="0" y="${i * height}" width="180" height="${height}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid slice"><image width="${info.width}" height="${info.height}" href="${href}"/></svg>`;
      })
      .join("");
    const portrait = `${hero.id}.art.svg`;
    writeFileSync(
      resolve(portraits, portrait),
      `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="300" viewBox="0 0 180 300">${content}</svg>`,
    );
    manifest.push({
      id: hero.id,
      name: hero.name,
      title: hero.title,
      category: "heroes",
      image: `/image/jiaoguosha/${hero.id}.webp`,
      thumbnail: `/image/character/${portrait}`,
    });
  }
  const extra = [
    [
      "skill-pool",
      "专属技能库",
      "rules",
      "说明卡-双面打印1张/牌面-胶国杀技能库.png",
    ],
    [
      "concepts",
      "概念和描述说明",
      "rules",
      "说明卡-双面打印1张/牌背-胶国杀概念和描述说明.png",
    ],
    ["hero-back", "通用武将牌背", "rules", "武将牌-通用牌背20张/武将牌背.jpg"],
    [
      "sisyphus-spade",
      "黑桃 · 胶石",
      "sisyphus",
      "西西弗胶附卡4张/西西弗胶卡黑桃.png",
    ],
    [
      "sisyphus-heart",
      "红桃 · 世界",
      "sisyphus",
      "西西弗胶附卡4张/西西弗胶卡红桃.png",
    ],
    [
      "sisyphus-club",
      "梅花 · 死竭",
      "sisyphus",
      "西西弗胶附卡4张/西西弗胶卡梅花.png",
    ],
    [
      "sisyphus-diamond",
      "方片 · 胶终",
      "sisyphus",
      "西西弗胶附卡4张/西西弗胶卡方片.png",
    ],
    [
      "sisyphus-back",
      "西西弗胶附卡牌背",
      "sisyphus",
      "西西弗胶附卡4张/胶终-西西弗胶牌背.png",
    ],
  ];
  for (const [id, name, category, file] of extra) {
    await sharp(resolve(source, file))
      .webp({ quality: 92 })
      .toFile(resolve(cards, `${id}.webp`));
    await sharp(resolve(source, file))
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(resolve(cards, `${id}-thumb.webp`));
    manifest.push({
      id,
      name,
      category,
      image: `/image/jiaoguosha/${id}.webp`,
      thumbnail: `/image/jiaoguosha/${id}-thumb.webp`,
    });
  }
  writeFileSync(resolve(cards, "index.json"), JSON.stringify(manifest));
  console.log(
    `将面素材完成：${roster.length} 名武将、${extra.length} 张说明/附卡/牌背。`,
  );
}
