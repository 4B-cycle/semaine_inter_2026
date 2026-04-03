import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bastos.appVocal",
  appName: "Voicy",
  webDir: "out", // ✅ CORRIGÉ : Next.js exporte toujours dans "out"
  bundledWebRuntime: false,
  plugins: {
    CapacitorHttp: {
      enabled: true, // ✅ LA CLÉ DU RÉSEAU : Permet de contourner les blocages Android
    },
  },
  // ❌ ON A SUPPRIMÉ LE BLOC "server" POUR QUE L'APP SOIT 100% NATIVE
};

export default config;
