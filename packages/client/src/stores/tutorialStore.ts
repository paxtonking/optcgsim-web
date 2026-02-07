import { create } from 'zustand';
import { TUTORIAL_STEPS, TutorialStep } from '../components/game/tutorial/tutorialSteps';

export type TutorialPhase = 'INACTIVE' | 'MULLIGAN' | 'TURN_1' | 'TURN_2' | 'TURN_3' | 'FREE_PLAY';

interface TutorialStore {
  isActive: boolean;
  currentStepIndex: number;
  phase: TutorialPhase;
  steps: TutorialStep[];

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

  startTutorial: () => set({
    isActive: true,
    currentStepIndex: 0,
    phase: 'MULLIGAN',
  }),

  advanceStep: () => {
    const { currentStepIndex, steps } = get();
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= steps.length) {
      set({ phase: 'FREE_PLAY', isActive: false });
    } else {
      set({ currentStepIndex: nextIndex, phase: steps[nextIndex].phase });
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
  }),
}));
