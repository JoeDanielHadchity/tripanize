// Google Play hides an app from devices that lack a "required" hardware feature. Tripanize works without
// Wi-Fi (mobile data) and on screens that rotate, so these are declared as optional.
const { withAndroidManifest } = require("expo/config-plugins");

const OPTIONAL = ["android.hardware.screen.portrait", "android.hardware.wifi"];

module.exports = function withOptionalFeatures(config) {
  return withAndroidManifest(config, cfg => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = { ...manifest.$, "xmlns:tools": manifest.$?.["xmlns:tools"] ?? "http://schemas.android.com/tools" };
    const features = (manifest["uses-feature"] ??= []);
    for (const name of OPTIONAL) {
      const existing = features.find(f => f.$?.["android:name"] === name);
      if (existing) { existing.$["android:required"] = "false"; existing.$["tools:replace"] = "android:required"; }
      else features.push({ $: { "android:name": name, "android:required": "false", "tools:replace": "android:required" } });
    }
    return cfg;
  });
};
