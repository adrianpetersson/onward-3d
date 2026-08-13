import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset URLs, so the same bundle serves from a domain root or a sub-path.
  base: './',

  // `@/*` comes straight from tsconfig — Vite 8 resolves it natively, no plugin needed.
  resolve: { tsconfigPaths: true },

  plugins: [tailwindcss(), viteReact()],

  server: { port: 3000 },

  test: {
    // Everything under test is pure — matrices, and the provider config that feeds them. Nothing
    // here needs a DOM, and a WebGL canvas is not something a unit test can honestly assert on.
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      // The one exception: the model pipeline's own test reads the shipped GLBs off disk to prove
      // their texture atlases are embedded, which is a silent failure in the browser otherwise. It
      // sits outside `src` so that node types stay out of this browser-only app's tsconfig.
      'scripts/**/*.test.mjs',
    ],
  },
})
