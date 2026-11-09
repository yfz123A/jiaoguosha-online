import { lib, game, ui, get, _status } from "noname";
import roster from "./roster.json";
import derivation from "./derivation.json";
import a from "./skills-a.js";
import b from "./skills-b.js";
import c from "./skills-c.js";
import d from "./skills-d.js";
import { globalSkills } from "./shared.js";
import { mechanics, installMechanics } from "./mechanics.js";
import { native, nativeTranslate } from "./native.js";

installMechanics();
const character = {},
  translate = {
    ...nativeTranslate,
    jiaoguosha: "胶国杀",
    jgs_back: "背置",
    jgs_chishi: "持识保护",
    jgs_glue: "胶兵",
    jgs_pile_use: "牌堆出牌",
    jgs_jiushi: "酒诗",
    jgs_delayed: "胶拾判定",
    dz_mantianguohai: "瞒天过海",
  },
  title = {},
  intro = {};
for (const r of roster) {
  character[r.id] = {
    sex: r.sex,
    group: r.group,
    hp: r.hp,
    maxHp: r.maxHp,
    skills: r.skills.map((s) => s.id),
    isZhugong: r.lord,
    img: "image/character/" + r.id + ".art.svg",
    trashBin: [],
    names: r.name,
  };
  translate[r.id] = r.name;
  title[r.id] = r.title;
  intro[r.id] = r.title + "。规则来源：《胶国杀武将》有效正文。";
  for (const s of r.skills) {
    translate[s.id] = s.name;
    translate[s.id + "_info"] = s.text;
  }
}
for (const [id, s] of Object.entries(derivation)) {
  translate[id] = s.name;
  translate[id + "_info"] = s.text;
}
Object.assign(translate, {
  jgs_jiushi_info:
    "当你需要使用酒时，若正面朝上，可以翻面视为使用酒，本回合杀的次数上限加一。受到伤害后，若伤害开始时背面朝上，可以翻回正面。",
  jgs_jiaoyu: "椒遇",
  jgs_jiaoyu_info:
    "结束阶段，进行装备数次判定，声明一种颜色并获得该颜色的判定牌，然后执行一个仅能使用该颜色牌的额外出牌阶段。",
  dz_mantianguohai_info:
    "出牌阶段，对一至两名其他角色使用。获得每名目标角色区域内一张牌，然后分别交给其一张牌。",
  jgs_delayed_info: "胶拾放置的延时牌。进行一次判定，判定后无效果。",
  eternal_jgs_back: "背置",
  eternal_jgs_chishi: "持识保护",
  eternal_jgs_glue: "胶兵",
  jgs_back_public: "背置手牌",
});
const skill = {
  ...native,
  ...globalSkills,
  ...a,
  ...b,
  ...c,
  ...d,
  ...mechanics,
  jgs_dice_qiangxi: { charlotte: true, onremove: true },
};
for (const r of roster)
  for (const s of r.skills) {
    if (!skill[s.id]) throw Error("尚未实现技能：" + s.id);
    skill[s.id].jgsLabels = [
      "昂扬技",
      "蓄力技",
      "持恒技",
      "主公技",
      "限定技",
    ].filter((label) => s.text.includes(label));
  }
game.import("character", () => ({
  name: "jiaoguosha",
  connect: true,
  character,
  characterTitle: title,
  characterIntro: intro,
  skill,
  translate,
  characterSort: { jiaoguosha: { jgs_people: roster.map((r) => r.id) } },
  card: {
    jgs_delayed: {
      type: "delay",
      enable: false,
      judge: () => 0,
      judge2: () => false,
      async effect() {},
    },
    dz_mantianguohai: {
      type: "trick",
      enable: true,
      selectTarget: [1, 2],
      filterTarget: (c, p, q) => q !== p && q.countGainableCards(p, "hej") > 0,
      async content(e, t, p) {
        await p.gainPlayerCard(e.target, "hej", true);
      },
      async contentAfter(e, t, p) {
        for (const q of e.targets)
          if (
            q.isIn() &&
            p.countCards("he") &&
            q.hasHistory(
              "lose",
              (l) => l.getParent("useCard") === e.getParent(),
            )
          )
            await p.chooseToGive(q, "he", true);
      },
      ai: { order: 6, tag: { lose: 1, loseCard: 1 }, result: { target: -0.1 } },
    },
  },
}));
lib.translate.jgs_people = "胶国杀武将";
game.addGlobalSkill("jgs_glue_cleanup");
game.addGlobalSkill("jgs_back_rule");
game.addGlobalSkill("jgs_chishi_end");
game.addGlobalSkill("jgs_back_sync");
