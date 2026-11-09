import { lib, game, ui, get, _status } from "noname";
import {
  edible,
  used,
  useOnce,
  mark,
  others,
  selectTarget,
  chooseName,
  virtual,
  cardsInDiscard,
  topUse,
} from "./shared.js";

export default {
  jgs_yinjin: {
    trigger: { player: "useCardAfter" },
    direct: true,
    filter(e, p) {
      const h = p.getHistory("useCard");
      return (
        !used(p, "jgs_yinjin_used") &&
        p.countCards("h") &&
        h.length > 1 &&
        get.type2(h.at(-1).card) === get.type2(h.at(-2).card)
      );
    },
    async content(e, t, p) {
      const link = await chooseName(
        p,
        "瘾金：将一张手牌转化并使用",
        [
          ["基本", "", "sha", "fire"],
          ["锦囊", "", "huogong"],
          ["装备", "", "zhuque"],
        ],
        false,
      );
      if (!link) return;
      const r = await p
        .chooseCard("h", "瘾金：选择转化材料")
        .set("ai", (c) => 6 - get.value(c))
        .forResult();
      if (!r.bool) return;
      useOnce(p, "jgs_yinjin_used");
      p.logSkill("jgs_yinjin");
      await p.chooseUseTarget(
        { name: link[2], nature: link[3] },
        r.cards,
        true,
      );
    },
  },
  jgs_lanniang: {
    enable: "chooseToUse",
    filter(e, p) {
      return (
        !used(p, "jgs_lanniang_used") &&
        e.filterCard?.({ name: "jiu", isCard: true }, p, e)
      );
    },
    selectCard: -1,
    filterCard: () => false,
    delay: false,
    async content(e, t, p) {
      useOnce(p, "jgs_lanniang_used");
      const neighbours = [p.getPrevious(), p.getNext()].filter(
        (q, i, a) => q !== p && a.indexOf(q) === i,
      );
      for (const q of neighbours) {
        if (!p.isIn() || !q.isIn()) continue;
        let r;
        do {
          r = await p.chooseToPSS(q).forResult();
        } while (r.tie && p.isIn() && q.isIn());
        const winner = r.bool ? p : q,
          loser = r.bool ? q : p;
        loser.addTempSkill("jgs_jiushi");
        winner.addTempSkill("jgs_lanniang_win");
        await winner.chooseToUse({
          prompt: "揽酿：可以使用与酒押韵的转化牌",
          filterCard: (c) => c.storage?.jgs_lanniang === true,
          addCount: false,
        });
        winner.removeSkill("jgs_lanniang_win");
      }
    },
    ai: { order: 3, result: { player: 1 } },
  },
  jgs_lanniang_win: {
    enable: "chooseToUse",
    charlotte: true,
    chooseButton: {
      dialog() {
        return ui.create.dialog("揽酿", [
          ["wuzhong", "juedou", "jiu", "hualiu"].map((n) => [
            get.type(n),
            "",
            n,
          ]),
          "vcard",
        ]);
      },
      filter(b, p) {
        return (
          p.countCards("h") >= get.translation(b.link[2]).length &&
          get
            .event()
            .getParent()
            .filterCard(
              {
                name: b.link[2],
                isCard: true,
                storage: { jgs_lanniang: true },
              },
              p,
              get.event().getParent(),
            )
        );
      },
      check: (b) => get.player().getUseValue({ name: b.link[2] }),
      backup(links) {
        return {
          filterCard: true,
          position: "h",
          selectCard: get.translation(links[0][2]).length,
          viewAs: { name: links[0][2], storage: { jgs_lanniang: true } },
          check: (c) => 6 - get.value(c),
          async precontent(e, t, p) {
            e.result.card.storage = { jgs_lanniang: true };
          },
        };
      },
      prompt: (links) =>
        "揽酿：选择" + get.translation(links[0][2]).length + "张手牌",
    },
    mod: {
      cardUsable(c) {
        if (c.storage?.jgs_lanniang) return Infinity;
      },
    },
    group: "jgs_lanniang_win_reward",
    subSkill: {
      reward: {
        trigger: { player: "useCardAfter" },
        forced: true,
        popup: false,
        filter: (e, p) =>
          e.card.storage?.jgs_lanniang &&
          e.card.name !== "jiu" &&
          e.cards.length > p.hp,
        async content(e, t, p) {
          await p.draw(2);
        },
      },
    },
  },
  jgs_jiushi: {
    enable: "chooseToUse",
    filter: (e, p) => !p.isTurnedOver(),
    filterCard: () => false,
    selectCard: -1,
    viewAs: { name: "jiu", isCard: true },
    async precontent(e, t, p) {
      await p.turnOver();
      p.addTempSkill("jgs_jiushi_sha");
    },
    group: ["jgs_jiushi_record", "jgs_jiushi_recover"],
    subSkill: {
      sha: {
        charlotte: true,
        mod: {
          cardUsable(c, p, n) {
            if (c.name === "sha") return n + 1;
          },
        },
      },
      record: {
        trigger: { player: "damageBegin4" },
        forced: true,
        popup: false,
        async content(e, t, p) {
          t.jgs_jiushi_facedown = p.isTurnedOver();
        },
      },
      recover: {
        trigger: { player: "damageEnd" },
        filter: (e) => e.jgs_jiushi_facedown,
        check: () => true,
        async content(e, t, p) {
          if (p.isTurnedOver()) await p.turnOver();
        },
      },
    },
    ai: {
      order: 3,
      respondTao: true,
      skillTagFilter: (p, tag, arg) =>
        arg?.type === "dying" && !p.isTurnedOver(),
    },
  },
  jgs_wuci: {
    trigger: { global: "phaseEnd" },
    forced: true,
    filter(e, p) {
      return (
        p.hasHistory(
          "useCard",
          (x) =>
            x.card.name === "jiu" &&
            (get.is.virtualCard(x.card) || get.is.convertedCard(x.card)),
        ) &&
        p.hasCard(
          (c) =>
            c.isViewAsCard ||
            (!!c[c.cardSymbol] && get.is.convertedCard(c[c.cardSymbol])),
          "ej",
        )
      );
    },
    async content(e, t, p) {
      const cards = p.getCards(
        "ej",
        (c) =>
          c.isViewAsCard ||
          (!!c[c.cardSymbol] && get.is.convertedCard(c[c.cardSymbol])),
      );
      if (cards.length) await p.recast(cards);
      await p.turnOver();
      const pool = lib.jgs.gainableSkills(p, "【杀】");
      if (pool.length) {
        const id = pool.randomGet();
        p.addAdditionalSkill("jgs_wuci_gift", id);
        p.addSkill("jgs_wuci_expire");
        p.storage.jgs_wuci_turn = p.phaseNumber;
      }
    },
    subSkill: {
      expire: {
        charlotte: true,
        trigger: { player: "phaseEnd" },
        forced: true,
        popup: false,
        filter: (e, p) => p.phaseNumber > p.storage.jgs_wuci_turn,
        async content(e, t, p) {
          p.removeAdditionalSkill("jgs_wuci_gift");
          p.removeSkill("jgs_wuci_expire");
        },
      },
    },
  },
  jgs_jiaoshi: {
    enable: ["chooseToUse", "chooseToRespond"],
    init(p) {
      p.storage.jgs_jiaoshi_names ??= ["tiesuo", "sha", "shandian"];
    },
    filter: (e, p) => p.hasCard((c) => get.type(c) === "basic", "h"),
    chooseButton: {
      dialog(e, p) {
        return ui.create.dialog("胶始", [
          p.storage.jgs_jiaoshi_names
            .slice(0, 2)
            .map((n) => [
              get.type(n),
              "",
              n,
              n === "sha" ? "thunder" : undefined,
            ]),
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
          selectCard: [1, Infinity],
          viewAs: {
            name: links[0][2],
            nature: links[0][3],
            storage: { jgs_jiaoshi: true },
          },
          check: (c) => 6 - get.value(c),
          async precontent(e) {
            e.result.card.storage = { jgs_jiaoshi: true };
          },
        };
      },
      prompt: () => "胶始：选择任意张基本牌",
    },
    group: "jgs_jiaoshi_judge",
    subSkill: {
      judge: {
        trigger: { player: ["useCardAfter", "respondAfter"] },
        forced: true,
        filter: (e) => e.card.storage?.jgs_jiaoshi,
        async content(e, t, p) {
          await lib.jgs.delayedJudge(p, p.storage.jgs_jiaoshi_names[2], false);
        },
      },
    },
    ai: { order: 5, respondSha: true },
  },
  jgs_jiaoshi_quota: {
    mod: {
      selectTarget(c, p, range) {
        if (!get.is.convertedCard(c)) return;
        const x = c.cards?.length || 0;
        if (!x) return;
        const n =
          get.type2(c) === "trick" ? x + 1 : get.type(c) === "basic" ? x : null;
        if (n && range[1] !== -1) range[1] = Math.max(range[1], n);
      },
    },
  },
  jgs_dajiao: {
    trigger: { player: ["phaseUseBegin", "damageEnd"] },
    direct: true,
    async content(e, t, p) {
      const q = await selectTarget(
        p,
        "打搅：与一名其他角色随机分配手牌",
        (c, p, q) => q !== p,
      );
      if (!q) return;
      p.logSkill("jgs_dajiao", q);
      const a = p.getCards("h"),
        b = q.getCards("h"),
        all = [...a, ...b].randomSort();
      await game
        .loseAsync({
          lose_list: [
            [p, a],
            [q, b],
          ],
        })
        .setContent("chooseToCompareLose");
      await p.gain(all.slice(0, Math.floor(all.length / 2)), "draw");
      await q.gain(all.slice(Math.floor(all.length / 2)), "draw");
    },
  },
  jgs_luanjiao: {
    enable: "phaseUse",
    limited: true,
    skillAnimation: true,
    animationColor: "water",
    filter: (e, p) => !p.storage.jgs_luanjiao,
    selectCard: -1,
    filterCard: () => false,
    async content(e, t, p) {
      p.awakenSkill("jgs_luanjiao");
      const cards = get.cards(3);
      await game.cardsGotoOrdering(cards);
      await p.showCards(cards, "乱胶");
      const groups = [["trick"], ["basic"], ["delay"]];
      for (let i = 0; i < 3; i++) {
        const names = [
          ...new Set(
            cards
              .filter((c) => groups[i].includes(get.type(c)))
              .map((c) => get.name(c)),
          ),
        ];
        if (!names.length) continue;
        const link = await chooseName(
          p,
          "乱胶：选择替换的" + ["普通锦囊", "基本牌", "延时锦囊"][i],
          names,
        );
        if (link) p.storage.jgs_jiaoshi_names[i] = link[2];
      }
      p.syncStorage("jgs_jiaoshi_names");
      await lib.jgs.delayedJudge(p, "shandian", true);
    },
    ai: { order: 2, result: { player: 1 } },
  },
  jgs_jiaowu: {
    trigger: { player: "dying" },
    zhuSkill: true,
    limited: true,
    skillAnimation: true,
    filter: (e, p) => !p.storage.jgs_jiaowu && p.hp <= 0,
    async content(e, t, p) {
      p.awakenSkill("jgs_jiaowu");
      await p.recover(1 - p.hp);
      for (const q of others(p).filter((q) => q.group === "wu")) {
        const controls = ["受到1点伤害", "取消"];
        if (q.countCards("he") >= 2) controls.unshift("弃置两张牌");
        const r = await q
          .chooseControl(controls)
          .set("prompt", "胶吴：协助主公")
          .set("ai", () =>
            get.attitude(get.player(), game.zhu) > 0 ? 0 : "取消",
          )
          .forResult();
        if (r.control === "取消") continue;
        if (r.control === "弃置两张牌") {
          await q.chooseToDiscard("he", 2, true);
          await p.recover();
        } else {
          await q.damage("nosource");
          await p.draw(2);
        }
      }
    },
  },
  jgs_shuaida: {
    trigger: { player: "damageEnd" },
    forced: true,
    mark: true,
    marktext: "锻",
    intro: { content: "mark" },
    async content(e, t, p) {
      p.addMark("jgs_shuaida", t.num);
      p.storage.jgs_shuaida_hits = (p.storage.jgs_shuaida_hits || 0) + 1;
      if (p.storage.jgs_shuaida_hits % 3 === 0) await p.gainMaxHp();
    },
    mod: {
      maxHandcard: (p, n) => n + p.countMark("jgs_shuaida"),
      cardUsable(c, p, n) {
        if (c.name === "sha") return n + p.countMark("jgs_shuaida");
      },
    },
  },
  jgs_yuji: {
    trigger: { player: "phaseZhunbeiBegin" },
    filter: (e, p) => p.isDamaged() && !p.hasSkill("jgs_yuji_heal"),
    check: (e, p) => p.hp < 3,
    async content(e, t, p) {
      p.addTempSkill("jgs_yuji_nobasic");
      p.addSkill("jgs_yuji_heal");
    },
    subSkill: {
      nobasic: {
        charlotte: true,
        mark: true,
        intro: { content: "本回合不能使用或打出基本牌" },
        mod: {
          cardEnabled(c) {
            if (get.type(c) === "basic") return false;
          },
          cardRespondable(c) {
            if (get.type(c) === "basic") return false;
          },
          cardSavable(c) {
            if (get.type(c) === "basic") return false;
          },
        },
      },
      heal: {
        charlotte: true,
        trigger: { player: "phaseBegin" },
        forced: true,
        async content(e, t, p) {
          p.removeSkill("jgs_yuji_heal");
          await p.recover();
          const n = p.countMark("jgs_shuaida");
          if (n) {
            const r = await p
              .chooseControl(Array.from({ length: n + 1 }, (_, i) => String(i)))
              .set("prompt", "愈肌：移去多少个锻并摸等量牌？")
              .set("ai", () => 0)
              .forResult();
            const x = Number(r.control);
            if (x) {
              p.removeMark("jgs_shuaida", x);
              await p.draw(x);
            }
          }
        },
      },
    },
  },
  jgs_tuifei: {
    enable: "phaseUse",
    usable: 1,
    filterTarget: (c, p, q) =>
      q !== p && q.hp >= p.hp && q.canUse({ name: "juedou" }, p),
    async content(e, t, p) {
      await e.target.useCard({ name: "juedou", isCard: true }, p);
    },
    ai: { order: 3, result: { target: -1 } },
  },
  jgs_jiashi: {
    enable: "chooseToUse",
    filter: (e, p) =>
      !p.storage.jgs_jiashi &&
      p.maxHp > 1 &&
      p.isDamaged() &&
      (e.type === "phase" || e.dying === p),
    filterCard: () => false,
    selectCard: -1,
    async content(e, t, p) {
      p.storage.jgs_jiashi = true;
      await p.loseMaxHp();
      await p.recover();
      p.addMark("jgs_shuaida", 1);
      p.markSkill("jgs_jiashi");
    },
    mark: true,
    intro: {
      content: (s) => (s ? "已经发动；赢得决斗或拼点后重置" : "可以发动"),
    },
    group: "jgs_jiashi_reset",
    subSkill: {
      reset: {
        trigger: {
          source: "damageSource",
          player: "chooseToCompareAfter",
          target: "chooseToCompareAfter",
        },
        forced: true,
        popup: false,
        filter(e, p) {
          if (e.name === "damage") return e.card?.name === "juedou";
          const r = e.result;
          return (
            r &&
            !r.tie &&
            ((e.player === p && r.bool) ||
              (e.target === p && !r.bool) ||
              r.winner === p)
          );
        },
        async content(e, t, p) {
          p.storage.jgs_jiashi = false;
          p.syncStorage("jgs_jiashi");
          p.markSkill("jgs_jiashi");
        },
      },
    },
    ai: { order: 7, result: { player: 1 } },
  },
  jgs_jiba: {
    trigger: { player: "judgeEnd" },
    forced: true,
    async content(e, t, p) {
      const c = t.result.card;
      if (t.result.number === 8 || get.name(c) === "bagua") {
        if (p.hp > 0) await p.loseHp(p.hp);
      } else if (p.hasUseTarget(c))
        await p.chooseUseTarget(c, "忌八：可以使用判定牌");
    },
  },
  jgs_jiaoshi_yan: {
    trigger: { global: "phaseDrawEnd" },
    direct: true,
    filter: (e, p) =>
      e.player !== p && p.countCards("he") && e.player.countCards("hej"),
    async content(e, t, p) {
      const r = await p
        .chooseCard(
          "he",
          "胶拾：将一张牌当顺手牵羊对" + get.translation(t.player) + "使用",
        )
        .set("ai", (c) => (get.event().att < 0 ? 7 - get.value(c) : 0))
        .set("att", get.attitude(p, t.player))
        .forResult();
      if (!r.bool) return;
      p.logSkill("jgs_jiaoshi_yan", t.player);
      await p.useCard(
        { name: "shunshou", storage: { jgs_jiaoshi_yan: true } },
        r.cards,
        t.player,
      );
      const cards = get.cards();
      await game.cardsGotoOrdering(cards);
      await p.addJudge({ name: "jgs_delayed" }, cards);
    },
    mod: {
      targetInRange(c) {
        if (c.storage?.jgs_jiaoshi_yan) return true;
      },
    },
  },
  jgs_huangzhong: {
    trigger: { global: "phaseJudgeBegin" },
    direct: true,
    zhuSkill: true,
    filter: (e, p) =>
      e.player !== p &&
      e.player.group === "wei" &&
      e.player.countCards("h") &&
      p.countCards("h"),
    async content(e, t, p) {
      if (
        !(
          await p
            .chooseBool(
              "皇中：与" + get.translation(t.player) + "同时展示一张手牌？",
            )
            .forResult()
        ).bool
      )
        return;
      const q = t.player;
      const r = await p
        .chooseCardOL([p, q], "皇中：选择展示牌", true)
        .forResult();
      const a = r[0]?.cards?.[0],
        b = r[1]?.cards?.[0];
      if (!a || !b) return;
      await p.showCards([a]);
      await q.showCards([b]);
      if (get.color(a) === get.color(b)) {
        for (const x of [p, q]) {
          const c = await x
            .chooseCard("hej", "皇中：可以重铸一张牌")
            .set("ai", (c) => 6 - get.value(c))
            .forResult();
          if (c.bool) await x.recast(c.cards);
        }
      }
      if (get.type2(a) === get.type2(b)) q.addSkill("jgs_huangzhong_hit");
    },
    subSkill: {
      hit: {
        charlotte: true,
        mark: true,
        intro: { content: "下一张使用的牌不能被响应" },
        trigger: { player: "useCard" },
        forced: true,
        async content(e, t, p) {
          t.directHit.addArray(game.players);
          p.removeSkill("jgs_huangzhong_hit");
        },
      },
    },
  },
  jgs_xunyao: {
    enable: "phaseUse",
    usable: 1,
    async content(e, t, p) {
      const cards = get.cards(4);
      await game.cardsGotoOrdering(cards);
      await p.showCards(cards, "寻肴");
      const food = cards.filter(edible);
      if (food.length) await p.gain(food, "gain2");
    },
    ai: { order: 7, result: { player: 1 } },
  },
  jgs_jiaoyi: {
    trigger: { player: "useCardAfter" },
    direct: true,
    filter: (e, p) =>
      !used(p, "jgs_jiaoyi_used") &&
      get.type(e.card) !== "equip" &&
      cardsInDiscard(e.cards).length > 0,
    async content(e, t, p) {
      const q = await selectTarget(
        p,
        "胶遗：将刚使用的牌交给一名其他角色",
        (c, p, q) => q !== p,
        false,
        true,
      );
      if (q) {
        useOnce(p, "jgs_jiaoyi_used");
        p.logSkill("jgs_jiaoyi", q);
        await q.gain(cardsInDiscard(t.cards), "gain2");
      }
    },
  },
  jgs_jujia: {
    trigger: { player: "useCardAfter" },
    forced: true,
    filter: (e, p) =>
      edible(e.card) && !p.getStorage("jgs_jujia").includes(e.card.name),
    mark: true,
    intro: { content: "已因这些牌增加体力上限：$" },
    async content(e, t, p) {
      p.markAuto("jgs_jujia", [t.card.name]);
      await p.gainMaxHp();
      if (p.maxHp > 8) await p.addSkills("jgs_shebao");
    },
    derivation: "jgs_shebao",
  },
  jgs_shebao: {
    trigger: { player: "phaseJieshuBegin" },
    forced: true,
    filter: (e, p) => !game.hasPlayer((q) => q.hp > p.hp),
    async content(e, t, p) {
      const r = await p
        .chooseControl("失去体力并开五谷", "减体力上限并赋予无双")
        .set("ai", () => 0)
        .forResult();
      if (r.index === 0) {
        await p.loseHp();
        if (!p.isIn()) return;
        const n = game.countPlayer();
        await p.draw(n);
        const c = await p
          .chooseCard(
            "he",
            Math.min(n, p.countCards("he")),
            true,
            "舍爆：选择放回牌堆顶的牌",
          )
          .forResult();
        if (c.cards?.length) {
          const m = await p
            .chooseToMove("舍爆：调整牌堆顶顺序", true)
            .set("list", [["牌堆顶", c.cards]])
            .forResult();
          await p.lose(m.moved?.[0] || c.cards, ui.cardPile, "insert");
        }
        await p.chooseUseTarget({ name: "wugu", isCard: true }, true);
      } else {
        await p.loseMaxHp();
        for (const q of [p, p.getPrevious(), p.getNext()]) {
          q.addAdditionalSkill("jgs_shebao_" + p.playerid, "wushuang");
        }
        p.storage.jgs_shebao_turn = p.phaseNumber;
        p.addSkill("jgs_shebao_expire");
      }
    },
    subSkill: {
      expire: {
        charlotte: true,
        trigger: { player: "phaseEnd" },
        forced: true,
        filter: (e, p) => p.phaseNumber > p.storage.jgs_shebao_turn,
        async content(e, t, p) {
          for (const q of [...game.players, ...game.dead])
            q.removeAdditionalSkill("jgs_shebao_" + p.playerid);
          p.removeSkill("jgs_shebao_expire");
        },
      },
    },
  },
};
