import { lib, game, ui, get, _status } from "noname";

export const loss = {
  player: "loseAfter",
  global: [
    "equipAfter",
    "addJudgeAfter",
    "gainAfter",
    "loseAsyncAfter",
    "addToExpansionAfter",
  ],
};
export const phases = [
  "phaseJudgeEnd",
  "phaseDrawEnd",
  "phaseUseEnd",
  "phaseDiscardEnd",
];
export const edibleNames = [
  "tao",
  "jiu",
  "juedou",
  "taoyuan",
  "wugu",
  "shunshou",
  "muniu",
];
export function edible(card) {
  return (
    edibleNames.includes(get.name(card)) ||
    ["equip3", "equip4", "equip6"].includes(get.subtype(card))
  );
}
export function others(p) {
  return game.filterPlayer((t) => t !== p);
}
export function alive(p) {
  return p?.isIn();
}
export function used(p, key) {
  return p.storage[key] === game.phaseNumber;
}
export function useOnce(p, key) {
  p.storage[key] = game.phaseNumber;
  p.syncStorage(key);
}
export function mark(p, key, value) {
  p.storage[key] = value;
  p.syncStorage(key);
  p.markSkill(key);
}
export function lost(e, p) {
  return e.getl?.(p);
}
export function cardsInDiscard(cards) {
  return (cards || []).filter((c) => get.position(c, true) === "d");
}
export function virtual(name, nature, storage) {
  return { name, nature, isCard: true, storage };
}
export async function selectTarget(
  p,
  prompt,
  filter,
  forced = false,
  positive = false,
) {
  return (
    await p
      .chooseTarget(prompt, filter, forced)
      .set(
        "ai",
        (t) => (get.event().positive ? 1 : -1) * get.attitude(get.player(), t),
      )
      .set("positive", positive)
      .forResult()
  ).targets?.[0];
}
export async function chooseName(p, prompt, names, forced = true) {
  const r = await p
    .chooseButton(
      [
        prompt,
        [
          names.map((n) => (Array.isArray(n) ? n : [get.type(n), "", n])),
          "vcard",
        ],
      ],
      forced,
    )
    .set("ai", (b) =>
      get.player().getUseValue({ name: b.link[2], nature: b.link[3] }),
    )
    .forResult();
  return r.links?.[0];
}
export async function giveTop(p, cards) {
  if (!cards?.length) return;
  await p.lose(cards, ui.cardPile, "insert");
  game.updateRoundNumber();
}
export async function topUse(
  p,
  cards,
  prompt = "选择一张牌使用",
  forced = false,
) {
  const available = cards.filter((c) => p.hasUseTarget(c));
  if (!available.length) return false;
  const r = await p
    .chooseButton([prompt, available], forced)
    .set("ai", (b) => get.player().getUseValue(b.link))
    .forResult();
  if (r.bool) {
    await p.chooseUseTarget(r.links[0], true);
    return true;
  }
  return false;
}
export function flip(card) {
  game.broadcastAll(function (card) {
    const cards = [card, ...(card[card.cardSymbol]?.cards || [])];
    const back = !cards.some((c) => c.hasGaintag("eternal_jgs_back"));
    if (!back && cards.some((c) => c.hasGaintag("eternal_jgs_chishi"))) return;
    for (const c of cards) {
      c.classList.toggle("jgs-backed", back);
      if (back) c.addGaintag("eternal_jgs_back");
      else c.removeGaintag("eternal_jgs_back");
    }
  }, card);
  const owner = get.owner(card);
  if (owner) {
    owner.addSkill("jgs_back_rule");
    owner.syncStorage("jgs_back_rule");
  }
  lib.jgs?.publishBacks();
}
export function gainableSkills(p, contains = "") {
  return [
    ...new Set(Object.values(lib.character).flatMap((c) => c.skills || [])),
  ].filter((id) => {
    const s = lib.skill[id];
    return (
      s &&
      !s.charlotte &&
      !s.zhuSkill &&
      !s.limited &&
      !s.juexingji &&
      !s.dutySkill &&
      !s.hiddenSkill &&
      !s.jgsPersistent &&
      !p.hasSkill(id) &&
      (!contains || (lib.translate[id + "_info"] || "").includes(contains))
    );
  });
}
export const globalSkills = {
  jgs_back_rule: {
    charlotte: true,
    mod: {
      cardEnabled(card) {
        if (
          !get.is.convertedCard(card) &&
          (card.hasGaintag?.("eternal_jgs_back") ||
            card.cards?.some((c) => c.hasGaintag("eternal_jgs_back")))
        )
          return false;
      },
      cardSavable(card) {
        if (
          !get.is.convertedCard(card) &&
          (card.hasGaintag?.("eternal_jgs_back") ||
            card.cards?.some((c) => c.hasGaintag("eternal_jgs_back")))
        )
          return false;
      },
      cardDiscardable(card) {
        if (card.hasGaintag("eternal_jgs_chishi")) return false;
      },
      canBeDiscarded(card) {
        if (card.hasGaintag("eternal_jgs_chishi")) return false;
      },
    },
    trigger: { player: "changeHp" },
    forced: true,
    popup: false,
    filter(e, p) {
      return (
        e.num < 0 && p.hasCard((c) => c.hasGaintag("eternal_jgs_chishi"), "hej")
      );
    },
    async content(e, t, p) {
      lib.jgs.clearChishi(p.getCards("hej"));
    },
  },
  jgs_chishi_end: {
    trigger: { global: "phaseAfter" },
    forced: true,
    popup: false,
    async content() {
      lib.jgs.clearChishi(
        [...game.players, ...game.dead].flatMap((p) => p.getCards("hej")),
      );
    },
  },
};
