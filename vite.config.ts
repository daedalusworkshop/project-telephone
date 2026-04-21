import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'child_process';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

function audioNormalizerPlugin(): Plugin {
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const runNormalize = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log('\n[audio] New file detected — normalizing...');
      const proc = spawn('bash', ['scripts/normalize-audio.sh'], { stdio: 'inherit' });
      proc.on('close', code => {
        if (code !== 0) console.error(`[audio] normalize-audio.sh failed (exit ${code})`);
      });
    }, 500);
  };

  return {
    name: 'audio-normalizer',
    configureServer(server) {
      const audioDir = path.resolve(__dirname, 'public');
      server.watcher.add(audioDir);
      server.watcher.on('add',    f => { if (f.startsWith(audioDir) && /\.(mp3|wav|webm)$/.test(f)) runNormalize(); });
      server.watcher.on('change', f => { if (f.startsWith(audioDir) && /\.(mp3|wav|webm)$/.test(f)) runNormalize(); });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), audioNormalizerPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    build: {
      rollupOptions: {
        input: {
          main:      path.resolve(__dirname, 'index.html'),
          portfolio: path.resolve(__dirname, 'portfolio.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  };
});
