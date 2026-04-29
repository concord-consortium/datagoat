import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(new Date().toISOString()),
  },
  // Cross-Origin-Opener-Policy: 'same-origin' (browser default in some
  // contexts) blocks Firebase signInWithPopup from completing the
  // window.close handshake with the OAuth popup. 'same-origin-allow-popups'
  // keeps the same-origin isolation for the main page while letting Firebase
  // talk to its own popup. Firebase Hosting gets the same header in
  // firebase.json.
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        svgProps: { "aria-hidden": "true" },
      },
      include: "**/*.svg?react",
    }),
    VitePWA({
      registerType: "autoUpdate",
      // We register manually in src/main.tsx so we can skip registration
      // on the /codap route (the CODAP plugin iframe is loaded by CODAP
      // itself; offline support inside the iframe has no value and a
      // registered SW would caching-conflict with the parent CODAP
      // origin's expectations).
      injectRegister: false,
      workbox: {
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
            },
          },
        ],
      },
      manifest: false,
    }),
  ],
});
