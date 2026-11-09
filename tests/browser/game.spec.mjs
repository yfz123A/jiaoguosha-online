import { test, expect } from "@playwright/test";
import { createApp } from "../../server/index.mjs";

for (const count of [4, 5, 6])
  test(`${count}真人：开房、选将、发牌、等待与结算`, async ({
    browser,
  }, testInfo) => {
    const app = await createApp({ adminToken: "browser-test" });
    const origin = `http://127.0.0.1:${app.port}`;
    const contexts = [],
      pages = [],
      errors = [];
    function observe(page, index) {
      page.on("pageerror", (e) => errors.push(`${index}: ${e.message}`));
      page.on("console", (m) => {
        if (
          m.type() === "error" &&
          !m.text().includes("Failed to load resource")
        )
          errors.push(`${index} console: ${m.text().slice(0, 500)}`);
      });
      page.on("dialog", async (d) => {
        if (!d.message().includes("请等所有真人"))
          errors.push(`${index} dialog: ${d.message().slice(0, 300)}`);
        await d.accept();
      });
    }
    async function openPlayer(i) {
      const mobile = count === 6 && i === 5;
      const context = await browser.newContext(
        mobile
          ? {
              viewport: { width: 844, height: 390 },
              isMobile: true,
              hasTouch: true,
            }
          : { viewport: { width: 1360, height: 900 } },
      );
      contexts.push(context);
      const page = await context.newPage();
      pages[i] = page;
      observe(page, i);
      await page.goto(origin + (i === 0 ? "/#host=browser-test" : "/"));
      await page.fill("#nickname", i ? "玩家" + i : "房主");
      await page.fill("#password", "test-pass");
      if (i === 0) {
        await page.selectOption("#players", String(count));
        await page.selectOption("#character-pack", "standard");
      }
      await page.click("#submit");
      await page.waitForFunction(
        (n) => window.__jgs?.game.connectPlayers?.length === n,
        count,
        { timeout: 60000 },
      );
      return page;
    }
    async function choose(page) {
      return page.evaluate(() => {
        const { ui, _status } = window.__jgs;
        if (!_status.imchoosing) return false;
        if (_status.event.name === "chooseButton") {
          const buttons =
            ui.dialog?.buttons?.filter((b) =>
              b.classList.contains("selectable"),
            ) || [];
          const b =
            buttons.find((b) =>
              [
                "caocao",
                "zhangfei",
                "machao",
                "zhaoyun",
                "guanyu",
                "huaxiong",
                "huangyueying",
              ].includes(b.link),
            ) || buttons[0];
          if (b) {
            _status.clicked = false;
            ui.click.button.call(b);
          }
          if (ui.confirm?.str?.includes("o")) ui.click.ok();
          return !!b;
        }
        if (_status.event.name === "chooseBool") {
          ui.click.cancel();
          return true;
        }
        return false;
      });
    }
    async function reconnect(i, { duplicate = false } = {}) {
      const old = pages[i],
        context = old.context();
      const before = await old.evaluate(() => ({
        id: __jgs.game.me.playerid,
        hand: __jgs.game.me.getCards("h").map((c) => c.cardid),
        event: __jgs._status.event.name,
      }));
      if (!duplicate) {
        await old.close();
        await pages[0].waitForFunction(() => __jgs.offline.size === 1);
      }
      const page = await context.newPage();
      pages[i] = page;
      observe(page, i + "R");
      await page.goto(origin + "/play");
      try {
        await page.waitForFunction(
          () => window.__jgs?._status.imchoosing,
          null,
          { timeout: 45000 },
        );
      } catch (e) {
        console.log("reconnect errors", errors);
        console.log(
          "host",
          await pages[0].evaluate(() => ({
            pending: [...__jgs.pending].map(([k, v]) => [
              k,
              String(v[0]).slice(0, 700),
            ]),
            offline: [...__jgs.offline],
            event: __jgs._status.event.name,
          })),
        );
        console.log(
          "guest",
          await page.evaluate(() => ({
            id: window.__jgs?.game.onlineID,
            event: window.__jgs?._status.event?.name,
            text: document.body.innerText.slice(0, 1200),
          })),
        );
        throw e;
      }
      expect(
        await page.evaluate(() => ({
          id: __jgs.game.me.playerid,
          hand: __jgs.game.me.getCards("h").map((c) => c.cardid),
          event: __jgs._status.event.name,
        })),
      ).toEqual(before);
      await pages[0].waitForFunction(() => __jgs.offline.size === 0);
      if (duplicate) await old.close();
    }
    try {
      await openPlayer(0);
      await pages[0].evaluate(() => {
        __jgs.game.connectPlayers
          .slice(1)
          .forEach((p) => p.classList.add("unselectable2"));
        __jgs.ui.connectStartButton.click();
      });
      expect(
        await pages[0].evaluate(() => __jgs._status.waitingForPlayer),
      ).toBeTruthy();
      await pages[0].evaluate(() =>
        __jgs.game.connectPlayers.forEach((p) =>
          p.classList.remove("unselectable2"),
        ),
      );
      await Promise.all(
        Array.from({ length: count - 1 }, (_, i) => openPlayer(i + 1)),
      );
      await pages[0].waitForFunction(
        () =>
          __jgs.game.connectPlayers.every(
            (p) => p.nickname && (p.playerid === "1" || p.ws?.inited),
          ),
        null,
        { timeout: 30000 },
      );
      console.log(count, "all seated");
      await pages[0].evaluate(() => __jgs.ui.connectStartButton.click());
      // Exercise a pending general choice before the characters have been initialized.
      if (count === 4) {
        let target = -1;
        for (let step = 0; step < 30 && target < 0; step++) {
          for (let i = 1; i < count; i++)
            if (
              await pages[i].evaluate(
                () =>
                  window.__jgs?._status.imchoosing &&
                  __jgs._status.event.name === "chooseButton",
              )
            ) {
              target = i;
              break;
            }
          if (target < 0) {
            await choose(pages[0]);
            await pages[0].waitForTimeout(200);
          }
        }
        expect(target).toBeGreaterThan(0);
        await reconnect(target);
        console.log(count, "general-choice reconnect passed");
      }
      for (let round = 0; round < 80; round++) {
        for (const page of pages) await choose(page);
        if (
          await pages[0].evaluate(
            () =>
              __jgs.game.phaseNumber >= 1 &&
              __jgs.game.players.every((p) => p.name),
          )
        )
          break;
        await pages[0].waitForTimeout(200);
      }
      for (const page of pages) {
        await page.waitForFunction(
          () => __jgs.game.phaseNumber >= 1 && __jgs.game.me?.name,
        );
        const state = await page.evaluate(() => ({
          n: __jgs.game.players.length,
          hand: __jgs.game.me.countCards("h"),
          auto: __jgs._status.auto,
          identity: __jgs.game.me.identity,
        }));
        expect(state.n).toBe(count);
        expect(state.hand).toBeGreaterThanOrEqual(4);
        expect(state.auto).toBe(false);
        expect(["zhu", "zhong", "nei", "fan"]).toContain(state.identity);
      }
      if (count === 4) {
        // The leader can be the host; end their phase to reach a remote player's active choice.
        let target = -1;
        for (let step = 0; step < 40 && target < 0; step++) {
          for (let i = 1; i < count; i++)
            if (
              await pages[i].evaluate(
                () =>
                  __jgs._status.imchoosing &&
                  __jgs._status.event.name === "chooseToUse",
              )
            ) {
              target = i;
              break;
            }
          if (target < 0) {
            await pages[0].evaluate(() => {
              const { ui, _status, game, get } = __jgs;
              if (!_status.imchoosing) return;
              if (_status.event.player !== game.me) return;
              if (
                _status.event.name === "chooseToUse" ||
                ui.confirm?.str?.includes("c")
              )
                ui.click.cancel();
              else if (_status.event.name === "chooseToDiscard") {
                const n = get.select(_status.event.selectCard)[0];
                for (const c of game.me
                  .getCards("h")
                  .filter((c) => c.classList.contains("selectable"))
                  .slice(0, n)) {
                  _status.clicked = false;
                  ui.click.card.call(c);
                }
                if (ui.confirm?.str?.includes("o")) ui.click.ok();
              }
            });
            await pages[0].waitForTimeout(200);
          }
        }
        expect(target).toBeGreaterThan(0);
        await reconnect(target);
        await reconnect(target, { duplicate: true });
        // Deterministic combat fixture: remove optional skill prompts, then use a real card through the UI.
        const combat = await pages[0].evaluate(() => {
          const { game, _status } = __jgs;
          game.broadcastAll(function () {
            for (const p of game.players) p.clearSkills(true);
          });
          const attacker = _status.currentPhase,
            victim = attacker.next;
          const card = game.createCard("sha", "spade", 7);
          attacker.directgain([card]);
          return {
            attacker: attacker.playerid,
            victim: victim.playerid,
            hp: victim.hp,
            card: card.cardid,
          };
        });
        const attacker =
          pages[
            (
              await Promise.all(
                pages.map((p) => p.evaluate(() => __jgs.game.me.playerid)),
              )
            ).indexOf(combat.attacker)
          ];
        await attacker.waitForFunction(
          () =>
            __jgs._status.imchoosing &&
            __jgs._status.event.name === "chooseToUse",
        );
        await attacker.evaluate(({ card, victim }) => {
          const { game, ui, lib, _status } = __jgs;
          lib.config.auto_confirm = false;
          delete _status.event._cardChoice;
          delete _status.event._targetChoice;
          delete _status.event._skillChoice;
          game.check();
          const node = game.me.getCards("h").find((c) => c.cardid === card);
          _status.clicked = false;
          ui.click.card.call(node);
          _status.clicked = false;
          ui.click.target.call(lib.playerOL[victim]);
          if (ui.confirm?.str?.includes("o")) ui.click.ok();
          else
            throw Error(
              "Attack selection: " +
                JSON.stringify({
                  card: node?.className,
                  target: lib.playerOL[victim].className,
                  cards: ui.selected.cards.map((c) => c.name),
                  targets: ui.selected.targets.map((p) => p.playerid),
                  confirm: ui.confirm?.str,
                  skill: _status.event.skill,
                  event: _status.event.name,
                  type: _status.event.type,
                  auto: _status.auto,
                  me: game.me.playerid,
                }),
            );
        }, combat);
        for (let step = 0; step < 50; step++) {
          for (const p of pages)
            await p.evaluate((victim) => {
              const { _status, ui, game } = __jgs;
              if (
                _status.imchoosing &&
                (["chooseToRespond", "chooseBool"].includes(
                  _status.event.name,
                ) ||
                  (_status.event.name === "chooseToUse" &&
                    game.me.playerid === victim))
              )
                ui.click.cancel();
            }, combat.victim);
          if (
            await pages[0].evaluate(
              ({ victim, hp }) => __jgs.lib.playerOL[victim].hp === hp - 1,
              combat,
            )
          )
            break;
          await pages[0].waitForTimeout(100);
        }
        for (const p of pages)
          await p.waitForFunction(
            ({ victim, hp }) => __jgs.lib.playerOL[victim].hp === hp - 1,
            combat,
            { timeout: 10000 },
          );
        console.log(count, "card, response and damage synchronized");
        await pages[0].waitForTimeout(36000);
        expect(
          await pages[0].evaluate(
            () => Object.keys(__jgs.lib.node.torespondtimeout).length,
          ),
        ).toBe(0);
        for (const page of pages)
          expect(await page.evaluate(() => __jgs._status.auto)).toBe(false);
      }
      await pages[0].screenshot({
        path: testInfo.outputPath("desktop-game.png"),
      });
      if (count === 6)
        await pages[5].screenshot({
          path: testInfo.outputPath("mobile-landscape.png"),
        });
      // Death invokes the identity rule's win check; other sizes also test direct settlement serialization.
      if (count === 4)
        await pages[0].evaluate(() => {
          __jgs.game.zhu.die();
          __jgs.game.resume();
        });
      else await pages[0].evaluate(() => __jgs.game.over(true));
      for (const page of pages)
        await page.waitForFunction(() => __jgs._status.over);
      expect(errors).toEqual([]);
      await pages[0].request.post(origin + "/api/end");
      await expect(pages[1]).toHaveURL(origin + "/");
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await app.close();
    }
  });
