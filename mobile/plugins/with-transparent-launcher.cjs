const fs = require("node:fs/promises");
const path = require("node:path");
const { withFinalizedMod } = require("expo/config-plugins");

const DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

/** Android launcher icon as a plain transparent PNG (assets/android-icon).
 * Adaptive icons are removed on purpose: a transparent adaptive background is
 * drawn as black by many launchers, while a legacy PNG icon keeps its
 * transparency. Expo's generated WebP icons are replaced by the PNGs. */
module.exports = function withTransparentLauncher(config) {
  return withFinalizedMod(config, ["android", async config => {
    const res = path.join(config.modRequest.platformProjectRoot, "app/src/main/res");
    const source = path.join(config.modRequest.projectRoot, "assets/android-icon");
    for (const density of DENSITIES) {
      const dir = path.join(res, `mipmap-${density}`);
      await fs.mkdir(dir, { recursive: true });
      for (const name of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_monochrome", "ic_launcher_background"]) {
        await fs.rm(path.join(dir, `${name}.webp`), { force: true });
        await fs.rm(path.join(dir, `${name}.png`), { force: true });
      }
      for (const name of ["ic_launcher", "ic_launcher_round"]) await fs.copyFile(path.join(source, `mipmap-${density}`, `${name}.png`), path.join(dir, `${name}.png`));
    }
    // No adaptive icon definitions at any API level.
    for (const dir of await fs.readdir(res)) {
      if (!dir.startsWith("mipmap-anydpi")) continue;
      for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) await fs.rm(path.join(res, dir, name), { force: true });
    }
    await fs.rm(path.join(res, "drawable/tripanize_launcher_foreground.xml"), { force: true });
    return config;
  }]);
};
