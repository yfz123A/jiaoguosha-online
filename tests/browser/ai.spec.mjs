import { test, expect } from "@playwright/test";
import { createApp } from "../../server/index.mjs";

// Drive only the human choices; AI seats are always left to the real engine.
async function humanStep(page) {
  return page.evaluate(() => {
    const { game, ui, _status, get } = __jgs;
    if (!_status.imchoosing || _status.over) return;
    const event = _status.event;
    if (event.player !== game.me) return;
    if (event.name === "chooseButton") {
      const buttons =
        ui.dialog?.buttons?.filter((b) => b.classList.contains("selectable")) ||
        [];
      const button =
        buttons.find((b) =>
          ["zhangfei", "huaxiong", "zhaoyun", "guanyu"].includes(b.link),
        ) || buttons[0];
      if (button) {
        _status.clicked = false;
        ui.click.button.call(button);
      }
      if (ui.confirm?.str?.includes("o")) ui.click.ok();
    } else if (["chooseToUse", "chooseToRespond"].includes(event.name))
      ui.click.cancel();
    else if (ui.confirm?.str?.includes("c")) ui.click.cancel();
    else if (event.name === "chooseToDiscard" || event.name === "chooseCard") {
      const n = get.select(event.selectCard)[0];
      for (const c of game.me
        .getCards("he")
        .filter((c) => c.classList.contains("selectable"))
        .slice(0, n)) {
        _status.clicked = false;
        ui.click.card.call(c);
      }
      if (ui.confirm?.str?.includes("o")) ui.click.ok();
    } else if (event.name === "chooseBool") ui.click.cancel();
    else if (event.name === "chooseControl") {
      const control = [...ui.control.children].find(
        (c) => c !== ui.confirm,
      )?.firstChild;
      if (control) ui.click.control.call(control);
    }
  });
}

for (const [count, humans] of [
  [4, 1],
  [6, 1],
  [5, 2],
])
  test(`${count}人桌：${humans}真人与人机补位`, async ({
    browser,
  }, testInfo) => {
    const app = await createApp({ adminToken: "ai-test" }),
      origin = `http://127.0.0.1:${app.port}`;
    const contexts = [],
      pages = [],
      errors = [];
    try {
      for (let i = 0; i < humans; i++) {
        const context = await browser.newContext({
          viewport: { width: 1360, height: 900 },
        });
        contexts.push(context);
        const page = await context.newPage();
        pages.push(page);
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => {
          if (
            m.type() === "error" &&
            !m.text().includes("Failed to load resource")
          )
            errors.push(m.text().slice(0, 500));
        });
        page.on("dialog", async (d) => {
          errors.push(d.message().slice(0, 500));
          await d.accept();
        });
        await page.goto(origin + (i === 0 ? "/#host=ai-test" : "/"));
        if (i === 0) {
          await page.selectOption("#character-pack", "standard");
          await page.selectOption("#players", String(count));
          if (humans === 1) {
            await page.click("#quick-test");
          } else {
            await page.fill("#nickname", "房主");
            await page.fill("#password", "ai-test-pass");
            await page.selectOption("#fill-ai", "true");
            await page.click("#submit");
          }
        } else {
          await page.fill("#nickname", "真人朋友");
          await page.fill("#password", "ai-test-pass");
          await page.click("#submit");
        }
        await page.waitForFunction(
          (n) => window.__jgs?.game.connectPlayers?.length === n,
          count,
        );
      }
      await pages[0].waitForFunction(
        (n) =>
          __jgs.game.connectPlayers.filter(
            (p) => p.nickname && (p.playerid === "1" || p.ws?.inited),
          ).length === n,
        humans,
      );
      await pages[0].evaluate(() => __jgs.ui.connectStartButton.click());
      for (let step = 0; step < 400; step++) {
        for (const page of pages) await humanStep(page);
        const ready = await pages[0].evaluate(
          () =>
            __jgs.game.players.length > 0 &&
            __jgs.game.players.every((p) => p.name && p.phaseNumber >= 1),
        );
        if (ready) break;
        if (errors.length) throw Error(errors.join("\n"));
        await pages[0].waitForTimeout(100);
      }
      const state = await pages[0].evaluate(() => ({
        players: __jgs.game.players.concat(__jgs.game.dead).map((p) => ({
          id: p.playerid,
          name: p.name,
          nickname: p.nickname,
          bot: p !== __jgs.game.me && !p.ws,
          phases: p.phaseNumber,
        })),
        auto: __jgs._status.auto,
        offline: __jgs.offline.size,
        event: __jgs._status.event.name,
        choosing: __jgs._status.imchoosing,
        controls: __jgs.ui.control.innerText,
      }));
      console.log("AI state", JSON.stringify(state));
      await pages[0].screenshot({ path: testInfo.outputPath("ai-table.png") });
      expect(state.players).toHaveLength(count);
      expect(state.players.filter((p) => p.bot)).toHaveLength(count - humans);
      expect(state.players.every((p) => p.name && p.phases >= 1)).toBeTruthy();
      expect(state.auto).toBe(false);
      expect(state.offline).toBe(0);
      expect(
        state.players
          .filter((p) => p.bot)
          .every((p) => p.nickname.startsWith("人机·")),
      ).toBeTruthy();
      if (humans === 2) {
        const guestId = await pages[1].evaluate(() => __jgs.game.me.playerid);
        const context = contexts[1];
        await pages[1].close();
        await pages[0].waitForFunction(() => __jgs.offline.size === 1);
        const after = await pages[0].evaluate(() => ({
          phase: __jgs.game.phaseNumber,
          bots: __jgs.game.players.filter((p) => p !== __jgs.game.me && !p.ws)
            .length,
        }));
        await pages[0].waitForTimeout(1000);
        expect(await pages[0].evaluate(() => __jgs.game.phaseNumber)).toBe(
          after.phase,
        );
        expect(after.bots).toBe(count - humans);
        const restored = await context.newPage();
        pages[1] = restored;
        await restored.goto(origin + "/play");
        await restored.waitForFunction(
          (id) => window.__jgs?.game.me?.playerid === id,
          guestId,
        );
        await pages[0].waitForFunction(() => __jgs.offline.size === 0);
      }
      await pages[0].screenshot({ path: testInfo.outputPath("ai-table.png") });
      expect(errors).toEqual([]);
      await pages[0].request.post(origin + "/api/end");
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await app.close();
    }
  });
