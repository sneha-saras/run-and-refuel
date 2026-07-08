import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server on :5173, proxy API + Strava callback to the Express server on :3000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/callback": "http://localhost:3000",
    },
  },
});
