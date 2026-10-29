import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Tripanize",
  slug: "tripanize-mobile",
  owner: "tripanizeapp",
  extra: { eas: { projectId: "dac6638c-94ea-4d44-9edb-3bebf71da3df" } },
  version: "0.2.0",
  scheme: "tripanize",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: { supportsTablet: true, bundleIdentifier: "app.tripanize.mobile", infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: { package: "app.tripanize.mobile", adaptiveIcon: { foregroundImage: "./assets/mark.png", backgroundColor: "#f6f2e9" } },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon-transparent.png" },
  plugins: ["expo-router", "expo-secure-store", "expo-font", "expo-web-browser", "expo-sharing", "expo-document-picker", ["expo-image-picker", { photosPermission: "Choose images to attach to your Tripanize bookings and payments.", cameraPermission: "Take receipt photos for your Tripanize payments.", microphonePermission: false }], ["expo-location", { locationWhenInUsePermission: "Share your location with your trip members only when you turn sharing on.", isIosBackgroundLocationEnabled: false, isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }], ["expo-splash-screen", { image: "./assets/mark.png", imageWidth: 110, backgroundColor: "#f6f2e9" }]],
  experiments: { typedRoutes: true, ...(process.env.EXPO_PUBLIC_MOBILE_PREVIEW === "1" ? { baseUrl: "/mobile-preview" } : {}) },
});
