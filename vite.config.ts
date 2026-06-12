import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The main app (Browse page, issue #5) is served from the repo root via
// `npm run dev`. The preview/authoring page (issue #3) is served from
// src/preview: `npm run preview` passes the root on the CLI so vitest keeps
// using the project root for test discovery.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
