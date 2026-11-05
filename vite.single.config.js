import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 离线单文件构建：所有 JS（含 three.js）内联进一个 HTML，双击即可打开
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000,
    modulePreload: false,
  },
  plugins: [viteSingleFile()],
});
