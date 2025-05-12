import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        sourcemap: false,
        assetsInlineLimit: 0,
        lib: {
            entry: './src/index.ts',
            name: 'mdeditor',
            formats: ['umd'],
            fileName: (format) => `mdeditor.${format}.js`
        },
        rollupOptions: {
            output: {
                manualChunks: undefined, // 禁用手动分块
                inlineDynamicImports: true,
            }
        }
    }
});