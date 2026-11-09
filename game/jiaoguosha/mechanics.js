import { lib, game, ui, get, _status } from "noname";
import * as shared from "./shared.js";

function pileCards(event) {
  if (game.online) return;
  const p = event.player;
  const cards =
    p.storage.jgs_pile_access === "bottom"
      ? get.bottomCards(4, true)
      : (p.storage.jgs_pile_cards || []).filter(
          (c) => get.position(c, true) === "c",
        );
  event.set("jgs_pile_cards", cards);
}
export const mechanics = {
  jgs_back_public: {
    charlotte: true,
    marktext: "背",
    intro: {
      mark(dialog, cards, player) {
        if (player === game.me)
          dialog.addText("背置手牌的牌面向其他角色公开，你不能直接使用。");
        else if (cards?.length) dialog.addSmall(cards);
      },
    },
  },
  jgs_back_sync: {
    trigger: {
      global: [
        "gainAfter",
        "loseAfter",
        "loseAsyncAfter",
        "equipAfter",
        "addJudgeAfter",
      ],
    },
    forced: true,
    popup: false,
    async content() {
      lib.jgs.publishBacks();
    },
  },
  jgs_pile_use: {
    charlotte: true,
    enable: ["chooseToUse", "chooseToRespond"],
    onChooseToUse: pileCards,
    onChooseToRespond: pileCards,
    filter: (e, p) => e.jgs_pile_cards?.some((c) => e.filterCard(c, p, e)),
    hiddenCard: (p, n) => lib.inpile.includes(n),
    chooseButton: {
      dialog(e) {
        return ui.create.dialog("使用牌堆中的牌", e.jgs_pile_cards, "hidden");
      },
      filter(b, p) {
        const e = get.event().getParent();
        return e.filterCard(b.link, p, e);
      },
      check: (b) => get.player().getUseValue(b.link),
      backup(links) {
        return {
          filterCard: () => false,
          selectCard: -1,
          viewAs: links[0],
          card: links[0],
          async precontent(e) {
            const c = lib.skill.jgs_pile_use_backup.card;
            e.result.cards = [c];
            e.result.card = get.autoViewAs(c, [c]);
          },
        };
      },
      prompt: (links) => "使用" + get.translation(links[0]),
    },
    ai: {
      order: 9,
      respondSha: true,
      respondShan: true,
      result: { player: 1 },
    },
  },
  jgs_glue_cleanup: {
    trigger: { global: ["cardsDiscardAfter", "loseAfter", "loseAsyncAfter"] },
    forced: true,
    popup: false,
    filter: (e) =>
      e.cards?.some(
        (c) =>
          c.hasGaintag("eternal_jgs_glue") && get.position(c, true) === "d",
      ),
    async content(e, t) {
      const cards = t.cards.filter(
        (c) =>
          c.hasGaintag("eternal_jgs_glue") && get.position(c, true) === "d",
      );
      if (cards.length) await game.cardsGotoSpecial(cards);
    },
  },
  jgs_dice_duel: {
    charlotte: true,
    trigger: { player: "damageBegin4" },
    forced: true,
    filter: (e) => e.card?.storage?.jgs_dice_duel,
    async content(e, t) {
      t.cancel();
    },
  },
  jgs_dice_limit: {
    charlotte: true,
    onremove: true,
    mod: { maxHandcard: (p, n) => n + p.countMark("jgs_dice_limit") },
  },
  jgs_dice_range: {
    charlotte: true,
    mod: { targetInRange: () => true, cardUsable: () => Infinity },
  },
  jgs_dice_basic: {
    charlotte: true,
    enable: ["chooseToUse", "chooseToRespond"],
    filter: (e, p) => p.hasCard((c) => get.type(c) === "basic", "h"),
    chooseButton: {
      dialog() {
        return ui.create.dialog("战意", [
          get.inpileVCardList((x) => x[0] === "basic"),
          "vcard",
        ]);
      },
      filter(b, p) {
        const e = get.event().getParent();
        return e.filterCard({ name: b.link[2], nature: b.link[3] }, p, e);
      },
      check: (b) =>
        get.player().getUseValue({ name: b.link[2], nature: b.link[3] }),
      backup(links) {
        return {
          filterCard: (c) => get.type(c) === "basic",
          position: "h",
          viewAs: { name: links[0][2], nature: links[0][3] },
        };
      },
      prompt: () => "战意：将基本牌转化",
    },
    group: "jgs_dice_basic_first",
    subSkill: {
      first: {
        trigger: { player: "useCard1" },
        forced: true,
        popup: false,
        filter: (e, p) =>
          get.type(e.card) === "basic" && !p.storage.jgs_dice_basic_first,
        async content(e, t, p) {
          p.storage.jgs_dice_basic_first = true;
          t.baseDamage = (t.baseDamage || 1) + 1;
        },
      },
    },
    onremove(p) {
      delete p.storage.jgs_dice_basic_first;
    },
  },
  jgs_dice_trick: {
    charlotte: true,
    trigger: { player: "useCard" },
    forced: true,
    popup: false,
    filter: (e) => get.type2(e.card) === "trick",
    async content(e, t) {
      t.nowuxie = true;
    },
  },
  jgs_dice_equip: {
    charlotte: true,
    trigger: { player: "useCardToPlayered" },
    forced: true,
    filter: (e) => e.card.name === "sha" && e.targets.length === 1,
    async content(e, t, p) {
      const r = await t.target.chooseToDiscard("he", 2, true).forResult();
      const cards = shared.cardsInDiscard(r.cards);
      if (cards.length) {
        const choice = await p
          .chooseButton(["战意：获得其中一张牌", cards], true)
          .forResult();
        if (choice.links) await p.gain(choice.links, "gain2");
      }
    },
  },
};

export function installMechanics() {
  lib.jgs = {
    ...shared,
    publishBacks() {
      if (game.online) return;
      for (const p of [...game.players, ...game.dead]) {
        const cards = p.getCards("h", (c) => c.hasGaintag("eternal_jgs_back"));
        const key = cards.map((c) => c.cardid).join(",");
        if (p._jgsBackKey === key) continue;
        p._jgsBackKey = key;
        game.broadcastAll(
          function (p, cards) {
            p.storage.jgs_back_public = cards;
            if (cards.length) p.markSkill("jgs_back_public");
            else p.unmarkSkill("jgs_back_public");
          },
          p,
          cards,
        );
      }
    },
    clearChishi(cards) {
      game.broadcastAll(function (cards) {
        for (const card of cards)
          if (card.hasGaintag("eternal_jgs_chishi"))
            for (const c of [card, ...(card[card.cardSymbol]?.cards || [])]) {
              c.removeGaintag("eternal_jgs_chishi");
              c.removeGaintag("eternal_jgs_back");
              c.classList.remove("jgs-backed");
            }
      }, cards);
      lib.jgs.publishBacks();
    },
    phaseKey(event) {
      const names = [
        "phaseZhunbei",
        "phaseJudge",
        "phaseDraw",
        "phaseUse",
        "phaseDiscard",
        "phaseJieshu",
      ];
      const phase = names.includes(event.name)
        ? event
        : event.getParent((e) => names.includes(e.name));
      if (!phase._jgsId) phase._jgsId = get.id();
      return phase._jgsId;
    },
    async delayedJudge(p, name, inverse) {
      const judge = lib.card[name]?.judge || (() => 0),
        r = await p
          .judge(judge)
          .set("judge2", (r) => r.bool)
          .forResult();
      const hit =
        name === "shandian"
          ? r.suit === "spade" && r.number >= 2 && r.number <= 9
          : name === "lebu"
            ? r.suit !== "heart"
            : name === "bingliang"
              ? r.suit !== "club"
              : false;
      if (hit !== inverse) {
        if (name === "shandian") await p.damage(3, "thunder", "nosource");
        else if (name === "lebu") p.skip("phaseUse");
        else if (name === "bingliang") p.skip("phaseDraw");
      }
    },
    async rejudge(p, card, trigger) {
      await p.respond({
        cards: [card],
        skill: "jgs_guayan",
        highlight: true,
        noOrdering: true,
      });
      await game.cardsDiscard(trigger.player.judging[0]);
      trigger.player.judging[0] = card;
      trigger.orderingCards.add(card);
      game.log(trigger.player, "的判定牌改为", card);
    },
    async xiejiao(p, q) {
      p.logSkill("jgs_xiejiao", q);
      const options = ["使用杀", "失去体力"];
      if (q.hasCard((c) => lib.jgs.edible(c), "he"))
        options.unshift("展示并交出食物牌");
      const r = await q
        .chooseControl(options)
        .set("prompt", "挟胶：选择一项")
        .set("ai", () =>
          get.event().controls.includes("展示并交出食物牌") ? 0 : "失去体力",
        )
        .forResult();
      const hp = new Map(game.players.map((x) => [x, x.hp]));
      if (r.control === "展示并交出食物牌") {
        const c = await q
          .chooseCard("he", true, "挟胶：交出可食用牌", (c) =>
            lib.jgs.edible(c),
          )
          .set("ai", (c) => 6 - get.value(c))
          .forResult();
        if (c.cards?.length) {
          await q.showCards(c.cards);
          await q.give(c.cards, p);
        }
      } else if (r.control === "使用杀") {
        const pick = await p
          .chooseTarget(
            "挟胶：选择杀的目标",
            true,
            (c, p, t) =>
              t !== get.event().jgs_source &&
              get.event().jgs_source.canUse({ name: "sha" }, t),
          )
          .set("jgs_source", q)
          .set("ai", (t) =>
            get.effect(
              t,
              { name: "sha" },
              get.event().jgs_source,
              get.player(),
            ),
          )
          .forResult();
        const target = pick.targets?.[0];
        if (target) {
          const u = await q
            .chooseToUse({
              prompt: "挟胶：对" + get.translation(target) + "使用杀",
              filterCard: (c) => get.name(c) === "sha",
              filterTarget: (c, p, t) => t === get.event().jgs_target,
              jgs_target: target,
              targetRequired: true,
              complexSelect: true,
            })
            .forResult();
          if (!u.bool) await q.loseHp();
        } else await q.loseHp();
      } else await q.loseHp();
      for (const [x, before] of hp)
        if (x.isIn() && x.hp < before) await x.draw();
    },
    async dianyin(p, t) {
      const key = lib.jgs.phaseKey(t);
      if (p.storage.jgs_dianyin_phase === key) return;
      p.storage.jgs_dianyin_phase = key;
      const result = await p
        .chooseUseTarget(
          { name: "huogong", isCard: true },
          "癫音：视为使用火攻",
        )
        .forResult();
      if (result.bool) p.logSkill("jgs_dianyin");
      else delete p.storage.jgs_dianyin_phase;
    },
    fangshenEligible(id) {
      const s = lib.skill[id];
      return (
        !!s &&
        !s.charlotte &&
        !s.zhuSkill &&
        !s.limited &&
        !s.juexingji &&
        !s.dutySkill &&
        !s.jgsPersistent &&
        !s.mod &&
        !s.unique &&
        !s.jgsLabels?.length &&
        (s.trigger || s.enable) &&
        !id.startsWith("jgs_fangshen") &&
        !id.startsWith("jgs_jiaoshi_wang")
      );
    },
    refreshGlue(p) {
      const cards = p
          .getCards("h")
          .filter((c) => c.hasGaintag("eternal_jgs_glue")),
        data = p.storage.jgs_fangshen_cards || {};
      for (const id of Object.keys(data))
        if (!cards.some((c) => c.cardid === id)) delete data[id];
      p.addAdditionalSkill(
        "jgs_fangshen",
        Array.from(new Set(Object.values(data).flatMap((x) => x.skills))),
      );
      p.syncStorage("jgs_fangshen_cards");
      p.markSkill("jgs_fangshen");
    },
    async helai(p, q) {
      shared.useOnce(p, "jgs_helai_used");
      p.markAuto("jgs_helai_targets", [q.playerid]);
      p.addTempSkill("jgs_helai_clear");
      p.logSkill("jgs_helai", q);
      const r = q.countCards("h")
        ? await q
            .chooseControl("交出手牌并结盟", "令其刷新技能并蓄力")
            .set("prompt", "和来")
            .set("ai", () => 0)
            .forResult()
        : { index: 1 };
      if (r.index === 0) {
        await q.chooseToGive(p, "h", true);
        p.markAuto("jgs_helai_bonds", [q.playerid]);
        p.addSkill("jgs_helai_bonds");
      } else {
        delete p.storage.jgs_helai_used;
        delete p.storage.jgs_jiaoshi_zou_used;
        for (const id of lib.character[p.name]?.skills || [])
          delete p.getStat("skill")[id];
        p.storage.jgs_jiaoshi_zou = Math.min(
          3,
          (p.storage.jgs_jiaoshi_zou || 0) + 1,
        );
        p.syncStorage("jgs_jiaoshi_zou");
        p.markSkill("jgs_jiaoshi_zou");
      }
    },
    async dice(p, die) {
      if (die === 1) {
        await p.draw(3);
        if (p.isPhaseUsing()) {
          p.addTempSkill("zhaxiang_effect");
          p.addMark("zhaxiang_effect", 1, false);
        }
        return;
      }
      if (die === 2) {
        p.addTempSkill("jgs_dice_limit");
        p.addMark("jgs_dice_limit", 1, false);
        let choice = 1;
        if (p.canMoveCard())
          choice = (
            await p
              .chooseControl("移动场上的牌", "摸牌并使用杀")
              .set("ai", () => 1)
              .forResult()
          ).index;
        if (choice === 0) await p.moveCard(true);
        else {
          await p.draw();
          p.addTempSkill("jgs_dice_range");
          await p.chooseUseTarget({ name: "sha", isCard: true }, false, true);
          p.removeSkill("jgs_dice_range");
        }
        return;
      }
      if (die === 3) {
        const q = await shared.selectTarget(
          p,
          "伪溃：选择一名有手牌的其他角色",
          (c, p, q) => q !== p && q.countCards("h"),
          true,
        );
        if (!q) return;
        await p.viewHandcards(q);
        if (q.hasCard((c) => get.name(c) === "shan", "h")) {
          p.addTempSkill("jgs_dice_range");
          await p.useCard({ name: "sha", isCard: true }, q, false);
          p.removeSkill("jgs_dice_range");
        } else await p.discardPlayerCard(q, "h", true);
        return;
      }
      if (die === 4) {
        const r = await p
          .chooseToDiscard("he", true, "战意：弃置一张牌")
          .forResult();
        if (!r.cards?.length) return;
        const type = get.type2(r.cards[0]);
        p.addTempSkill("jgs_dice_" + type, { player: "phaseUseEnd" });
        if (type === "trick") await p.draw(3);
        return;
      }
      if (die === 5) {
        const q = await shared.selectTarget(
          p,
          "椎锋：视为使用决斗",
          (c, p, q) => q !== p && p.canUse({ name: "juedou" }, q),
          true,
        );
        if (q) {
          p.addTempSkill("jgs_dice_duel");
          await p.useCard(
            { name: "juedou", isCard: true, storage: { jgs_dice_duel: true } },
            q,
          );
          p.removeSkill("jgs_dice_duel");
        }
        return;
      }
      if (die === 6) {
        const q = await shared.selectTarget(
          p,
          "强袭：造成1点伤害",
          (c, p, q) =>
            q !== p && !p.getStorage("jgs_dice_qiangxi").includes(q.playerid),
          true,
        );
        if (q) {
          p.markAuto("jgs_dice_qiangxi", [q.playerid]);
          p.addTempSkill("jgs_dice_qiangxi");
          await q.damage(p);
        }
      }
    },
    refreshBacks() {
      for (const p of [...game.players, ...game.dead])
        for (const c of p.getCards("hej"))
          c.classList.toggle(
            "jgs-backed",
            c.hasGaintag("eternal_jgs_back") ||
              c[c.cardSymbol]?.cards?.some((x) =>
                x.hasGaintag("eternal_jgs_back"),
              ),
          );
    },
  };
  const hasSex = lib.element.Player.prototype.hasSex;
  lib.element.Player.prototype.hasSex = function (sex) {
    return (
      (this.hasSkill("jgs_qiaozhuang") && ["male", "female"].includes(sex)) ||
      hasSex.call(this, sex)
    );
  };
  const number = get.number;
  get.number = function (card, ...args) {
    const i = _status.jgs_jokers?.indexOf(card?.name);
    return i >= 0 ? 14 + i : number.call(this, card, ...args);
  };
  const skillsFromEquips = get.skillsFromEquips;
  get.skillsFromEquips = function (cards, ...rest) {
    return skillsFromEquips.call(
      this,
      cards.filter(
        (c) => !(c.cards || []).some((x) => x.hasGaintag("eternal_jgs_back")),
      ),
      ...rest,
    );
  };
  const filterSkills = game.filterSkills;
  game.filterSkills = function (skills, player, ...rest) {
    return filterSkills
      .call(this, skills, player, ...rest)
      .addArray(
        skills.filter((id) => lib.skill[get.sourceSkillFor(id)]?.jgsPersistent),
      );
  };
  const disable = lib.element.Player.prototype.disableSkill;
  lib.element.Player.prototype.disableSkill = function (source, skills) {
    if (typeof skills === "string")
      return lib.skill[get.sourceSkillFor(skills)]?.jgsPersistent
        ? this
        : disable.call(this, source, skills);
    const list = (skills || []).filter(
      (id) => !lib.skill[get.sourceSkillFor(id)]?.jgsPersistent,
    );
    return list.length ? disable.call(this, source, list) : this;
  };
  const presets = ui.create.buttonPresets,
    cardButton = presets.card;
  presets.card = function (item, ...args) {
    if (item.hasGaintag?.("eternal_jgs_back") && get.owner(item) === game.me)
      return presets.blank(item, ...args);
    return cardButton.call(this, item, ...args);
  };
}
