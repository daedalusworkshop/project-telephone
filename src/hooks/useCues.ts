import { useEffect, useState } from 'react';
import { audioService } from '../services/audio';

interface Cue { time: number; text: string; }

// Format: blank-line-separated blocks, each block is "M:SS\ntext"
export function parseCues(md: string): Cue[] {
  return md.trim().split(/\n\s*\n/).flatMap(block => {
    const lines = block.trim().split('\n');
    const match = lines[0].match(/^(\d+):(\d{2})$/);
    if (!match) return [];
    const time = parseInt(match[1]) * 60 + parseInt(match[2]);
    const text = lines.slice(1).join('\n').trim();
    return text ? [{ time, text }] : [];
  });
}

export function useCues(mdSrc: string | null): string {
  const [cues, setCues] = useState<Cue[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    setText('');
    if (!mdSrc) { setCues([]); return; }
    let cancelled = false;
    fetch(mdSrc)
      .then(r => r.text())
      .then(md => { if (!cancelled) setCues(parseCues(md)); })
      .catch(() => {});
    return () => { cancelled = true; setCues([]); };
  }, [mdSrc]);

  useEffect(() => {
    if (!cues.length) { setText(''); return; }
    const unsub = audioService.subscribeTime(t => {
      let active = '';
      for (const cue of cues) {
        if (cue.time <= t) active = cue.text;
        else break;
      }
      setText(active);
    });
    return unsub;
  }, [cues]);

  return text;
}
