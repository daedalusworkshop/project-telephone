# Project Telephone

An interactive art installation — visitors pick up a telephone, speak to an unseen operator, and leave a recorded message.

## Dev commands

```
npm run dev       # Vite frontend (port 3000)
npm run server    # Express recording server (port 3001)
```

## Audio

Voice prompts live in `public/audio/` (MP3s: `welcome`, `prompt`, `thank-you`, `farewell`).

**After adding or replacing any audio file in `public/audio/`, run:**
```
npm run normalize-audio
```
This normalizes everything to −16 LUFS so all prompts play at a consistent volume. The app also applies runtime normalization at playback, but pre-normalizing the files on disk is more accurate.
