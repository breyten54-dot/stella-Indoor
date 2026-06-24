import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // silences the 500KB warning — admin app is intentionally ~170KB, client app ~860KB
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
      output: {
        // Keep vendor code in a shared chunk; let Rollup place app-specific
        // modules in their respective entry chunks so the admin app never
        // executes the client entry point (src/main.tsx) just because it
        // shares utility modules with it.
        manualChunks: (id) => {
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
});
