// Generate simple reminder sounds using Web Audio API.
// Different sound types (bell/chime/digital) use different oscillator setups.

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      (window as any).AudioContext ||
      (window as any).webkitAudioContext ||
      null;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(freq: number, dur: number, delay: number, gain = 0.2, type: OscillatorType = 'sine') {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = 0;
  osc.connect(g);
  g.connect(c.destination);
  const t0 = c.currentTime + delay;
  const t1 = t0 + dur;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

export function playReminderSound(kind: 'bell' | 'chime' | 'digital' | 'none' = 'bell') {
  if (kind === 'none') return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  switch (kind) {
    case 'bell':
      tone(880, 0.6, 0, 0.25, 'sine');
      tone(1320, 0.4, 0.1, 0.2, 'sine');
      break;
    case 'chime':
      tone(660, 0.3, 0, 0.2, 'triangle');
      tone(880, 0.3, 0.25, 0.2, 'triangle');
      tone(990, 0.4, 0.5, 0.2, 'triangle');
      break;
    case 'digital':
      tone(1200, 0.12, 0, 0.18, 'square');
      tone(800, 0.12, 0.15, 0.18, 'square');
      tone(1200, 0.12, 0.3, 0.18, 'square');
      break;
  }
}

export function playPomodoroEnd() {
  // 3 bell rings
  tone(880, 0.5, 0, 0.25, 'sine');
  tone(880, 0.5, 0.6, 0.25, 'sine');
  tone(880, 0.5, 1.2, 0.25, 'sine');
}
