import { lib, game, ui, get, _status } from "noname";
import {
  loss,
  used,
  useOnce,
  lost,
  flip,
  others,
  selectTarget,
  topUse,
  cardsInDiscard,
} from "./shared.js";

export default {
  jgs_qiaozhuang: {
    trigger: { player: "useCardToPlayered" },
    forced: true,
    filter: (e) => get.tag(e.card, "damage"),
    async content(e, t, p) {
      const q = t.target;
      const r = await q
        .chooseToDiscard(
          "h",
          "乔妆：弃置一张手牌，或令" + get.translation(p) + "摸一张牌",
        )
        .set("ai", (c) =>
          get.attitude(get.player(), get.event().source) > 0
            ? 0
            : 4 - get.value(c),
        )
        .set("source", p)
        .forResult();
      if (!r.bool) await p.draw();
    },
  },
  jgs_haoxiang: {
    trigger: { player: ["phaseDrawBegin2", "damageBegin4"] },
    direct: true,
    filter: (e, p) => p.countCards("h") > 0,
    async content(e, t, p) {
      const r = await p
        .chooseCard(
          "h",
          "好香：展示一张手牌，发动" + (t.name === "damage" ? "天香" : "好施"),
        )
        .set("ai", (c) =>
          get.event().damage ? 8 - get.value(c) : 6 - get.value(c),
        )
        .set("damage", t.name === "damage")
        .forResult();
      if (!r.bool) return;
      p.logSkill("jgs_haoxiang");
      await p.showCards(r.cards, "好香");
      if (
        !get.tag(r.cards[0], "damage") &&
        (
          await p
            .chooseBool("好香：先将展示的牌放到牌堆顶？")
            .set("ai", () => false)
            .forResult()
        ).bool
      )
        await p.lose(r.cards, ui.cardPile, "insert");
      if (t.name === "phaseDraw") {
        t.num += 2;
        p.addTempSkill("jgs_haoxiang_give");
      } else {
        const q = await selectTarget(
          p,
          "天香：选择一名其他角色",
          (c, p, q) => q !== p,
          true,
        );
        if (!q) return;
        t.cancel();
        const c = await p
          .chooseControl("令其受到伤害并摸牌", "令其失去体力并获得展示牌")
          .set("ai", () => 0)
          .forResult();
        if (c.index === 0) {
          if (t.source?.isIn()) await q.damage(t.source);
          else await q.damage("nosource");
          if (q.isIn()) await q.draw(Math.min(5, q.getDamagedHp()));
        } else {
          await q.loseHp();
          const card = r.cards[0];
          if (q.isIn() && get.position(card, true) !== "s")
            await q.gain(card, "gain2");
        }
      }
    },
    subSkill: {
      give: {
        trigger: { player: "phaseDrawEnd" },
        forced: true,
        charlotte: true,
        filter: (e, p) => p.countCards("h") > 5,
        async content(e, t, p) {
          const n = Math.floor(p.countCards("h") / 2),
            min = Math.min(...others(p).map((q) => q.countCards("h")));
          const q = await p
            .chooseTarget(
              "好施：将一半手牌交给手牌最少的其他角色",
              true,
              (c, p, q) => q !== p && q.countCards("h") === get.event().min,
            )
            .set("min", min)
            .set("ai", (q) => get.attitude(get.player(), q))
            .forResult();
          if (q.targets?.length)
            await p.chooseToGive(q.targets[0], "h", n, true);
          p.removeSkill("jgs_haoxiang_give");
        },
      },
    },
  },
  jgs_jiaoshi_ri: {
    trigger: loss,
    direct: true,
    filter(e, p) {
      const l = lost(e, p);
      return (
        l?.hs?.length &&
        !["useCard", "respond"].includes(e.getParent()?.name) &&
        [
          ...Array.from(ui.discardPile.childNodes),
          ...game.filterPlayer().flatMap((q) => q.getCards("ej")),
        ].some((c) => get.name(c) === "cixiong")
      );
    },
    async content(e, t, p) {
      const cards = [
        ...Array.from(ui.discardPile.childNodes),
        ...game.filterPlayer().flatMap((q) => q.getCards("ej")),
      ].filter((c) => get.name(c) === "cixiong");
      const r = await p
        .chooseButton(["娇拾：获得一张雌雄双股剑", cards])
        .set("ai", () => 1)
        .forResult();
      if (r.bool) await p.gain(r.links, "gain2");
    },
  },
  jgs_jiaoshi_xi: {
    trigger: { player: "phaseZhunbeiBegin" },
    forced: true,
    init(p) {
      p.storage.jgs_jiaoshi_xi ??= [[0], [1], [2], [3]];
    },
    mark: true,
    intro: {
      content: (s) =>
        (s || [])
          .map((a) =>
            a
              .map(
                (i) => ["失去1体力", "摸一张牌", "使用拼点牌", "调换阶段"][i],
              )
              .join("＋"),
          )
          .join("<br>"),
    },
    async content(e, t, p) {
      const n = Math.max(1, p.countCards("j") * 2);
      for (let i = 0; i < n && p.isIn(); i++) {
        let mine;
        const r = await p
          .chooseCard(
            "h",
            true,
            "胶石：与牌堆拼点（" + (i + 1) + "/" + n + "）",
          )
          .set("ai", (c) => get.number(c) - get.value(c))
          .forResult();
        mine = r.cards?.[0];
        if (mine) await p.lose(mine, ui.ordering);
        const top = get.cards()[0];
        await game.cardsGotoOrdering([top]);
        await p.showCards([mine, top].filter(Boolean), "胶石：与牌堆拼点");
        const win = mine && get.number(mine, p) > get.number(top, false);
        let options = p.storage.jgs_jiaoshi_xi;
        const labels = (a) =>
          a
            .map(
              (x) =>
                [
                  "失去1点体力",
                  "摸一张牌",
                  "使用一张拼点牌",
                  "调换两个主要阶段",
                ][x],
            )
            .join("＋");
        if (!win && options.length > 1) {
          const choices = options.slice(1).map(labels);
          const c = await p
            .chooseControl(choices)
            .set("prompt", "胶石：未赢，将首项与一项合并")
            .set("ai", () => 0)
            .forResult();
          options[0].push(...options.splice(c.index + 1, 1)[0]);
        }
        const choice = await p
          .chooseControl(options.map(labels))
          .set("prompt", "胶石：执行一项")
          .set("ai", () =>
            get.event().controls.findIndex((c) => !c.includes("失去")) >= 0
              ? get.event().controls.findIndex((c) => !c.includes("失去"))
              : 0,
          )
          .forResult();
        p.syncStorage("jgs_jiaoshi_xi");
        p.markSkill("jgs_jiaoshi_xi");
        for (const effect of options[choice.index]) {
          if (!p.isIn()) break;
          if (effect === 0) await p.loseHp();
          if (effect === 1) await p.draw();
          if (effect === 2)
            await topUse(
              p,
              [mine, top].filter(
                (c) => c && ["o", "d"].includes(get.position(c, true)),
              ),
              "胶石：使用一张拼点牌",
              true,
            );
          if (effect === 3) {
            const phase = t.getParent("phase"),
              names = ["phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard"];
            const result = await p
              .chooseButton(
                [
                  "胶石：选择要交换的两个阶段",
                  [names.map((n) => [n, get.translation(n)]), "tdnodes"],
                ],
                2,
                true,
              )
              .forResult();
            if (result.links?.length === 2) {
              const [a, b] = result.links,
                ia = phase.phaseList.findIndex((x) => x.split("|")[0] === a),
                ib = phase.phaseList.findIndex((x) => x.split("|")[0] === b);
              if (ia >= 0 && ib >= 0)
                [phase.phaseList[ia], phase.phaseList[ib]] = [
                  phase.phaseList[ib],
                  phase.phaseList[ia],
                ];
            }
          }
        }
        if (win && p.hasSkill("jgs_jiashi")) p.storage.jgs_jiashi = false;
      }
    },
  },
  jgs_shijie: {
    trigger: { player: "useCard1" },
    limited: true,
    skillAnimation: true,
    filter: (e, p) => !p.storage.jgs_shijie,
    async content(e, t, p) {
      p.awakenSkill("jgs_shijie");
      p.storage.jgs_shijie_card = t.card;
      for (const q of others(p)) {
        q.addSkill("jgs_shijie_lock");
        q.markAuto("jgs_shijie_lock", [p.playerid]);
      }
      p.addSkill("jgs_shijie_release");
    },
    subSkill: {
      lock: {
        charlotte: true,
        mark: true,
        intro: { content: "世界：不能使用或打出手牌" },
        mod: {
          cardEnabled2(c, p) {
            if (get.owner(c) === p && get.position(c) === "h") return false;
          },
        },
      },
      release: {
        charlotte: true,
        trigger: { player: ["useCardAfter", "phaseBegin", "dieBegin"] },
        forced: true,
        popup: false,
        forceDie: true,
        filter: (e, p) =>
          e.name !== "useCard" || e.card !== p.storage.jgs_shijie_card,
        async content(e, t, p) {
          for (const q of [...game.players, ...game.dead]) {
            q.unmarkAuto("jgs_shijie_lock", [p.playerid]);
            if (!q.getStorage("jgs_shijie_lock").length)
              q.removeSkill("jgs_shijie_lock");
          }
          p.removeSkill("jgs_shijie_release");
        },
      },
    },
  },
  jgs_sijie: {
    trigger: { player: "dying" },
    forced: true,
    priority: 10,
    filter: (e, p) => p.hp <= 0 && p.maxHp > 1,
    async content(e, t, p) {
      await p.loseMaxHp();
      await p.recover();
      if (p.isTurnedOver()) await p.turnOver(false);
      if (p.isLinked()) await p.link(false);
      for (const skill of p.getSkills(null, false, false)) {
        if (lib.skill[skill]?.limited || lib.skill[skill]?.juexingji) {
          p.restoreSkill(skill);
          delete p.storage[skill];
        }
        delete p.getStat("skill")[skill];
      }
      p.storage.jgs_jiaoshi_xi = [[0], [1], [2], [3]];
      p.storage.jgs_jiashi = false;
      p.syncStorage("jgs_jiaoshi_xi");
      p.markSkill("jgs_jiaoshi_xi");
    },
  },
  jgs_jiaozhong: {
    jgsPersistent: true,
    trigger: { player: "dieBegin" },
    direct: true,
    forceDie: true,
    async content(e, t, p) {
      let cards = p.getCards("hej"),
        targets = others(p),
        suits = [];
      const skills = lib.character[p.name]?.skills || [];
      for (let i = 0; i < 4 && cards.length && targets.length; i++) {
        const r = await p
          .chooseButton([
            "胶终：选择要赠送的牌",
            cards.filter((c) => !suits.includes(get.suit(c))),
          ])
          .forResult();
        if (!r.bool) break;
        const q = await p
          .chooseTarget("胶终：选择获得者", true, (c, p, q) =>
            get.event().eligible.includes(q),
          )
          .set("eligible", targets)
          .set("ai", (q) => get.attitude(get.player(), q))
          .forResult();
        if (!q.targets?.length) break;
        const card = r.links[0],
          to = q.targets[0],
          suit = get.suit(card);
        await to.gain(card, p, "giveAuto");
        const skill =
          skills[["spade", "heart", "club", "diamond"].indexOf(suit)];
        if (skill) await to.addSkills(skill);
        cards.remove(card);
        targets.remove(to);
        suits.push(suit);
      }
    },
  },
  jgs_huangzhan: {
    jgsPersistent: true,
    trigger: { global: "phaseUseBegin" },
    forced: true,
    filter: (e) => e.player.getSeatNum() === 1,
    async content(e, t, p) {
      const q = t.player;
      let possible = () =>
        q
          .getCards("h")
          .some(
            (a) =>
              get.color(a) === "black" &&
              q.hasCard(
                (b) => get.color(b) === "red" && get.name(a) !== get.name(b),
                "h",
              ),
          );
      while (!possible() && q.isIn() && q.countCards("h") < 200) await q.draw();
      if (!possible()) return;
      const first = await q
        .chooseCard(
          "h",
          true,
          "皇战：先展示一张黑色牌",
          (c, p) =>
            get.color(c) === "black" &&
            p.hasCard(
              (x) => get.color(x) === "red" && get.name(x) !== get.name(c),
              "h",
            ),
        )
        .set("ai", () => 1)
        .forResult();
      const black = first.cards?.[0];
      if (!black) return;
      const blackName = get.name(black);
      await q.showCards([black], "皇战：小王");
      while (
        q.isIn() &&
        !q.hasCard(
          (c) => get.color(c) === "red" && get.name(c) !== blackName,
          "h",
        ) &&
        q.countCards("h") < 200
      )
        await q.draw();
      const second = await q
        .chooseCard(
          "h",
          true,
          "皇战：再展示一张不同名的红色牌",
          (c) =>
            get.color(c) === "red" && get.name(c) !== get.event().blackName,
        )
        .set("blackName", blackName)
        .set("ai", () => 1)
        .forResult();
      const red = second.cards?.[0];
      if (!red) return;
      const redName = get.name(red);
      await q.showCards([red], "皇战：大王");
      game.broadcastAll(
        function (names) {
          _status.jgs_jokers = names;
        },
        [blackName, redName],
      );
      game.addGlobalSkill("jgs_joker_rule");
    },
  },
  jgs_joker_rule: {
    mod: {
      cardnumber(c, p, n) {
        const i = _status.jgs_jokers?.indexOf(get.name(c, p));
        if (i >= 0) return 14 + i;
      },
    },
    trigger: { global: "roundStart" },
    forced: true,
    popup: false,
    async content() {
      game.broadcastAll(function () {
        delete _status.jgs_jokers;
      });
    },
  },
  jgs_nannan: {
    enable: "phaseUse",
    filter: (e, p) =>
      (p.getStat("skill").jgs_nannan || 0) <
        (p.storage.jgs_nannan_twice ? 2 : 1) &&
      game.hasPlayer(
        (q) =>
          p.canCompare(q) &&
          !p.getStorage("jgs_nannan_targets").includes(q.playerid),
      ),
    filterTarget: (c, p, q) =>
      p.canCompare(q) &&
      !p.getStorage("jgs_nannan_targets").includes(q.playerid),
    async content(e, t, p) {
      p.markAuto("jgs_nannan_targets", [e.target.playerid]);
      p.addTempSkill("jgs_nannan_clear");
      const compare = p.chooseToCompare(e.target),
        r = await compare.forResult();
      if (r.bool) {
        const q = await selectTarget(
          p,
          "喃喃：获得一名其他角色的一张牌",
          (c, p, q) => q !== p && q.countGainableCards(p, "hej"),
          true,
        );
        if (q) await p.gainPlayerCard(q, "hej", true);
      } else {
        p.storage.jgs_nannan_twice = true;
        if (p.countCards("hej")) {
          const c = await p
            .chooseCard("hej", true, "喃喃：将一张牌翻面")
            .set("ai", (c) =>
              c.hasGaintag("eternal_jgs_back") ? 10 : 1 - get.value(c),
            )
            .forResult();
          if (c.cards?.length) flip(c.cards[0]);
        }
      }
      const loser = r.tie ? null : r.bool ? e.target : p;
      const cards = cardsInDiscard([r.player, r.target].filter(Boolean)).filter(
        (c) => get.number(c) >= 13,
      );
      if (
        loser &&
        cards.length &&
        (
          await loser
            .chooseBool("喃喃：获得拼点牌中的王牌？")
            .set("ai", () => true)
            .forResult()
        ).bool
      )
        await loser.gain(cards, "gain2");
    },
    group: "jgs_nannan_phase",
    subSkill: {
      clear: {
        charlotte: true,
        onremove(p) {
          delete p.storage.jgs_nannan_targets;
        },
      },
      phase: {
        trigger: { player: "phaseUseBegin" },
        forced: true,
        popup: false,
        async content(e, t, p) {
          delete p.storage.jgs_nannan_twice;
        },
      },
    },
    ai: { order: 5, result: { target: -1 } },
  },
  jgs_wangzha: {
    enable: ["chooseToUse", "chooseToRespond"],
    filter: (e, p) => !used(p, "jgs_wangzha_used") && p.countCards("he") >= 2,
    chooseButton: {
      dialog(e, p) {
        return ui.create.dialog(
          "王炸：选择两张牌；按第一张的牌名使用",
          p.getCards("he"),
        );
      },
      select: 2,
      filter(b, p) {
        return (
          ui.selected.buttons.length > 0 ||
          get.event().getParent().filterCard(b.link, p, get.event().getParent())
        );
      },
      check: (b) => get.player().getUseValue(b.link) - get.value(b.link) / 3,
      backup(links) {
        return {
          filterCard: () => false,
          selectCard: -1,
          viewAs: {
            name: get.name(links[0]),
            nature: get.nature(links[0]),
            storage: { jgs_wangzha: true },
          },
          cards: links,
          async precontent(e, t, p) {
            const cards = lib.skill.jgs_wangzha_backup.cards;
            e.result.cards = cards;
            e.result.card.cards = cards;
            e.result.card.storage = {
              jgs_wangzha: true,
              royal: cards.some((c) => get.number(c) >= 13),
              second: {
                name: get.name(cards[1]),
                nature: get.nature(cards[1]),
              },
              twocolor: get.color(cards[0]) !== get.color(cards[1]),
            };
            lib.jgs.useOnce(p, "jgs_wangzha_used");
          },
        };
      },
      prompt: () => "王炸：选择使用目标",
    },
    group: ["jgs_wangzha_second", "jgs_wangzha_royal"],
    subSkill: {
      second: {
        trigger: { player: "useCardAfter" },
        direct: true,
        filter: (e) => e.card.storage?.jgs_wangzha && e.card.storage.twocolor,
        async content(e, t, p) {
          const card = { ...t.card.storage.second, isCard: true },
            targets = t.targets.filter((q) => q.isIn() && p.canUse(card, q));
          if (!targets.length) return;
          if (
            (
              await p
                .chooseBool(
                  "王炸：对合法的原目标使用" + get.translation(card) + "？",
                )
                .set("ai", () => true)
                .forResult()
            ).bool
          )
            await p.useCard(card, targets);
        },
      },
      royal: {
        trigger: { player: "useCard1" },
        forced: true,
        popup: false,
        filter: (e) => e.card.storage?.jgs_wangzha && e.card.storage.royal,
        async content(e, t, p) {
          game.addGlobalSkill("jgs_royal_response");
        },
      },
    },
    ai: { order: 7, result: { player: 1 } },
  },
  jgs_royal_response: {
    mod: {
      cardEnabled(c, p) {
        const event = get.event(),
          use = event.getParent("useCard");
        if (
          event.name === "chooseToUse" &&
          use?.card?.storage?.jgs_wangzha &&
          use.card.storage.royal &&
          use.player !== p &&
          get.number(c) < 13
        )
          return false;
      },
      cardRespondable(c, p) {
        const use = get.event().getParent("useCard");
        if (
          use?.card?.storage?.jgs_wangzha &&
          use.card.storage.royal &&
          use.player !== p &&
          get.number(c) < 13
        )
          return false;
      },
    },
  },
  jgs_helai: {
    enable: "phaseUse",
    filter: (e, p) =>
      !used(p, "jgs_helai_used") &&
      others(p).some(
        (q) => !p.getStorage("jgs_helai_targets").includes(q.playerid),
      ),
    filterTarget: (c, p, q) =>
      q !== p && !p.getStorage("jgs_helai_targets").includes(q.playerid),
    async content(e, t, p) {
      await lib.jgs.helai(p, e.target);
    },
    group: ["jgs_helai_damage", "jgs_helai_draw"],
    subSkill: {
      damage: {
        trigger: { player: "damageEnd" },
        direct: true,
        filter: (e, p) => !used(p, "jgs_helai_used"),
        async content(e, t, p) {
          const q = await selectTarget(
            p,
            "和来：选择一名本回合未选择过的其他角色",
            (c, p, q) =>
              q !== p &&
              !p.getStorage("jgs_helai_targets").includes(q.playerid),
          );
          if (q) await lib.jgs.helai(p, q);
        },
      },
      draw: {
        trigger: { global: "useCardToTargeted" },
        forced: true,
        popup: false,
        filter: (e, p) =>
          (e.player === p &&
            p.getStorage("jgs_helai_bonds").includes(e.target.playerid)) ||
          (e.target === p &&
            p.getStorage("jgs_helai_bonds").includes(e.player.playerid)),
        async content(e, t) {
          await t.target.draw();
        },
      },
      clear: {
        charlotte: true,
        onremove(p) {
          delete p.storage.jgs_helai_targets;
        },
      },
      bonds: {
        trigger: { player: "phaseBegin" },
        forced: true,
        popup: false,
        async content(e, t, p) {
          delete p.storage.jgs_helai_bonds;
          p.removeSkill("jgs_helai_bonds");
        },
      },
    },
    ai: { order: 7, result: { player: 1 } },
  },
  jgs_jiaoshi_zou: {
    init(p) {
      p.storage.jgs_jiaoshi_zou ??= 1;
    },
    mark: true,
    marktext: "蓄",
    intro: { content: (s) => "蓄力 " + (s || 0) + "/3" },
    trigger: { player: "useCardToPlayered", target: "useCardToTargeted" },
    direct: true,
    filter: (e, p) =>
      p.storage.jgs_jiaoshi_zou > 0 && !used(p, "jgs_jiaoshi_zou_used"),
    async content(e, t, p) {
      const opts = ["不可被响应", "伤害或回复值加一"];
      if (t.player.countCards("hej")) opts.push("获得使用者一张牌");
      opts.push("取消");
      const r = await p
        .chooseControl(opts)
        .set("prompt", "矫势：消耗一点蓄力")
        .set("ai", () => (get.event().favour ? "伤害或回复值加一" : "取消"))
        .set(
          "favour",
          get.attitude(p, t.target) * (get.tag(t.card, "damage") ? -1 : 1) > 0,
        )
        .forResult();
      if (r.control === "取消") return;
      p.storage.jgs_jiaoshi_zou--;
      p.syncStorage("jgs_jiaoshi_zou");
      useOnce(p, "jgs_jiaoshi_zou_used");
      p.logSkill("jgs_jiaoshi_zou");
      const use = t.getParent();
      use.jgs_jiaoshi_zou = true;
      if (r.control === "不可被响应") use.directHit.addArray(game.players);
      else if (r.control === "伤害或回复值加一")
        use.baseDamage = (use.baseDamage || 1) + 1;
      else await p.gainPlayerCard(t.player, "hej", true);
      game.addGlobalSkill("jgs_jiaoshi_zou_draw");
    },
  },
  jgs_jiaoshi_zou_draw: {
    trigger: { player: "damageEnd" },
    forced: true,
    popup: false,
    filter: (e) => e.getParent("useCard").jgs_jiaoshi_zou,
    async content(e, t, p) {
      await p.draw();
    },
  },
  jgs_zhangzhu: {
    trigger: {
      global: [
        "loseAfter",
        "equipAfter",
        "addJudgeAfter",
        "gainAfter",
        "loseAsyncAfter",
        "addToExpansionAfter",
      ],
    },
    direct: true,
    filter: (e, p) =>
      game.hasPlayer((q) => {
        const l = e.getl?.(q);
        return (
          l &&
          [
            ["h", "hs"],
            ["e", "es"],
            ["j", "js"],
          ].some(([zone, key]) => l[key]?.length && !q.countCards(zone))
        );
      }),
    async content(e, t, p) {
      const eligible = game.filterPlayer((q) => {
        const l = t.getl(q);
        return (
          l &&
          [
            ["h", "hs"],
            ["e", "es"],
            ["j", "js"],
          ].some(([zone, key]) => l[key]?.length && !q.countCards(zone))
        );
      });
      for (const q of eligible) {
        if (!p.isIn() || !q.isIn()) continue;
        const r = await p
          .chooseBool(
            "仗助：失去1点体力，令" +
              get.translation(q) +
              "摸三张牌且手牌上限加二？",
          )
          .set("ai", () => get.event().good && get.player().hp > 1)
          .set("good", get.attitude(p, q) > 0)
          .forResult();
        if (r.bool) {
          p.logSkill("jgs_zhangzhu", q);
          await p.loseHp();
          await q.draw(3);
          q.addTempSkill("jgs_zhangzhu_limit");
          q.addMark("jgs_zhangzhu_limit", 2, false);
        }
      }
    },
    subSkill: {
      limit: {
        charlotte: true,
        onremove: true,
        mod: { maxHandcard: (p, n) => n + p.countMark("jgs_zhangzhu_limit") },
      },
    },
  },
  jgs_jiaoyi_li: {
    enable: "phaseUse",
    usable: 1,
    position: "he",
    filterCard: true,
    selectCard: [1, 2],
    discard: false,
    lose: false,
    delay: false,
    selectTarget: [1, 2],
    filterTarget: (c, p, q) => q !== p,
    multitarget: true,
    async content(e, t, p) {
      const recipients = [];
      for (const c of e.cards) {
        let q = e.targets[0];
        if (e.targets.length > 1) {
          const r = await p
            .chooseTarget(
              "胶易：将" + get.translation(c) + "交给谁？",
              true,
              (c, p, q) => get.event().eligible.includes(q),
            )
            .set("eligible", e.targets)
            .set("ai", (q) => get.attitude(get.player(), q))
            .forResult();
          q = r.targets[0];
        }
        await p.give(c, q);
        recipients.add(q);
      }
      for (const q of recipients) {
        const cards = q
          .getCards("hej")
          .filter(
            (c) =>
              get.position(c) === "h" ||
              (get.position(c) === "e" && p.canEquip(c)) ||
              (get.position(c) === "j" && p.canAddJudge(c)),
          );
        if (!cards.length) continue;
        const r = await q
          .chooseButton([
            "胶易：可以将自己区域内一张牌移动给" + get.translation(p),
            cards,
          ])
          .set("ai", (b) =>
            get.attitude(get.player(), get.event().target) > 0
              ? 5 - get.value(b.link)
              : 0,
          )
          .set("target", p)
          .forResult();
        if (r.bool) {
          const c = r.links[0],
            pos = get.position(c);
          if (pos === "e") await p.equip(c);
          else if (pos === "j") await p.addJudge(c.viewAs || c.name, [c]);
          else await q.give(c, p);
        }
      }
    },
    ai: { order: 6, result: { target: 1 } },
  },
  jgs_shijie_li: {
    trigger: { global: ["gainAfter", "loseAsyncAfter"] },
    direct: true,
    filter: (e, p) =>
      p.countCards("he") &&
      e.getParent("phaseDraw").name !== "phaseDraw" &&
      game.hasPlayer((q) =>
        e.getg?.(q)?.some((c) => get.owner(c) === q && get.position(c) === "h"),
      ),
    async content(e, t, p) {
      const targets = game.filterPlayer((q) =>
        t.getg(q).some((c) => get.owner(c) === q && get.position(c) === "h"),
      );
      for (const q of targets) {
        const cards = t
          .getg(q)
          .filter((c) => get.owner(c) === q && get.position(c) === "h");
        if (!cards.length || !p.countCards("he")) continue;
        const r = await p
          .chooseToDiscard(
            "he",
            "势解：弃一张牌，展示" + get.translation(q) + "新获得的一张牌",
          )
          .set("ai", () => 0)
          .forResult();
        if (!r.bool) continue;
        p.logSkill("jgs_shijie_li", q);
        const choice = await p
          .choosePlayerCard(q, "h", true)
          .set("filterButton", (b) => get.event().eligible.includes(b.link))
          .set("eligible", cards)
          .forResult();
        if (!choice.cards?.length) continue;
        const c = choice.cards[0];
        await q.showCards([c], "势解");
        if (!get.tag(c, "damage") && !get.tag(c, "recover")) {
          if (
            (
              await p
                .chooseBool("势解：令其重铸此牌？")
                .set("ai", () => true)
                .forResult()
            ).bool
          )
            await q.recast(c);
        } else {
          q.addTempSkill("jgs_shijie_li_range");
          await q.chooseUseTarget(
            c,
            false,
            "势解：立即使用此牌（无次数距离限制）",
          );
          q.removeSkill("jgs_shijie_li_range");
        }
      }
    },
    subSkill: {
      range: {
        charlotte: true,
        mod: { targetInRange: () => true, cardUsable: () => Infinity },
      },
    },
  },
};
