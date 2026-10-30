const fs = require("node:fs/promises");
const path = require("node:path");
const { withFinalizedMod } = require("expo/config-plugins");

/** Keep the supplied PNG intact. Native insets fit its 176/192 artwork into
 * Android's 66dp safe zone: (108 - 22 - 22) * 176 / 192 is about 59dp. */
module.exports = function withTransparentLauncher(config) {
  return withFinalizedMod(config, ["android", async config => {
    const res = path.join(config.modRequest.platformProjectRoot, "app/src/main/res");
    await fs.mkdir(path.join(res, "drawable"), { recursive: true });
    await fs.mkdir(path.join(res, "mipmap-anydpi-v26"), { recursive: true });
    await fs.writeFile(path.join(res, "drawable/tripanize_launcher_foreground.xml"), `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android" android:inset="22dp" android:drawable="@mipmap/ic_launcher_foreground" />
`);
    const icon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@android:color/transparent" />
  <foreground android:drawable="@drawable/tripanize_launcher_foreground" />
</adaptive-icon>
`;
    for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
      await fs.writeFile(path.join(res, "mipmap-anydpi-v26", name), icon);
    }
    return config;
  }]);
};
