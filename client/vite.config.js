import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ command }) => ({
  // En dev : proxy /api vers le serveur Express local
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  // En prod : build vers le dossier public/ à la racine du projet
  // Express servira ces fichiers statiques
  build: {
    outDir: resolve(__dirname, "../public"),
    emptyOutDir: true,
  },
  // Expose les variables VITE_ au frontend
  define: command === "build" ? {} : undefined,
}));
