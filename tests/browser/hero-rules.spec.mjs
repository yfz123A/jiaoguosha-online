import { test, expect } from "@playwright/test";
import { createApp } from "../../server/index.mjs";

async function choose(page) {
  await page.evaluate(() => {
    const { game, ui, _status, get } = __jgs,
      e = _status.event;
    if (!_status.imchoosing || e.player !== game.me) return;
    if (e.name === "chooseButton") {
      const b = ui.dialog?.buttons?.find((b) =>
        b.classList.contains("selectable"),
      );
      if (b) {
        _status.clicked = false;
        ui.click.button.call(b);
      }
      if (ui.confirm?.str?.includes("o")) ui.click.ok();
    } else if (
      ["chooseToUse", "chooseToRespond", "chooseBool"].includes(e.name) ||
      ui.confirm?.str?.includes("c")
    )
      ui.click.cancel();
    else if (["chooseCard", "chooseToDiscard"].includes(e.name)) {
      for (const c of game.me
        .getCards("he")
        .filter((c) => c.classList.contains("selectable"))
        .slice(0, get.select(e.selectCard)[0])) {
        _status.clicked = false;
        ui.click.card.call(c);
      }
      if (ui.confirm?.str?.includes("o")) ui.click.ok();
    }
  });
}
async function fixture(browser, humans = 1) {
  const app = await createApp({ adminToken: "rules-test" }),
    origin = `http://127.0.0.1:${app.port}`,
    contexts = [],
    pages = [],
    errors = [];
  for (let i = 0; i < humans; i++) {
    const context = await browser.newContext({
      viewport: { width: 1360, height: 900 },
    });
    contexts.push(context);
    const p = await context.newPage();
    pages.push(p);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource"))
        errors.push(m.text());
    });
    p.on("dialog", async (d) => {
      errors.push(d.message());
      await d.accept();
    });
    await p.goto(origin + (i ? "/" : "/#host=rules-test"));
    await p.fill("#nickname", i ? "客机" : "测试房主");
    await p.fill("#password", "rules-pass");
    if (!i) {
      await p.selectOption("#character-pack", "mixed");
      await p.selectOption("#test-hero", "jgs_huangyilong");
    }
    await p.click("#submit");
    await p.waitForFunction(
      () => window.__jgs?.game.connectPlayers?.length === 4,
    );
  }
  await pages[0].waitForFunction(
    (n) =>
      __jgs.game.connectPlayers.filter(
        (p) => p.nickname && (p.playerid === "1" || p.ws?.inited),
      ).length === n,
    humans,
  );
  await pages[0].evaluate(() => {
    const { lib, ui } = __jgs;
    lib.config.game_speed = "vvfast";
    lib.configOL.banned.push(
      ...Object.keys(lib.characterPack.jiaoguosha).filter(
        (n) => n !== __jgs.session.testHero,
      ),
    );
    ui.connectStartButton.click();
  });
  for (let n = 0; n < 200; n++) {
    for (const p of pages) await choose(p);
    if (
      await pages[0].evaluate(
        () =>
          __jgs.game.players.length === 4 &&
          __jgs.game.players.every((p) => p.name) &&
          __jgs._status.imchoosing &&
          __jgs._status.event.name === "chooseToUse",
      )
    )
      break;
    await pages[0].waitForTimeout(100);
  }
  return {
    app,
    origin,
    contexts,
    pages,
    errors,
    async close() {
      await Promise.all(contexts.map((c) => c.close()));
      await app.close();
    },
  };
}

test("真实结算：摔打成长、巨贾逐名触发、死竭重置、背置规则", async ({
  browser,
}, info) => {
  const f = await fixture(browser),
    p = f.pages[0];
  try {
    await p.evaluate(() => {
      const { game, ui, _status, lib } = __jgs;
      const e = game.createEvent("jgs_rule_scenario");
      e.setContent(async function () {
        const { game, ui, get, lib } = window.__jgs,
          p = game.me;
        for (const q of game.players) q.clearSkills(true);
        p.storage = {};
        p.init("jgs_huangyilong");
        p.hp = 4;
        p.update();
        await p.damage(1, "nosource");
        await p.damage(1, "nosource");
        await p.damage(1, "nosource");
        const growth = {
          hp: p.hp,
          max: p.maxHp,
          marks: p.countMark("jgs_shuaida"),
          limit: p.getHandcardLimit(),
        };
        p.init("jgs_chengyifan");
        p.hp = 2;
        p.update();
        await p.useCard({ name: "tao", isCard: true }, p);
        const first = p.maxHp;
        await p.useCard({ name: "tao", isCard: true }, p);
        const repeat = p.maxHp;
        await p.useCard({ name: "jiu", isCard: true }, p);
        await p.useCard({ name: "taoyuan", isCard: true }, game.players);
        await p.useCard(game.createCard("chitu", "heart", 5), p);
        const food = {
          first,
          repeat,
          max: p.maxHp,
          shebao: p.hasSkill("jgs_shebao"),
        };
        p.init("jgs_xixifujiao");
        p.hp = 1;
        p.storage.jgs_shijie = true;
        p.awakenedSkills.add("jgs_shijie");
        p.update();
        await p.damage(1, "nosource");
        const revive = {
          hp: p.hp,
          max: p.maxHp,
          spent: !!p.storage.jgs_shijie,
          awake: p.awakenedSkills.includes("jgs_shijie"),
        };
        const card = game.createCard("sha", "heart", 7);
        p.directgain([card]);
        lib.jgs.flip(card);
        const response = { name: "chooseToRespond", getParent: () => ({}) };
        const back = {
          use: lib.filter.cardEnabled(card, p, "forceEnable"),
          respond: lib.filter.cardRespondable(card, p, response),
          discard: lib.filter.cardDiscardable(card, p, "phaseDiscard"),
          converted: lib.filter.cardEnabled(
            get.autoViewAs({ name: "sha" }, [card]),
            p,
            "forceEnable",
          ),
        };
        const material = game.createCard("shan", "club", 6);
        await p.equip(get.autoViewAs({ name: "zhuque" }, [material]));
        const proxy = p.getCards("e").find((c) => c.name === "zhuque"),
          range = p.getEquipRange();
        lib.jgs.flip(proxy);
        const equipment = {
          before: range,
          after: p.getEquipRange(),
          skills: p.getSkills("e"),
          occupied: p.countCards("e"),
        };
        window.__jgsScenario = { growth, food, revive, back, equipment };
        game.pause();
      });
      if (!_status.auto) ui.click.auto("forced");
    });
    await p.waitForFunction(() => window.__jgsScenario, null, {
      timeout: 45000,
    });
    const result = await p.evaluate(() => __jgsScenario);
    console.log("rules", JSON.stringify(result));
    expect(f.errors).toEqual([]);
    expect(result.growth).toEqual({ hp: 1, max: 5, marks: 3, limit: 4 });
    expect(result.food).toEqual({ first: 6, repeat: 6, max: 9, shebao: true });
    expect(result.revive).toEqual({
      hp: 1,
      max: 3,
      spent: false,
      awake: false,
    });
    expect(result.back).toEqual({
      use: false,
      respond: true,
      discard: true,
      converted: true,
    });
    expect(result.equipment.before).toBe(4);
    expect(result.equipment.after).toBe(1);
    expect(result.equipment.skills).not.toContain("zhuque_skill");
    expect(result.equipment.occupied).toBeGreaterThan(0);
    await p.screenshot({ path: info.outputPath("rules-table.png") });
  } finally {
    await f.close();
  }
});

test("客机重连恢复背置牌和皇战点数", async ({ browser }, info) => {
  const f = await fixture(browser, 2),
    host = f.pages[0],
    guest = f.pages[1];
  try {
    const id = await guest.evaluate(() => __jgs.game.me.playerid);
    const cardid = await host.evaluate((id) => {
      const { game, lib, _status } = __jgs,
        p = lib.playerOL[id];
      game.broadcastAll(function () {
        for (const q of game.players) q.clearSkills(true);
      });
      const card = game.createCard("sha", "heart", 7);
      p.directgain([card]);
      lib.jgs.flip(card);
      game.broadcastAll(function () {
        _status.jgs_jokers = ["sha", "shan"];
      });
      return card.cardid;
    }, id);
    await guest.waitForFunction(
      (cardid) =>
        __jgs.game.me
          .getCards("h")
          .some((c) => c.cardid === cardid && c.hasGaintag("eternal_jgs_back")),
      cardid,
    );
    expect(
      await guest.evaluate(
        (cardid) =>
          __jgs.get.number(
            __jgs.game.me.getCards("h").find((c) => c.cardid === cardid),
          ),
        cardid,
      ),
    ).toBe(14);
    await guest.close();
    await host.waitForFunction(() => __jgs.offline.size === 1);
    const restored = await f.contexts[1].newPage();
    restored.on("pageerror", (e) => f.errors.push(e.message));
    await restored.goto(f.origin + "/play");
    await restored.waitForFunction(
      (cardid) =>
        window.__jgs?.game.me
          ?.getCards("h")
          .some(
            (c) => c.cardid === cardid && c.hasGaintag("eternal_jgs_back"),
          ) &&
        __jgs.get.number(
          __jgs.game.me.getCards("h").find((c) => c.cardid === cardid),
        ) === 14,
      cardid,
      { timeout: 45000 },
    );
    await host.waitForFunction(() => __jgs.offline.size === 0);
    expect(await restored.evaluate(() => __jgs._status.auto)).toBe(false);
    expect(f.errors).toEqual([]);
    await restored.screenshot({
      path: info.outputPath("rejoined-backed-card.png"),
    });
  } finally {
    await f.close();
  }
});
