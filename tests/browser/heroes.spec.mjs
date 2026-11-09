import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createApp } from "../../server/index.mjs";
const roster = JSON.parse(
  readFileSync(
    new URL("../../game/jiaoguosha/roster.json", import.meta.url),
    "utf8",
  ),
);
test.describe.configure({ mode: "parallel" });

for (const hero of roster)
  test(`胶国杀武将可选并运转：${hero.name}·${hero.title}`, async ({
    browser,
  }, info) => {
    const app = await createApp({ adminToken: "heroes-test" }),
      origin = `http://127.0.0.1:${app.port}`;
    const context = await browser.newContext({
        viewport: { width: 1360, height: 900 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource"))
        errors.push(m.text().slice(0, 1000));
    });
    page.on("dialog", async (d) => {
      errors.push(d.message());
      await d.accept();
    });
    try {
      await page.goto(origin + "/#host=heroes-test");
      await page.selectOption("#character-pack", "mixed");
      await page.selectOption("#test-hero", hero.id);
      await page.click("#quick-test");
      await page.waitForFunction(
        () => window.__jgs?.ui.connectStartButton,
        null,
        { timeout: 45000 },
      );
      expect(errors).toEqual([]);
      await page.evaluate(() => {
        const { lib, game, ui } = __jgs;
        lib.config.game_speed = "vvfast";
        lib.config.duration = 50;
        // Isolate the hero under test against the same simple standard opponents.
        lib.configOL.banned.push(
          ...Object.keys(lib.characterPack.jiaoguosha).filter(
            (n) => n !== __jgs.session.testHero,
          ),
        );
        ui.connectStartButton.click();
      });
      for (let i = 0; i < 180; i++) {
        if (errors.length) break;
        const ready = await page.evaluate(() => {
          const { game, lib, ui, _status } = __jgs;
          if (
            !_status.auto &&
            _status.imchoosing &&
            _status.event.player === game.me &&
            _status.event.name === "chooseButton"
          ) {
            const buttons =
              ui.dialog?.buttons?.filter((b) =>
                b.classList.contains("selectable"),
              ) || [];
            const b =
              buttons.find((b) => b.link === __jgs.session.testHero) ||
              buttons[0];
            if (b) {
              _status.clicked = false;
              ui.click.button.call(b);
              if (ui.confirm?.str?.includes("o")) ui.click.ok();
            }
          }
          if (
            game.me?.name === __jgs.session.testHero &&
            game.players.every((p) => p.name)
          ) {
            // The harness explicitly enables auto only for this smoke test.
            if (!_status.auto) ui.click.auto("forced");
            return game.me.phaseNumber >= 2 || game.me.isDead() || _status.over;
          }
          return false;
        });
        if (ready) break;
        await page.waitForTimeout(250);
      }
      const state = await page.evaluate(() => ({
        name: __jgs.game.me.name,
        phase: __jgs.game.me.phaseNumber,
        dead: __jgs.game.me.isDead(),
        over: __jgs._status.over,
        event: __jgs._status.event.name,
        skill: __jgs._status.event.skill,
        players: __jgs.game.players.map((p) => [p.name, p.hp, p.phaseNumber]),
      }));
      console.log(hero.id, JSON.stringify(state));
      if (errors.length) console.log("ERROR", hero.id, errors[0]);
      await page.screenshot({ path: info.outputPath("hero.png") });
      expect(errors).toEqual([]);
      expect(state.name).toBe(hero.id);
      expect(state.phase >= 2 || state.dead || state.over).toBeTruthy();
    } finally {
      await context.close();
      await app.close();
    }
  });
