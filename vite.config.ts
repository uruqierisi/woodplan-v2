import { defineConfig } from 'vitest/config';

// The preview/authoring page (issue #3) is served from src/preview:
// `npm run preview` passes the root on the CLI so vitest keeps using the
// project root for test discovery.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
