export default async function preload({ lib, game }) {
  // A browser-only adapter: the game never needs access to the host computer's filesystem.
  lib.path = (
    await import(
      "/node_modules/.pnpm/path-browserify-esm@1.0.6/node_modules/path-browserify-esm/index.esm.js"
    )
  ).default;
  game.checkFile = (path, success) => success(-1);
  game.checkDir = (path, success) => success(-1);
  game.getFileList = (path, success) => success([], []);
  game.readFile = (path, success, error) =>
    fetch("/" + path)
      .then((r) => {
        if (!r.ok) throw Error("File not found");
        return r.arrayBuffer();
      })
      .then(success, error);
  game.readFileAsText = (path, success, error) =>
    fetch("/" + path)
      .then((r) => {
        if (!r.ok) throw Error("File not found");
        return r.text();
      })
      .then(success, error);
  game.export = (data, name = "胶国杀记录.txt") => {
    const url = URL.createObjectURL(new Blob([data], { type: "text/plain" }));
    const a = document.createElement("a");
    a.download = name;
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  game.exit = () => location.assign("/");
  game.open = (url) => window.open(url, "_blank", "noopener");
}
