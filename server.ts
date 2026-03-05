import express from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

const app = express();
const PORT = 3001;

app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Recording-Time, X-Recording-Folder');
  next();
});
app.options('/api/recordings', (_, res) => res.sendStatus(204));

app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

app.post('/api/recordings', (req, res) => {
  const clientTime = req.headers['x-recording-time'];
  const timestamp = typeof clientTime === 'string' && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(clientTime)
    ? clientTime
    : new Date().toISOString().replace(/[:.]/g, '-');

  const rawFolder = req.headers['x-recording-folder'];
  const folder = typeof rawFolder === 'string' && /^[\w-]+$/.test(rawFolder) ? rawFolder : 'operator';
  const recordingsDir = path.join(process.cwd(), folder);
  if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

  const filename = `recording-${timestamp}.webm`;
  const filepath = path.join(recordingsDir, filename);

  fs.writeFile(filepath, req.body, (err) => {
    if (err) {
      console.error('Failed to save recording:', err);
      res.status(500).json({ error: 'Failed to save' });
      return;
    }
    const wavFilepath = filepath.replace(/\.webm$/, '.wav');
    execFile('/opt/homebrew/bin/ffmpeg', ['-i', filepath, wavFilepath], (ffErr) => {
      if (ffErr) {
        console.error('Failed to convert to WAV:', ffErr.message);
      } else {
        console.log(`Saved: ${folder}/${path.basename(wavFilepath)}`);
        fs.unlink(filepath, (unlinkErr) => {
          if (unlinkErr) console.error('Failed to delete .webm:', unlinkErr.message);
        });
      }
    });
    res.json({ filename });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
