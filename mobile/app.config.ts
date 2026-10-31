import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Tripanize",
  slug: "tripanize-mobile",
  owner: "tripanizeapp",
  extra: { eas: { projectId: "dac6638c-94ea-4d44-9edb-3bebf71da3df" } },
  version: "0.3.0",
  scheme: "tripanize",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: { supportsTablet: true, bundleIdentifier: "app.tripanize.mobile", infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  // Android: transparent PNG launcher icons from assets/android-icon (see plugins/with-transparent-launcher.cjs).
  // iOS keeps the cream icon.png: Apple does not allow transparent app icons.
  // FCM credentials for Android push. EAS provides the file as a secret file variable.
  android: { package: "app.tripanize.mobile", ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}), icon: "./assets/app-icon-transparent.png", adaptiveIcon: { foregroundImage: "./assets/app-icon-transparent.png", backgroundColor: "#00000000" } },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon-transparent.png" },
  plugins: ["./plugins/with-transparent-launcher.cjs", "expo-router", "expo-secure-store", "expo-font", "expo-web-browser", "expo-sharing", "expo-document-picker", ["expo-image-picker", { photosPermission: "Choose images to attach to your Tripanize bookings and payments.", cameraPermission: "Take receipt photos for your Tripanize payments.", microphonePermission: false }], ["expo-location", { locationWhenInUsePermission: "Share your location with your trip members only when you turn sharing on.", isIosBackgroundLocationEnabled: false, isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }], ["expo-splash-screen", { image: "./assets/mark.png", imageWidth: 110, backgroundColor: "#f6f2e9" }], ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#3f6d83", defaultChannel: "chat" }], "expo-iap"],
  experiments: { typedRoutes: true, ...(process.env.EXPO_PUBLIC_MOBILE_PREVIEW === "1" ? { baseUrl: "/mobile-preview" } : {}) },
});
