import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bastos.appVocal",
  appName: "app-vocal",
  webDir: "public",
  server: {
    url: "https://semaine-inter-2026.vercel.app",
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
