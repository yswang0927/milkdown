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
    },
    define: {
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
        // 添加这一行，替换 process.env.NODE_ENV
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    }
});