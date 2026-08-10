import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: {
      // The reminder popup is its own window, so it gets its own entry rather
      // than booting the whole workspace behind a notification.
      input: {
        main: "index.html",
        reminder: "reminder.html",
      },
      output: {
        manualChunks(id) {
          if (id.includes("toefl-data.json")) return "speaking-content";
          if (id.includes("academic-discussions.json")) return "writing-content";
          if (id.includes("wordlist.json")) return "vocabulary-content";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  plugins: [react()],
});
