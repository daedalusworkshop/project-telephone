import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3001;
const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

app.post('/api/recordings', (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
