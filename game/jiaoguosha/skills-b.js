import { lib, game, ui, get, _status } from "noname";
import {
  loss,
  phases,
  used,
  useOnce,
  lost,
  flip,
  others,
  edible,
  selectTarget,
  cardsInDiscard,
  topUse,
} from "./shared.js";

export default {
  jgs_yingshe: {
    trigger: { player: phases },
    direct: true,
    filter: (e, p) => !p.getHistory("sourceDamage").length,
    async content(e, t, p) {
      if (
        !(
          await p
            .chooseBool("婴摄：将手牌调整至手牌上限，并记录一张背置牌？")
            .set(
              "ai",
              () =>
                get.player().countCards("h") <= get.player().getHandcardLimit(),
            )
            .forResult()
        ).bool
      )
        return;
      p.logSkill("jgs_yingshe");
      const n = Math.max(0, p.getHandcardLimit()) - p.countCards("h");
      if (n > 0) await p.draw(n);
      else if (n < 0) await p.chooseToDiscard("h", -n, true);
      const cards = p.getCards("hej", (c) => c.hasGaintag("eternal_jgs_back"));
      if (cards.length) {
        const r = await p
          .chooseButton(["婴摄：记录牌名", cards], true)
          .forResult();
        if (r.links?.length)
          p.markAuto(
            "jgs_heze",
            r.links.map((c) => get.name(c)),
          );
      }
    },
  },
  jgs_luanlu: {
    trigger: loss,
    direct: true,
    filter: (e, p) =>
      lost(e, p)?.cards2?.length &&
      ((p.isMaxHandcard() && !used(p, "jgs_luanlu_top")) ||
        (p.isMinHandcard() && !used(p, "jgs_luanlu_recast"))) &&
      p.countCards("hej"),
    async content(e, t, p) {
      const options = [];
      if (p.isMaxHandcard() && !used(p, "jgs_luanlu_top"))
        options.push("置于牌堆顶");
      if (p.isMinHandcard() && !used(p, "jgs_luanlu_recast"))
        options.push("重铸");
      options.push("取消");
      const r = await p
        .chooseControl(options)
        .set("prompt", "峦麓")
        .set("ai", () =>
          get.event().controls.includes("重铸") ? "重铸" : "取消",
        )
        .forResult();
      if (r.control === "取消") return;
      const c = await p
        .chooseCard("hej", true, "峦麓：选择一张牌")
        .set("ai", (c) => 6 - get.value(c))
        .forResult();
      if (!c.cards?.length) return;
      p.logSkill("jgs_luanlu");
      if (r.control === "重铸") {
        useOnce(p, "jgs_luanlu_recast");
        await p.recast(c.cards);
      } else {
        useOnce(p, "jgs_luanlu_top");
        await p.lose(c.cards, ui.cardPile, "insert");
        game.updateRoundNumber();
      }
    },
  },
  jgs_heze: {
    enable: ["chooseToUse", "chooseToRespond"],
    mark: true,
    intro: { content: "已记录：$" },
    filter: (e, p) =>
      p
        .getStorage("jgs_heze")
        .some((n) => !p.getStorage("jgs_heze_used").includes(n)) &&
      p.hasCard((c) => get.color(c) === "red", "he"),
    chooseButton: {
      dialog(e, p) {
        return ui.create.dialog("赫责", [
          p
            .getStorage("jgs_heze")
            .filter((n) => !p.getStorage("jgs_heze_used").includes(n))
            .map((n) => [get.type(n), "", n]),
          "vcard",
        ]);
      },
      filter(b, p) {
        const e = get.event().getParent();
        return e.filterCard({ name: b.link[2] }, p, e);
      },
      check: (b) => get.player().getUseValue({ name: b.link[2] }),
      backup(links) {
        return {
          filterCard: (c) => get.color(c) === "red",
          position: "he",
          viewAs: { name: links[0][2] },
          check: (c) => 6 - get.value(c),
          async precontent(e, t, p) {
            p.markAuto("jgs_heze_used", [e.result.card.name]);
          },
        };
      },
      prompt: () => "赫责：将一张红色牌转化",
    },
    ai: { order: 6, respondSha: true, respondShan: true },
  },
  jgs_yimeng: {
    trigger: { player: "gainAfter", global: "loseAsyncAfter" },
    forced: true,
    filter: (e, p) => e.getg?.(p)?.length && p.countCards("hej"),
    async content(e, t, p) {
      const r = await p
        .chooseCard("hej", true, "呓梦：将一张牌翻面")
        .set("ai", (c) =>
          c.hasGaintag("eternal_jgs_back") ? 10 : 1 - get.value(c),
        )
        .forResult();
      if (r.cards?.length) flip(r.cards[0]);
    },
  },
  jgs_jiaoshi_a: {
    trigger: loss,
    direct: true,
    filter(e, p) {
      const l = lost(e, p);
      return (
        l?.hs?.length && !["useCard", "respond"].includes(e.getParent()?.name)
      );
    },
    async content(e, t, p) {
      const q = await selectTarget(
        p,
        "胶使：令一名角色摸一张牌",
        () => true,
        false,
        true,
      );
      if (q) {
        p.logSkill("jgs_jiaoshi_a", q);
        await q.draw();
      }
    },
  },
  jgs_guayan: {
    trigger: { global: ["useSkill", "logSkillBegin"] },
    direct: true,
    filter: (e, p) =>
      e.player !== p &&
      p.storage.jgs_guayan_round !== game.roundNumber &&
      !lib.skill[e.skill]?.charlotte,
    async content(e, t, p) {
      const q = await selectTarget(
        p,
        "寡言：预测下一名受到伤害的角色",
        () => true,
      );
      if (!q) return;
      const r = await p
        .chooseControl("basic", "trick", "equip")
        .set("prompt", "寡言：预测下一张使用的牌的类型")
        .set("ai", () => "basic")
        .forResult();
      p.storage.jgs_guayan_round = game.roundNumber;
      p.storage.jgs_guayan_prediction = {
        target: q.playerid,
        type: r.control,
        damage: false,
        card: false,
      };
      p.syncStorage("jgs_guayan_prediction");
      p.logSkill("jgs_guayan");
    },
    group: ["jgs_guayan_predict", "jgs_guayan_judge", "jgs_guayan_use"],
    mark: true,
    intro: { content: "expansion", markcount: "expansion" },
    subSkill: {
      predict: {
        trigger: { global: ["damageEnd", "useCard1"] },
        forced: true,
        popup: false,
        filter(e, p) {
          const s = p.storage.jgs_guayan_prediction;
          return s && (e.name === "damage" ? !s.damage : !s.card);
        },
        async content(e, t, p) {
          const s = p.storage.jgs_guayan_prediction;
          let correct;
          if (t.name === "damage") {
            s.damage = true;
            correct = s.target === t.player.playerid;
          } else {
            s.card = true;
            correct = s.type === get.type2(t.card);
          }
          if (!correct) return;
          p.logSkill("jgs_guayan");
          await p.draw();
          const r = await p
            .chooseCard("he", true, "寡言：将一张牌置于武将牌上")
            .set("ai", (c) => 5 - get.value(c))
            .forResult();
          if (!r.cards?.length) return;
          const old = p
            .getExpansions("jgs_guayan")
            .filter((c) => get.suit(c) === get.suit(r.cards[0]));
          if (old.length) await p.loseToDiscardpile(old);
          await p.addToExpansion(r.cards, p, "give").gaintag.add("jgs_guayan");
        },
      },
      judge: {
        trigger: { global: "judge" },
        direct: true,
        filter: (e, p) => p.getExpansions("jgs_guayan").length > 0,
        async content(e, t, p) {
          const r = await p
            .chooseButton(["寡言：替换判定牌", p.getExpansions("jgs_guayan")])
            .set(
              "ai",
              (b) =>
                get.event().judge(b.link) - get.event().judge(get.event().old),
            )
            .set("judge", t.judge)
            .set("old", t.player.judging[0])
            .forResult();
          if (r.bool) await lib.jgs.rejudge(p, r.links[0], t);
        },
      },
      use: {
        enable: ["chooseToUse", "chooseToRespond"],
        filter: (e, p) =>
          p.getExpansions("jgs_guayan").some((c) => e.filterCard(c, p, e)),
        chooseButton: {
          dialog(e, p) {
            return ui.create.dialog("寡言", p.getExpansions("jgs_guayan"));
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
                const c = lib.skill.jgs_guayan_use_backup.card;
                e.result.cards = [c];
                e.result.card = get.autoViewAs(c, [c]);
              },
            };
          },
          prompt: () => "寡言：使用武将牌上的牌",
        },
        ai: { order: 7, respondSha: true, respondShan: true },
      },
    },
  },
  jgs_xiejiao: {
    trigger: loss,
    direct: true,
    filter: (e, p) => lost(e, p)?.cards2?.length >= 2,
    async content(e, t, p) {
      const q = await selectTarget(
        p,
        "挟胶：选择一名其他角色",
        (c, p, q) => q !== p,
      );
      if (q) await lib.jgs.xiejiao(p, q);
    },
  },
  jgs_chishi: {
    enable: "phaseUse",
    usable: 1,
    filter: (e, p) => game.hasPlayer((q) => p.canCompare(q)),
    selectTarget: [1, 3],
    filterTarget: (c, p, q) => p.canCompare(q),
    multitarget: true,
    multiline: true,
    async content(e, t, p) {
      const compare = p
        .chooseToCompare(e.targets)
        .setContent("chooseToCompareMeanwhile");
      const r = await compare.forResult();
      const winner = r.winner;
      if (!winner) return;
      let cards = [compare.card1, ...(compare.cardlist || [])]
        .filter(Boolean)
        .filter((c) => ["o", "d"].includes(get.position(c, true)));
      const participants = [p, ...e.targets],
        counts = {};
      while (
        cards.length &&
        participants.some((q) => q.isIn() && (counts[q.playerid] || 0) < 2)
      ) {
        const c = await winner
          .chooseButton(["持识：选择分配的拼点牌", cards], true)
          .forResult();
        if (!c.links?.length) break;
        const q = await winner
          .chooseTarget("持识：选择获得者", true, (c, p, q) =>
            get.event().eligible.includes(q),
          )
          .set(
            "eligible",
            participants.filter(
              (q) => q.isIn() && (counts[q.playerid] || 0) < 2,
            ),
          )
          .set("ai", (q) => get.attitude(get.player(), q))
          .forResult();
        const target = q.targets?.[0];
        if (!target) break;
        const card = c.links[0];
        counts[target.playerid] = (counts[target.playerid] || 0) + 1;
        cards.remove(card);
        await target.gain(card, "gain2");
        if (!card.hasGaintag("eternal_jgs_back")) flip(card);
        game.broadcastAll(function (c) {
          c.addGaintag("eternal_jgs_chishi");
        }, card);
      }
    },
    ai: { order: 6, result: { player: 1 } },
  },
  jgs_qisan: {
    trigger: { global: "compareCardShowBefore" },
    direct: true,
    filter: (e, p) =>
      (e.player === p || e.target === p || e.targets?.includes(p)) &&
      p.countCards("h"),
    async content(e, t, p) {
      const cards = [t.card1, ...(t.cardlist || [t.card2])].filter(Boolean);
      const r = await p
        .chooseButton(["欺三：选择要替换的拼点牌", cards])
        .forResult();
      if (!r.bool) return;
      const c = await p
        .chooseCard("h", true, "欺三：用一张手牌替换")
        .set("ai", (c) => get.number(c) - get.value(c))
        .forResult();
      if (!c.cards?.length) return;
      const old = r.links[0],
        next = c.cards[0];
      await p.lose(next, ui.ordering);
      await game.cardsDiscard(old);
      if (t.card1 === old) {
        t.card1 = next;
        t.num1 = get.number(next);
        if (t.result) t.result.player = next;
      } else if (t.cardlist) {
        const i = t.cardlist.indexOf(old);
        t.cardlist[i] = next;
        if (t.result) {
          t.result.targets[i] = next;
          if (t.result.num2) t.result.num2[i] = get.number(next);
        }
      } else {
        t.card2 = next;
        t.num2 = get.number(next);
        if (t.result) t.result.target = next;
      }
      p.logSkill("jgs_qisan");
      const participants = [t.player, ...(t.targets || [t.target])].filter(
        (q) => q && q !== p,
      );
      t.jgs_qisan = { owner: p, guesses: [] };
      for (const q of participants) {
        await q.draw();
        const guess = await q
          .chooseBool("欺三：你猜" + get.translation(p) + "会赢得此次拼点吗？")
          .set("ai", () => Math.random() > 0.5)
          .forResult();
        t.jgs_qisan.guesses.push([q, guess.bool]);
      }
    },
    group: "jgs_qisan_result",
    subSkill: {
      result: {
        trigger: { global: "chooseToCompareAfter" },
        forced: true,
        popup: false,
        filter: (e, p) => e.jgs_qisan?.owner === p,
        async content(e, t, p) {
          const win =
            t.result?.winner === p ||
            (!t.targets &&
              (t.player === p
                ? t.result?.bool
                : !t.result?.bool && !t.result?.tie));
          for (const [q, guess] of t.jgs_qisan.guesses) {
            if (guess === !!win) await q.draw();
            else {
              if (
                q.isIn() &&
                (
                  await p
                    .chooseBool(
                      "欺三：对猜错的" + get.translation(q) + "发动挟胶？",
                    )
                    .set("ai", () => true)
                    .forResult()
                ).bool
              )
                await lib.jgs.xiejiao(p, q);
            }
          }
        },
      },
    },
  },
  jgs_feihe: {
    trigger: { global: "phaseEnd" },
    frequent: true,
    filter: (e, p) =>
      p.getHistory("sourceDamage").reduce((n, e) => n + e.num, 0) +
        p.getHistory("damage").reduce((n, e) => n + e.num, 0) >
      p.hp,
    async content(e, t, p) {
      await p.draw(2);
    },
  },
  jgs_chuqing: {
    trigger: { player: phases },
    forced: true,
    filter: (e, p) => p.countCards("h") && !p.storage.jgs_chuqing_off,
    async content(e, t, p) {
      const before = p.getHistory("useCard").at(-1)?.card;
      const r = await p
        .chooseToUse({
          prompt: "触擎：使用一张牌，否则受到1点伤害并停用至下回合开始",
          jgs_chuqing: true,
        })
        .forResult();
      if (!r.bool) {
        p.storage.jgs_chuqing_off = true;
        await p.damage("nosource");
      } else {
        const c = p.getHistory("useCard").at(-1)?.card;
        if (
          before &&
          c &&
          (get.suit(before) === get.suit(c) ||
            get.number(before) === get.number(c))
        )
          await p.draw();
      }
    },
    group: "jgs_chuqing_reset",
    subSkill: {
      reset: {
        trigger: { player: "phaseBegin" },
        forced: true,
        popup: false,
        async content(e, t, p) {
          delete p.storage.jgs_chuqing_off;
        },
      },
    },
  },
  jgs_dianyin: {
    trigger: loss,
    group: "jgs_dianyin_gain",
    direct: true,
    filter(e, p) {
      return (
        _status.currentPhase === p &&
        lost(e, p)?.cards2?.length &&
        p.storage.jgs_dianyin_phase !== lib.jgs.phaseKey(e) &&
        p.hasUseTarget({ name: "huogong" })
      );
    },
    async content(e, t, p) {
      await lib.jgs.dianyin(p, t);
    },
    subSkill: {
      gain: {
        trigger: { player: "gainAfter" },
        direct: true,
        filter(e, p) {
          return (
            _status.currentPhase === p &&
            e.getg(p).length &&
            p.storage.jgs_dianyin_phase !== lib.jgs.phaseKey(e) &&
            p.hasUseTarget({ name: "huogong" })
          );
        },
        async content(e, t, p) {
          await lib.jgs.dianyin(p, t);
        },
      },
    },
  },
  jgs_enheng: {
    init(p) {
      p.storage.jgs_enheng ??= 0;
    },
    mark: true,
    marktext: "蓄",
    intro: { content: (s) => "蓄力 " + (s || 0) + "/3" },
    trigger: { global: "useCard1" },
    direct: true,
    filter: (e, p) => p.storage.jgs_enheng > 0,
    async content(e, t, p) {
      const options = ["发动制衡", "摸一张牌", "下次属性伤害摸三张"].filter(
        (_, i) => !used(p, "jgs_enheng_" + i),
      );
      if (!options.length) return;
      options.push("取消");
      const r = await p
        .chooseControl(options)
        .set("prompt", "恩衡：消耗1点蓄力")
        .set("ai", () =>
          get.event().controls.includes("摸一张牌") ? "摸一张牌" : "取消",
        )
        .forResult();
      if (r.control === "取消") return;
      const i = ["发动制衡", "摸一张牌", "下次属性伤害摸三张"].indexOf(
        r.control,
      );
      p.storage.jgs_enheng--;
      p.syncStorage("jgs_enheng");
      useOnce(p, "jgs_enheng_" + i);
      p.logSkill("jgs_enheng");
      if (i === 0) {
        const hand = p.getCards("h");
        const r = await p
          .chooseCard(
            "he",
            [1, Infinity],
            "恩衡：弃牌并摸等量牌（弃置全部手牌额外摸一张）",
          )
          .set("ai", (c) => 6 - get.value(c))
          .forResult();
        if (r.bool) {
          const bonus = hand.length && hand.every((c) => r.cards.includes(c));
          await p.discard(r.cards);
          await p.draw(r.cards.length + (bonus ? 1 : 0));
        }
      } else if (i === 1) await p.draw();
      else p.addTempSkill("jgs_enheng_damage");
    },
    group: "jgs_enheng_show",
    subSkill: {
      show: {
        trigger: { player: "showCardsAfter" },
        forced: true,
        popup: false,
        filter: (e, p) =>
          e.cards?.some((c) => get.position(c) === "h" && get.owner(c) === p),
        async content(e, t, p) {
          p.storage.jgs_enheng = Math.min(3, (p.storage.jgs_enheng || 0) + 1);
          p.syncStorage("jgs_enheng");
          p.markSkill("jgs_enheng");
        },
      },
      damage: {
        charlotte: true,
        trigger: { player: "damageEnd" },
        forced: true,
        filter: (e) => !!e.nature,
        async content(e, t, p) {
          p.removeSkill("jgs_enheng_damage");
          await p.draw(3);
        },
      },
    },
  },
};
