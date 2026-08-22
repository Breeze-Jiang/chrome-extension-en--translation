import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: '英文网页翻译助手',
  description: '提取并翻译当前英文网页的主要文章内容。',
  version: '0.1.0',
  permissions: ['activeTab', 'sidePanel', 'storage'],
  host_permissions: ['https://dashscope.aliyuncs.com/*'],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
  action: {
    default_title: '打开翻译侧边栏',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
    },
  ],
  side_panel: {
    default_path: 'sidepanel.html',
  },
  options_page: 'options.html',
})
