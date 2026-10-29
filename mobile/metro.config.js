const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
// The app has its own dependencies, rather than a package-manager workspace.
// Watch only the shared pure contracts/content, not the website's dependency tree.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../src/lib")];
module.exports = config;
