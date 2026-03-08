import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    define: {
      'import.meta.env.ANTHROPIC_API_KEY': JSON.stringify(process.env.ANTHROPIC_API_KEY ?? ''),
    },
  }),
});
