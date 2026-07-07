// Play reminder and pomodoro sounds using real audio files.

export const soundFiles: Record<string, string> = {
  bell: '/sounds/bell.mp3',
  chime: '/sounds/marimba-ringtone.wav',
  digital: '/sounds/on-hold-ringtone.wav',
  waiting: '/sounds/waiting-ringtone.wav',
  'marimba-waiting': '/sounds/marimba-waiting-ringtone.wav',
};

const audioPool = new Map<string, HTMLAudioElement>();

function getAudio(src: string): HTMLAudioElement {
  if (audioPool.has(src)) {
    const a = audioPool.get(src)!;
    a.currentTime = 0;
    return a;
  }
  const a = new Audio(src);
  a.preload = 'auto';
  audioPool.set(src, a);
  return a;
}

export function playReminderSound(kind: 'bell' | 'chime' | 'digital' | 'waiting' | 'marimba-waiting' | 'none' = 'bell') {
  if (kind === 'none') return;
  const file = soundFiles[kind];
  if (!file) return;
  try {
    const audio = getAudio(file);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Play a sound by id and return the Audio element (caller must stop it). */
export function playSoundPreview(soundId: string, volume = 0.5): HTMLAudioElement | null {
  if (soundId === 'none') return null;
  const file = soundFiles[soundId];
  if (!file) return null;
  try {
    stopAllSounds();
    const audio = new Audio(file);
    audio.volume = volume;
    audio.play().catch(() => {});
    return audio;
  } catch {
    return null;
  }
}

/** Stop a specific audio element. */
export function stopSound(audio: HTMLAudioElement | null) {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

/** Stop all pooled sounds (for emergency cleanup). */
export function stopAllSounds() {
  audioPool.forEach((a) => {
    a.pause();
    a.currentTime = 0;
  });
}
