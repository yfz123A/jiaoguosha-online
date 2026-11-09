import { lib, game, ui, get, _status } from "noname";
import {
  used,
  useOnce,
  others,
  selectTarget,
  chooseName,
  topUse,
  cardsInDiscard,
} from "./shared.js";

export default {
  jgs_yinmeng: {
    enable: "phaseUse",
    filter(e, p) {
      return (
        (p.getStat("skill").jgs_yinmeng || 0) <
          (p.storage.jgs_yinmeng_numbers?.[0] || 1) && p.countCards("h")
      );
    },
    init(p) {
      p.storage.jgs_yinmeng_numbers ??= [1, 1, 1, 1, 1];
    },
    selectTarget() {
      return [1, get.player().storage.jgs_yinmeng_numbers[1]];
    },
    filterTarget: (c, p, q) => q !== p && q.countCards("h"),
    multitarget: true,
    async content(e, t, p) {
      const r = await p.chooseToDebate([p, ...e.targets]).forResult(),
        n = p.storage.jgs_yinmeng_numbers;
      if (r.opinion === "red") {
        for (const q of e.targets) {
          if (q.countCards("he"))
            await q.chooseToGive(
              p,
              "he",
              Math.min(n[2], q.countCards("he")),
              true,
            );
          await q.draw(n[3]);
        }
      } else if (r.opinion === "black") {
        const cards = [...(r.red || []), ...(r.black || [])]
          .map((x) => x[1])
          .filter((c) => get.owner(c)?.isIn());
        const target = await p
          .chooseTarget(
            "音盟：将所有意见牌当杀使用",
            [1, n[4]],
            (c, p, q) => q !== p && p.canUse({ name: "sha" }, q),
          )
          .set("ai", (q) =>
            get.effect(q, { name: "sha" }, get.player(), get.player()),
          )
          .forResult();
        if (target.bool) {
          for (const owner of [...new Set(cards.map((c) => get.owner(c)))])
            await owner.lose(
              cards.filter((c) => get.owner(c) === owner),
              ui.ordering,
            );
          await p.useCard({ name: "sha" }, cards, target.targets);
        }
      }
    },
    ai: { order: 5, result: { player: 1 } },
  },
  jgs_meimo: {
    trigger: { player: "phaseJieshuBegin" },
    check: (e, p) => p.isTurnedOver() || p.countCards("h") < 3,
    async content(e, t, p) {
      await p.turnOver();
      await p.draw(2);
      const cards = [
        ...Array.from(ui.discardPile.childNodes),
        ...game.filterPlayer().flatMap((q) => q.getCards("e")),
      ].filter((c) => get.type(c) === "equip" && p.canEquip(c));
      if (!cards.length) return;
      const r = await p
        .chooseButton(["寐魔：装备一张场上或弃牌堆中的装备", cards], true)
        .set("ai", (b) => get.equipValue(b.link))
        .forResult();
      if (r.links?.length) await p.equip(r.links[0]);
    },
  },
  jgs_jiashi_huang: {
    trigger: { player: "phaseEnd" },
    forced: true,
    filter: (e, p) => p.countEnabledSlot() > 0,
    async content(e, t, p) {
      const slots = Array.from({ length: 5 }, (_, i) => i + 1).filter((i) =>
        p.hasEnabledSlot(i),
      );
      const r = await p
        .chooseControl(slots.map((i) => "equip" + i))
        .set("prompt", "甲释：废除一个装备栏")
        .set("ai", () => get.event().controls.randomGet())
        .forResult();
      const slot = Number(r.control.slice(5)),
        had = p.getCards("e", (c) => get.subtype(c) === "equip" + slot).length;
      await p.disableEquip(slot);
      const last = p.countEnabledSlot() === 0;
      if (last) await p.loseMaxHp();
      if (had || last) {
        const n = p.storage.jgs_yinmeng_numbers,
          limit = last ? 3 : 2,
          eligible = n
            .map((x, i) => (x < limit ? i : -1))
            .filter((i) => i >= 0);
        if (!eligible.length) return;
        const labels = [
          "发动次数",
          "议事人数",
          "交牌数量",
          "摸牌数量",
          "杀的目标数",
        ];
        const choice = await p
          .chooseControl(eligible.map((i) => labels[i]))
          .set("prompt", "甲释：将一个数值改为" + limit)
          .set("ai", () => 0)
          .forResult();
        n[labels.indexOf(choice.control)] = limit;
        p.syncStorage("jgs_yinmeng_numbers");
        p.markSkill("jgs_yinmeng");
      }
    },
  },
  jgs_fangshen: {
    jgsPersistent: true,
    trigger: { global: "gameDrawAfter", player: "phaseBegin" },
    direct: true,
    mark: true,
    intro: {
      content(s, p) {
        return (
          Object.values(p.storage.jgs_fangshen_cards || {})
            .map(
              (x) =>
                get.translation(x.hero) +
                "：" +
                x.skills.map((n) => get.translation(n)).join("、"),
            )
            .join("<br>") || "尚无胶兵"
        );
      },
    },
    async content(e, t, p) {
      const r = await p
        .chooseCard("h", [1, 3], "仿身：将至多三张手牌换为胶兵")
        .set("ai", (c) =>
          c.hasGaintag("eternal_jgs_glue") ? 0 : 5 - get.value(c),
        )
        .forResult();
      if (!r.bool) return;
      const pool = Object.entries(lib.character)
        .map(([hero, c]) => ({
          hero,
          skills: (c.skills || []).filter((id) => lib.jgs.fangshenEligible(id)),
        }))
        .filter((x) => x.skills.length);
      if (!pool.length) return;
      const generated = r.cards.map(() => {
        const entry = pool.randomGet(),
          card = game.createCard2("sha", "heart", 8);
        p.storage.jgs_fangshen_cards ??= {};
        p.storage.jgs_fangshen_cards[card.cardid] = entry;
        card.addGaintag("eternal_jgs_glue");
        return card;
      });
      await p.lose(r.cards, ui.special);
      await p.gain(generated, "draw");
      p.logSkill("jgs_fangshen");
      lib.jgs.refreshGlue(p);
    },
    group: ["jgs_fangshen_consume", "jgs_fangshen_loss"],
    subSkill: {
      consume: {
        trigger: { player: ["useSkill", "logSkillBegin"] },
        forced: true,
        popup: false,
        priority: 100,
        filter(e, p) {
          const id = get.sourceSkillFor(e);
          return (
            Object.values(p.storage.jgs_fangshen_cards || {}).some((x) =>
              x.skills.includes(id),
            ) && !id.startsWith("jgs_fangshen")
          );
        },
        async content(e, t, p) {
          const id = get.sourceSkillFor(t);
          const card = p
            .getCards("h")
            .find((c) =>
              p.storage.jgs_fangshen_cards?.[c.cardid]?.skills.includes(id),
            );
          if (card) {
            await p.lose(card, ui.special);
            delete p.storage.jgs_fangshen_cards[card.cardid];
            lib.jgs.refreshGlue(p);
          }
        },
      },
      loss: {
        trigger: { player: "loseAfter" },
        forced: true,
        popup: false,
        filter: (e, p) => e.hs?.some((c) => c.hasGaintag("eternal_jgs_glue")),
        async content(e, t, p) {
          for (const c of t.hs.filter((c) => c.hasGaintag("eternal_jgs_glue")))
            if (get.owner(c) !== p)
              delete p.storage.jgs_fangshen_cards?.[c.cardid];
          lib.jgs.refreshGlue(p);
        },
      },
    },
  },
  jgs_jiaoshi_wang: {
    trigger: { player: "loseAfter", global: "loseAsyncAfter" },
    forced: true,
    filter: (e, p) => e.type === "discard" && e.getl(p)?.cards2?.length,
    async content(e, t, p) {
      const old = p.getStorage("jgs_jiaoshi_wang"),
        cards = t.getl(p).cards2;
      p.removeAdditionalSkill("jgs_jiaoshi_wang");
      if (old.length) await p.draw(old.length);
      const pool = [
        "new_yajiao",
        "clanhuanjia",
        "starjiaohao",
        "yanjiao",
        "jiaozhao",
        "jgs_jiaoyu",
        "oljiaowei",
        "jiaozi",
        "starjiaowang",
        "jiaojin",
        "shanjia",
        "spyingjia",
        "hujia",
      ];
      const skills = [
        ...new Set(
          cards.map((c) => pool[get.number(c, false) - 1]).filter(Boolean),
        ),
      ];
      p.storage.jgs_jiaoshi_wang = skills;
      p.syncStorage("jgs_jiaoshi_wang");
      p.addAdditionalSkill("jgs_jiaoshi_wang", skills);
      p.markSkill("jgs_jiaoshi_wang");
    },
    mark: true,
    intro: {
      content: (s) => (s || []).map((x) => get.translation(x)).join("、"),
    },
  },
  jgs_jiaoyu: {
    trigger: { player: "phaseEnd" },
    forced: true,
    async content(e, t, p) {
      const cards = [];
      for (let i = 0, n = p.countCards("e"); i < n; i++) {
        const r = await p
          .judge(() => 0)
          .set("judge2", () => true)
          .forResult();
        if (r.card) cards.push(r.card);
      }
      const r = await p
        .chooseControl("red", "black")
        .set("prompt", "椒遇：选择颜色并获得对应判定牌")
        .set("ai", () => "red")
        .forResult();
      const gains = cardsInDiscard(cards).filter(
        (c) => get.color(c) === r.control,
      );
      if (gains.length) await p.gain(gains, "gain2");
      p.storage.jgs_jiaoyu_color = r.control;
      p.addSkill("jgs_jiaoyu_limit");
      await p.phaseUse();
      p.removeSkill("jgs_jiaoyu_limit");
    },
    subSkill: {
      limit: {
        charlotte: true,
        mod: {
          cardEnabled(c, p) {
            if (get.color(c) !== p.storage.jgs_jiaoyu_color) return false;
          },
        },
      },
    },
  },
  jgs_jujiao: {
    trigger: { global: "loseAfter" },
    direct: true,
    filter: (e, p) =>
      e.getParent("jgs_jiaoda").player === p && cardsInDiscard(e.cards).length,
    async content(e, t, p) {
      const r = await p
        .chooseButton(
          ["聚胶：将花色不同的弃牌放至牌堆底", cardsInDiscard(t.cards)],
          [1, 4],
        )
        .set(
          "filterButton",
          (b) =>
            !ui.selected.buttons.some(
              (x) => get.suit(x.link) === get.suit(b.link),
            ),
        )
        .set("ai", () => 1)
        .forResult();
      if (!r.bool) return;
      const m = await p
        .chooseToMove("聚胶：排列牌堆底（左侧更靠近牌堆底）", true)
        .set("list", [["牌堆底", r.links]])
        .forResult();
      const cards = m.moved?.[0] || r.links;
      await game.cardsGotoPile(cards, "bottom");
      const n = p.storage.jgs_jiaoda_numbers || [1, 1],
        opts = [];
      if (n[0] < 3) opts.push("摸牌数");
      if (n[1] < 3) opts.push("弃牌数");
      if (opts.length) {
        const c = await p
          .chooseControl(opts)
          .set("prompt", "聚胶：提高一个数值")
          .set("ai", () => 0)
          .forResult();
        n[c.control === "摸牌数" ? 0 : 1]++;
        p.storage.jgs_jiaoda_numbers = n;
        p.syncStorage("jgs_jiaoda_numbers");
        p.markSkill("jgs_jiaoda");
      }
    },
  },
  jgs_jiaoda: {
    enable: "phaseUse",
    usable: 1,
    init(p) {
      p.storage.jgs_jiaoda_numbers ??= [1, 1];
    },
    filter: (e, p) => !p.hasSkill("jgs_jiaoda_off"),
    filterTarget: () => true,
    mark: true,
    intro: {
      content(s, p) {
        return (
          "摸" +
          p.storage.jgs_jiaoda_numbers[0] +
          "弃" +
          p.storage.jgs_jiaoda_numbers[1]
        );
      },
    },
    async content(e, t, p) {
      const [draw, discard] = p.storage.jgs_jiaoda_numbers;
      await e.target.draw(draw);
      await e.target.chooseToDiscard("he", discard, true);
      if (e.target === p && Math.max(draw, discard) === 3) await p.loseHp();
    },
    group: "jgs_jiaoda_dice",
    subSkill: {
      dice: {
        trigger: { player: "loseHpAfter" },
        forced: true,
        filter: (e, p) =>
          p.storage.jgs_jiaoda_numbers?.every((n) => n === 3) &&
          !p.hasSkill("jgs_jiaoda_off"),
        async content(e, t, p) {
          p.addSkill("jgs_jiaoda_off");
          p.storage.jgs_jiaoda_off_phase = p.phaseNumber;
          const die = get.rand(1, 6);
          game.log(p, "胶打掷骰：", die);
          await lib.jgs.dice(p, die);
        },
      },
      off: {
        charlotte: true,
        mark: true,
        intro: { content: "胶打停用至下个出牌阶段结束" },
        trigger: { player: "phaseUseEnd" },
        forced: true,
        popup: false,
        filter: (e, p) => p.phaseNumber > p.storage.jgs_jiaoda_off_phase,
        async content(e, t, p) {
          p.removeSkill("jgs_jiaoda_off");
        },
      },
    },
    ai: { order: 7, result: { target: 1 } },
  },
  jgs_shengzhan: {
    trigger: { player: "phaseJieshuBegin" },
    check: () => true,
    async content(e, t, p) {
      p.addTempSkill("jgs_shengzhan_nohand");
      await p.turnOver();
      p.storage.jgs_pile_access = "bottom";
      p.addSkill("jgs_pile_use");
      await p.phaseUse();
      p.removeSkill("jgs_pile_use");
      delete p.storage.jgs_pile_access;
    },
    subSkill: {
      nohand: {
        charlotte: true,
        mod: {
          cardEnabled(c, p) {
            if (
              c.cards?.some(
                (x) => get.owner(x) === p && get.position(x) === "h",
              ) ||
              (get.owner(c) === p && get.position(c) === "h")
            )
              return false;
          },
        },
      },
    },
  },
  jgs_taowang: {
    trigger: { player: "loseAfter", global: "loseAsyncAfter" },
    zhuSkill: true,
    direct: true,
    filter: (e, p) => e.type === "discard" && e.getl(p)?.cards2?.length,
    async content(e, t, p) {
      for (const q of others(p).filter((q) => q.group === "qun")) {
        const cards = [...p.getCards("hej"), ...q.getCards("hej")];
        if (!cards.length) continue;
        const r = await q
          .chooseButton(["滔王：可以重铸主公或自己的一张牌", cards])
          .set("ai", (b) =>
            get.owner(b.link) === get.player() ? 6 - get.value(b.link) : 0,
          )
          .forResult();
        if (r.bool) {
          const owner = get.owner(r.links[0]);
          await owner.recast(r.links);
        }
      }
    },
  },
  jgs_butan: {
    trigger: { player: "useCardAfter", target: "useCardToTargeted" },
    forced: true,
    popup: false,
    filter: (e) => get.tag(e.card, "damage"),
    async content(e, t, p) {
      if (t.name === "useCard") {
        p.storage.jgs_butan = true;
        p.markSkill("jgs_butan");
      } else {
        p.storage.jgs_butan = false;
        p.unmarkSkill("jgs_butan");
      }
    },
    intro: { content: "不能使用手牌中的杀、决斗，直到成为伤害牌目标" },
    mod: {
      cardEnabled(c, p) {
        if (
          p.storage.jgs_butan &&
          ["sha", "juedou"].includes(c.name) &&
          ((get.owner(c) === p && get.position(c) === "h") ||
            c.cards?.some((x) => get.owner(x) === p && get.position(x) === "h"))
        )
          return false;
      },
    },
  },
  jgs_haoyan: {
    enable: "phaseUse",
    usable: 1,
    filterTarget: (c, p, q) => q !== p,
    async content(e, t, p) {
      const q = e.target;
      const r = await p
        .chooseControl("自己使用决斗", "对方使用决斗")
        .set("ai", () => (get.player().storage.jgs_butan ? 1 : 0))
        .forResult();
      const from = r.index === 0 ? p : q,
        to = r.index === 0 ? q : p;
      if (!from.countCards("he") || !from.canUse({ name: "juedou" }, to))
        return;
      const c = await from
        .chooseCard("he", true, "豪言：将一张牌当决斗使用")
        .set("ai", (c) => 6 - get.value(c))
        .forResult();
      if (!c.cards?.length) return;
      const access = get.cards(to.getDamagedHp(), true);
      to.storage.jgs_pile_cards = access;
      to.storage.jgs_pile_access = "fixed";
      to.addSkill("jgs_pile_use");
      const use = from.useCard(
        { name: "juedou", storage: { jgs_haoyan: true } },
        c.cards,
        to,
      );
      await use;
      to.removeSkill("jgs_pile_use");
      delete to.storage.jgs_pile_access;
      const win = game.hasPlayer2((x) =>
        x.hasHistory(
          "damage",
          (d) => d.getParent("useCard") === use && d.source === p,
        ),
      );
      if (win) {
        p.storage.jgs_pile_cards = access.filter(
          (c) => get.position(c, true) === "c",
        );
        p.storage.jgs_pile_access = "fixed";
        p.addTempSkill("jgs_pile_use");
      }
    },
    ai: { order: 4, result: { target: -1 } },
  },
  jgs_zhenggui: {
    trigger: { global: "useCard2" },
    direct: true,
    filter: (e, p) =>
      e.player !== p &&
      get.tag(e.card, "damage") &&
      e.player.canUse(e.card, p, false),
    async content(e, t, p) {
      if (
        !(
          await p
            .chooseBool("征归：成为此伤害牌的优先目标？")
            .set("ai", () => false)
            .forResult()
        ).bool
      )
        return;
      p.logSkill("jgs_zhenggui");
      t.targets.remove(p);
      t.targets.unshift(p);
      t.fixedSeat = true;
      t.jgs_zhenggui = p;
      p.addTempSkill("jgs_zhenggui_resolve");
    },
    subSkill: {
      resolve: {
        trigger: {
          target: "useCardToEnd",
        },
        forced: true,
        popup: false,
        filter(e, p) {
          const use = e.getParent("useCard");
          return (
            use?.jgs_zhenggui === p && e.target === p && !use.jgs_zhenggui_done
          );
        },
        async content(e, t, p) {
          const use = t.getParent("useCard");
          use.jgs_zhenggui_done = true;
          const hurt = p.hasHistory(
            "damage",
            (d) => d.getParent("useCard") === use,
          );
          const responded =
            p.hasHistory(
              "respond",
              (r) =>
                r.getParent("useCard") === use || r.respondTo?.[1] === use.card,
            ) || p.hasHistory("useCard", (r) => r.respondTo?.[1] === use.card);
          if (!hurt && responded) {
            const targets = use.targets.filter((q) => q !== p);
            use.excluded.addArray(targets);
            await p.draw(targets.length);
          }
        },
      },
    },
  },
  jgs_dandan: {
    trigger: { player: "phaseDrawBegin1" },
    direct: true,
    async content(e, t, p) {
      const link = await chooseName(
        p,
        "蛋啖：跳过摸牌，视为使用一张牌",
        ["wuzhong", "wugu", "dz_mantianguohai", "sha"],
        false,
      );
      if (!link) return;
      const card = {
        name: link[2],
        isCard: true,
        storage: { jgs_dandan_draw: true },
      };
      if (!p.hasUseTarget(card)) return;
      t.changeToZero();
      const use = p.chooseUseTarget(card, true);
      await use;
      const last = p.getHistory("useCard").at(-1);
      if (
        last?.card?.name === card.name &&
        !last.all_excluded &&
        !last.excluded?.length &&
        !last.jgs_dandan_neutralized
      ) {
        const r = await p
          .chooseCard("he", "蛋啖：将一张牌当不可抵消的无中生有使用")
          .set("ai", (c) => 8 - get.value(c))
          .forResult();
        if (r.bool) {
          const e = p.useCard(
            { name: "wuzhong", storage: { jgs_dandan: true } },
            r.cards,
            p,
          );
          e.directHit = game.players.slice();
          await e;
        }
      }
    },
    group: "jgs_dandan_watch",
    subSkill: {
      watch: {
        trigger: { global: "useCardToEnd" },
        forced: true,
        popup: false,
        filter: (e) => e.card.storage?.jgs_dandan_draw && e._neutralized,
        async content(e, t) {
          t.getParent("useCard").jgs_dandan_neutralized = true;
        },
      },
    },
  },
  jgs_jiaozhou: {
    enable: "phaseUse",
    usable: 1,
    position: "he",
    filterCard: true,
    viewAs: { name: "wugu", storage: { jgs_jiaozhou: true } },
    check: (c) => 6 - get.value(c),
    group: ["jgs_jiaozhou_order", "jgs_jiaozhou_gain"],
    mod: {
      ignoredHandcard: (c) => c.hasGaintag("jgs_jiaozhou"),
      cardDiscardable(c, p, name) {
        if (name === "phaseDiscard" && c.hasGaintag("jgs_jiaozhou"))
          return false;
      },
    },
    subSkill: {
      order: {
        trigger: { player: "useCard2" },
        forced: true,
        popup: false,
        filter: (e) => e.card.storage?.jgs_jiaozhou,
        async content(e, t, p) {
          t.targets.sortBySeat(p.getNext());
          t.fixedSeat = true;
        },
      },
      gain: {
        trigger: { player: "gainAfter" },
        forced: true,
        popup: false,
        filter: (e, p) => e.getParent("useCard").card?.storage?.jgs_jiaozhou,
        async content(e, t, p) {
          p.addGaintag(t.cards, "jgs_jiaozhou");
        },
      },
    },
  },
  jgs_shuhu: {
    trigger: { player: "damageEnd" },
    getIndex: (e) => e.num,
    direct: true,
    async content(e, t, p) {
      const q = await selectTarget(
        p,
        "倏忽：令一名角色使用瞒天过海",
        (c, p, q) => q.hasUseTarget({ name: "dz_mantianguohai" }),
        false,
        true,
      );
      if (q) {
        p.logSkill("jgs_shuhu", q);
        await q.chooseUseTarget(
          { name: "dz_mantianguohai", isCard: true },
          true,
        );
      }
    },
  },
  jgs_daoma: {
    trigger: { global: "useCardAfter" },
    direct: true,
    filter: (e, p) => e.targets?.length > 1 && e.targets.includes(p),
    async content(e, t, p) {
      p.addTempSkill("jgs_daoma_bow");
      await p.chooseToUse({
        prompt: "盗马：使用一张杀（无次数距离限制，并发动麒麟弓）",
        filterCard: (c, p) => get.name(c) === "sha",
        addCount: false,
      });
      p.removeSkill("jgs_daoma_bow");
    },
    subSkill: {
      bow: {
        charlotte: true,
        inherit: "qilin_skill",
        mod: {
          targetInRange(c) {
            if (c.name === "sha") return true;
          },
          cardUsable(c) {
            if (c.name === "sha") return Infinity;
          },
        },
      },
    },
  },
};
