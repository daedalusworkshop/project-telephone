export interface PromptConfig {
  id: string;
  label: string;
  recordingsFolder: string; // top-level project folder for saved recordings
  welcome:  { mp3: string; tts: string; content: string; };
  prompt:   { mp3: string; tts: string; content: string; question: string; };
  thankYou: { mp3: string; tts: string; content: string; };
  farewell: { mp3: string; tts: string; content: string; };
}

export const PROMPTS: PromptConfig[] = [
  {
    id: 'operator',
    label: 'Operator',
    recordingsFolder: 'operator',
    welcome: {
      mp3: '/operator/audio/welcome.mp3',
      tts: "Hello, welcome. Please wait while I connect you with your operator. She can direct your call to anyone in the world.",
      content: '/operator/timestamps/welcome.md',
    },
    prompt: {
      mp3: '/operator/audio/prompt.mp3',
      tts: "The operator isn't available right now. She is asking: who do you wish to call? What do you need the most right now? Please leave your message after the tone. She'll find a way to reach you.",
      content: '/operator/timestamps/prompt.md',
      question: 'What do you need the most right now?',
    },
    thankYou: {
      mp3: '/operator/audio/thank-you.mp3',
      tts: "Thank you. The operator will find a way to reach you.",
      content: '/operator/timestamps/thank-you.md',
    },
    farewell: {
      mp3: '',
      tts: "May you be well. I'll be here if you need me.",
      content: '/operator/timestamps/farewell.md',
    },
  },
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    recordingsFolder: 'tomorrow',
    welcome: {
      mp3: '/tomorrow/audio/welcome.wav',
      tts: "Please wait while I connect you with Tomorrow.",
      content: '/tomorrow/timestamps/welcome.md',
    },
    prompt: {
      mp3: '/tomorrow/audio/prompt.wav',
      tts: "Tomorrow can connect you with anyone. Who do you wish to call? What do you need the most right now? Please leave your message after the beep.",
      content: '/tomorrow/timestamps/prompt.md',
      question: 'What do you need the most right now?',
    },
    thankYou: {
      mp3: '/tomorrow/audio/thank-you.wav',
      tts: "Thank you. Tomorrow will find a way to reach you. It always does.",
      content: '/tomorrow/timestamps/thank-you.md',
    },
    farewell: {
      mp3: '',
      tts: "May you be well. I'll be here if you need me.",
      content: '/tomorrow/timestamps/farewell.md',
    },
  },
  // ── Template — copy this block to add a new prompt ──────────────────────
  // {
  //   id: 'prompt-id',           // unique, used for folder name + localStorage
  //   label: 'Display Name',     // shown in the ` panel
  //   recordingsFolder: 'prompt-id', // top-level folder where recordings save
  //   welcome: {
  //     mp3: '/prompt-id/audio/welcome.mp3',
  //     tts: 'Fallback text if the MP3 fails to load.',
  //     content: '/prompt-id/timestamps/welcome.md',
  //   },
  //   prompt: {
  //     mp3: '/prompt-id/audio/prompt.mp3',
  //     tts: 'Fallback text if the MP3 fails to load.',
  //     content: '/prompt-id/timestamps/prompt.md',
  //     question: 'The question shown on screen during recording.',
  //   },
  //   thankYou: {
  //     mp3: '/prompt-id/audio/thank-you.mp3',
  //     tts: 'Fallback text if the MP3 fails to load.',
  //     content: '/prompt-id/timestamps/thank-you.md',
  //   },
  //   farewell: {
  //     mp3: '/prompt-id/audio/farewell.mp3',
  //     tts: 'Fallback text if the MP3 fails to load.',
  //     content: '/prompt-id/timestamps/farewell.md',
  //   },
  // },
];

const PROMPT_KEY = 'telephone-prompt';

export function loadPromptId(): string {
  const stored = localStorage.getItem(PROMPT_KEY);
  return PROMPTS.find(p => p.id === stored) ? stored! : PROMPTS[0].id;
}

export function savePromptId(id: string) {
  localStorage.setItem(PROMPT_KEY, id);
}

export function getPrompt(id: string): PromptConfig {
  return PROMPTS.find(p => p.id === id) ?? PROMPTS[0];
}
