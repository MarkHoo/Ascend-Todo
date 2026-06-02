// Play reminder and pomodoro sounds using real audio files.

const soundFiles: Record<string, string> = {
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

export function playReminderSound(kind: 'bell' | 'chime' | 'digital' | 'none' = 'bell') {
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

export function playPomodoroEnd() {
  const file = soundFiles['bell'];
  if (!file) return;
  try {
    const audio = getAudio(file);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
