import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const gradlePath = path.resolve(__dirname, 'android/app/build.gradle');
    let androidVersionName = '1.0.0';
    try {
      const gradleContent = fs.readFileSync(gradlePath, 'utf-8');
      const match = gradleContent.match(/versionName\s+"([^"]+)"/);
      if (match?.[1]) {
        androidVersionName = match[1];
      }
    } catch {
      // Fallback ostaje 1.0.0 ako čitanje ne uspije.
    }

    return {
      // OBAVEZNO za mobilne aplikacije
      base: './',
      
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      
      plugins: [react(), tailwindcss()],
      
      define: {
        'import.meta.env.VITE_ANDROID_VERSION_NAME': JSON.stringify(androidVersionName),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        // Optimizacije za mobile
        target: 'es2015',
        minify: 'terser',
        sourcemap: false,
        
        // Povećajte chunk size za mobile performanse
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
            },
            entryFileNames: 'assets/[name]-[hash].js',
            chunkFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash].[ext]'
          }
        }
      }
    };
});