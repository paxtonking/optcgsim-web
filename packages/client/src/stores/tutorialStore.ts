import { create } from 'zustand';
import { TUTORIAL_STEPS, TutorialStep } from '../components/game/tutorial/tutorialSteps';

export type TutorialPhase = 'INACTIVE' | 'MULLIGAN' | 'TURN_1' | 'TURN_2' | 'TURN_3' | 'FREE_PLAY';

interface TutorialStore {
  isActive: boolean;
  currentStepIndex: number;
  phase: TutorialPhase;
  steps: TutorialStep[];
  lastAdvanceTime: number;

  startTutorial: () => void;
  advanceStep: () => void;
  skipTutorial: () => void;
  getCurrentStep: () => TutorialStep | null;
  jumpToPhase: (phase: TutorialPhase) => void;
  reset: () => void;
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  isActive: false,
  currentStepIndex: 0,
  phase: 'INACTIVE',
  steps: TUTORIAL_STEPS,
  lastAdvanceTime: 0,

  startTutorial: () => set({
    isActive: true,
    currentStepIndex: 0,
    phase: 'MULLIGAN',
    lastAdvanceTime: 0,
  }),

  advanceStep: () => {
    const now = Date.now();
    const { currentStepIndex, steps, lastAdvanceTime } = get();
    if (now - lastAdvanceTime < 100) return; // Debounce duplicate calls
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= steps.length) {
      set({ phase: 'FREE_PLAY', isActive: false, lastAdvanceTime: now });
    } else {
      set({ currentStepIndex: nextIndex, phase: steps[nextIndex].phase, lastAdvanceTime: now });
    }
  },

  skipTutorial: () => set({
    isActive: false,
    phase: 'FREE_PLAY',
  }),

  getCurrentStep: () => {
    const { isActive, currentStepIndex, steps } = get();
    if (!isActive || currentStepIndex >= steps.length) return null;
    return steps[currentStepIndex];
  },

  jumpToPhase: (phase: TutorialPhase) => {
    const { steps } = get();
    const targetIndex = steps.findIndex(s => s.phase === phase);
    if (targetIndex >= 0) {
      set({ currentStepIndex: targetIndex, phase });
    }
  },

  reset: () => set({
    isActive: false,
    currentStepIndex: 0,
    phase: 'INACTIVE',
    lastAdvanceTime: 0,
  }),
}));
