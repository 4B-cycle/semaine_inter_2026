import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bastos.appVocal",
  appName: "app-vocal",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
