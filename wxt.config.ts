import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['scripting', 'tabs', 'storage'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.ANTHROPIC_API_KEY': JSON.stringify(process.env.ANTHROPIC_API_KEY ?? ''),
    },
  }),
});
