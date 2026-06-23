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
        // Force each entry into its own single chunk — no shared chunks
        manualChunks: (id) => {
          if (id.includes('admin')) return 'admin'
          return 'main'
        },
      },
    },
  },
});
