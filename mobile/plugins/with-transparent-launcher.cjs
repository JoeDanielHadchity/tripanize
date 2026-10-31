const fs = require("node:fs/promises");
const path = require("node:path");
const { withFinalizedMod } = require("expo/config-plugins");

const DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
const FILES = ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_monochrome"];

/** Android launcher icon as transparent PNGs (assets/android-icon), sized per
 * density from the brand mark. Expo's generated WebP icons are replaced, and the
 * adaptive icon uses a transparent background so no plate is drawn behind it.
 * The foreground keeps the mark inside Android's 66dp safe zone. */
module.exports = function withTransparentLauncher(config) {
  return withFinalizedMod(config, ["android", async config => {
    const res = path.join(config.modRequest.platformProjectRoot, "app/src/main/res");
    const source = path.join(config.modRequest.projectRoot, "assets/android-icon");
    for (const density of DENSITIES) {
      const dir = path.join(res, `mipmap-${density}`);
      await fs.mkdir(dir, { recursive: true });
      for (const name of FILES) {
        // Same resource name in two formats would fail the build.
        await fs.rm(path.join(dir, `${name}.webp`), { force: true });
        await fs.copyFile(path.join(source, `mipmap-${density}`, `${name}.png`), path.join(dir, `${name}.png`));
      }
    }
    await fs.rm(path.join(res, "drawable/tripanize_launcher_foreground.xml"), { force: true });
    await fs.mkdir(path.join(res, "mipmap-anydpi-v26"), { recursive: true });
    const icon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@android:color/transparent" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;
    for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) await fs.writeFile(path.join(res, "mipmap-anydpi-v26", name), icon);
    return config;
  }]);
};
