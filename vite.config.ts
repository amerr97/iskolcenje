import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // GitHub Pages detection
  const isGitHubPages = process.env.GITHUB_PAGES === 'true';

  // Android version read
  const gradlePath = path.resolve(__dirname, 'android/app/build.gradle');

  let androidVersionName = '1.0.0';

  try {
    const gradleContent = fs.readFileSync(gradlePath, 'utf-8');

    const match = gradleContent.match(/versionName\s+"([^"]+)"/);

    if (match?.[1]) {
      androidVersionName = match[1];
    }
  } catch {
    // fallback
  }

  return {
    // GitHub Pages -> /iskolcenje/
    // Android / Local -> ./
    base: isGitHubPages ? '/iskolcenje/' : './',

    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    plugins: [
      react(),
      tailwindcss(),
    ],

    define: {
      'import.meta.env.VITE_ANDROID_VERSION_NAME':
        JSON.stringify(androidVersionName),

      'process.env.API_KEY':
        JSON.stringify(env.GEMINI_API_KEY),

      'process.env.GEMINI_API_KEY':
        JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',

      // Mobile optimizations
      target: 'es2015',
      minify: 'terser',
      sourcemap: false,

      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
          },

          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
  };
});
