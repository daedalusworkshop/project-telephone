import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3001;
const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Recording-Time');
  next();
});
app.options('/api/recordings', (_, res) => res.sendStatus(204));

app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

app.post('/api/recordings', (req, res) => {
  const clientTime = req.headers['x-recording-time'];
  const timestamp = typeof clientTime === 'string' && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(clientTime)
    ? clientTime
    : new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `recording-${timestamp}.webm`;
  const filepath = path.join(RECORDINGS_DIR, filename);

  fs.writeFile(filepath, req.body, (err) => {
    if (err) {
      console.error('Failed to save recording:', err);
      res.status(500).json({ error: 'Failed to save' });
      return;
    }
    console.log(`Saved: ${filename}`);
    res.json({ filename });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Recordings saved to: ${RECORDINGS_DIR}`);
});
