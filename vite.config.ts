import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// A API libera CORS apenas para origens configuradas em Cors:AllowedOrigins.
// Em desenvolvimento o proxy abaixo torna as chamadas same-origin: o front
// chama /api/* e o Vite repassa para a API de producao sem o prefixo.
// (IP direto da VM: http://45.56.77.43:9090 — trocar o target abaixo se precisar.)
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // O manifest ja existe em public/manifest.webmanifest (com os icones
      // any + maskable); o plugin cuida so do service worker.
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,webmanifest}", "icon-*.png", "apple-touch-icon.png"],
        globIgnores: ["sparkcore.png"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    host: true,
    port: 5000,
    proxy: {
      "/api": {
        target: "https://api.clinicaideia.com.br",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
