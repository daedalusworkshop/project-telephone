import { useEffect, useState } from 'react';
import { parseCues } from './useCues';

export function useAudioCues(audio: HTMLAudioElement | null, mdSrc: string | null) {
  const [cues, setCues] = useState<{ time: number; text: string }[]>([]);
  const [text, setText] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setText('');
    if (!mdSrc) { setCues([]); return; }
    let cancelled = false;
    fetch(`${mdSrc}?v=${version}`)
      .then(r => r.text())
      .then(md => { if (!cancelled) setCues(parseCues(md)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mdSrc, version]);

  useEffect(() => {
    if (!audio || !cues.length) { setText(''); return; }
    const handler = () => {
      let active = '';
      for (const cue of cues) {
        if (cue.time <= audio.currentTime) active = cue.text;
        else break;
      }
      setText(active);
    };
    audio.addEventListener('timeupdate', handler);
    return () => audio.removeEventListener('timeupdate', handler);
  }, [audio, cues]);

  return { text, reload: () => setVersion(v => v + 1) };
}
