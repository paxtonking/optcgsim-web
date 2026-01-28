import { useCallback, useEffect, useRef, useState } from 'react';

type SoundType =
  | 'draw'
  | 'play'
  | 'attack'
  | 'block'
  | 'counter'
  | 'don'
  | 'damage'
  | 'rest'
  | 'turnStart'
  | 'victory'
  | 'defeat';

interface UseSoundEffectsReturn {
  playSound: (type: SoundType) => void;
  isMuted: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
}

const STORAGE_KEY = 'optcgsim-sound-muted';

export const useSoundEffects = (): UseSoundEffectsReturn => {
  const [isMuted, setIsMuted] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  });

  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context on first user interaction
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Save mute preference
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isMuted));
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted);
  }, []);

  const playSound = useCallback((type: SoundType) => {
    if (isMuted) return;

    try {
      const ctx = getAudioContext();
      const currentTime = ctx.currentTime;

      switch (type) {
        case 'draw': {
          // Quick whoosh - high to low frequency sweep
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1200, currentTime);
          osc.frequency.exponentialRampToValueAtTime(200, currentTime + 0.15);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(2000, currentTime);
          filter.frequency.exponentialRampToValueAtTime(500, currentTime + 0.15);

          gain.gain.setValueAtTime(0.08, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.15);
          break;
        }

        case 'play': {
          // Punchy card slap
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          const gain2 = ctx.createGain();

          // Low thump
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, currentTime);
          osc.frequency.exponentialRampToValueAtTime(50, currentTime + 0.1);
          gain.gain.setValueAtTime(0.3, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.1);

          // High click
          osc2.type = 'square';
          osc2.frequency.setValueAtTime(800, currentTime);
          gain2.gain.setValueAtTime(0.1, currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.05);

          osc.connect(gain);
          osc2.connect(gain2);
          gain.connect(ctx.destination);
          gain2.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.1);
          osc2.start(currentTime);
          osc2.stop(currentTime + 0.05);
          break;
        }

        case 'attack': {
          // Sharp anime swoosh
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(400, currentTime);
          osc.frequency.exponentialRampToValueAtTime(1500, currentTime + 0.08);
          osc.frequency.exponentialRampToValueAtTime(200, currentTime + 0.2);

          osc2.type = 'square';
          osc2.frequency.setValueAtTime(200, currentTime + 0.05);
          osc2.frequency.exponentialRampToValueAtTime(100, currentTime + 0.15);

          filter.type = 'highpass';
          filter.frequency.value = 200;

          gain.gain.setValueAtTime(0.12, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.25);

          osc.connect(filter);
          osc2.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.25);
          osc2.start(currentTime + 0.05);
          osc2.stop(currentTime + 0.2);
          break;
        }

        case 'block': {
          // Metallic clash/shield
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(800, currentTime);
          osc.frequency.exponentialRampToValueAtTime(400, currentTime + 0.15);

          osc2.type = 'square';
          osc2.frequency.setValueAtTime(1200, currentTime);
          osc2.frequency.exponentialRampToValueAtTime(600, currentTime + 0.1);

          gain.gain.setValueAtTime(0.15, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.2);

          osc.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.2);
          osc2.start(currentTime);
          osc2.stop(currentTime + 0.15);
          break;
        }

        case 'counter': {
          // Quick deflect ping
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(1000, currentTime);
          osc.frequency.exponentialRampToValueAtTime(2000, currentTime + 0.05);
          osc.frequency.exponentialRampToValueAtTime(800, currentTime + 0.12);

          gain.gain.setValueAtTime(0.12, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.15);
          break;
        }

        case 'don': {
          // Power-up ascending chime
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, currentTime); // C5
          osc.frequency.setValueAtTime(659, currentTime + 0.08); // E5
          osc.frequency.setValueAtTime(784, currentTime + 0.16); // G5

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(523 * 2, currentTime);
          osc2.frequency.setValueAtTime(659 * 2, currentTime + 0.08);
          osc2.frequency.setValueAtTime(784 * 2, currentTime + 0.16);

          gain.gain.setValueAtTime(0.1, currentTime);
          gain.gain.setValueAtTime(0.12, currentTime + 0.08);
          gain.gain.setValueAtTime(0.1, currentTime + 0.16);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.35);

          osc.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.35);
          osc2.start(currentTime);
          osc2.stop(currentTime + 0.35);
          break;
        }

        case 'damage': {
          // Heavy impact thud
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(100, currentTime);
          osc.frequency.exponentialRampToValueAtTime(30, currentTime + 0.2);

          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(80, currentTime);
          osc2.frequency.exponentialRampToValueAtTime(20, currentTime + 0.15);

          filter.type = 'lowpass';
          filter.frequency.value = 200;

          gain.gain.setValueAtTime(0.25, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.25);

          osc.connect(filter);
          osc2.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.25);
          osc2.start(currentTime);
          osc2.stop(currentTime + 0.2);
          break;
        }

        case 'rest': {
          // Quick tap/exhaust
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(600, currentTime);
          osc.frequency.exponentialRampToValueAtTime(300, currentTime + 0.08);

          gain.gain.setValueAtTime(0.1, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.1);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.1);
          break;
        }

        case 'turnStart': {
          // Anime two-tone chime
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, currentTime); // A5
          osc.frequency.setValueAtTime(1109, currentTime + 0.12); // C#6

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(880 * 1.5, currentTime);
          osc2.frequency.setValueAtTime(1109 * 1.5, currentTime + 0.12);

          gain.gain.setValueAtTime(0.08, currentTime);
          gain.gain.setValueAtTime(0.1, currentTime + 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.35);

          osc.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 0.35);
          osc2.start(currentTime);
          osc2.stop(currentTime + 0.35);
          break;
        }

        case 'victory': {
          // Triumphant ascending fanfare
          const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
          const duration = 0.15;

          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;
            osc2.type = 'triangle';
            osc2.frequency.value = freq * 2;

            const startTime = currentTime + i * duration;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
            gain.gain.setValueAtTime(0.12, startTime + duration - 0.02);
            gain.gain.linearRampToValueAtTime(i === notes.length - 1 ? 0.001 : 0.08, startTime + duration + 0.1);

            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration + 0.3);
            osc2.start(startTime);
            osc2.stop(startTime + duration + 0.3);
          });
          break;
        }

        case 'defeat': {
          // Somber descending tone
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, currentTime); // A4
          osc.frequency.exponentialRampToValueAtTime(220, currentTime + 0.4); // A3
          osc.frequency.exponentialRampToValueAtTime(110, currentTime + 0.8); // A2

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(440 * 1.5, currentTime);
          osc2.frequency.exponentialRampToValueAtTime(220 * 1.5, currentTime + 0.4);
          osc2.frequency.exponentialRampToValueAtTime(110 * 1.5, currentTime + 0.8);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1000, currentTime);
          filter.frequency.exponentialRampToValueAtTime(200, currentTime + 0.8);

          gain.gain.setValueAtTime(0.1, currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 1);

          osc.connect(filter);
          osc2.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + 1);
          osc2.start(currentTime);
          osc2.stop(currentTime + 1);
          break;
        }
      }
    } catch (e) {
      console.warn('Sound playback failed:', e);
    }
  }, [isMuted, getAudioContext]);

  return {
    playSound,
    isMuted,
    toggleMute,
    setMuted
  };
};

export default useSoundEffects;
