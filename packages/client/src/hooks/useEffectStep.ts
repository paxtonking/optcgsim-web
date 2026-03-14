import { useState, useMemo, useEffect, useCallback } from 'react';

interface EffectWithId {
  id: string;
}

interface UseEffectStepConfig<TEffect extends EffectWithId> {
  /** Whether this effect step is currently active */
  active: boolean;
  /** The pending effects array (first one is current) */
  pendingEffects: TEffect[] | undefined;
  /** Extract valid target IDs from the current effect */
  getValidTargets: (effect: TEffect) => string[];
  /** Resolve the effect with selected targets */
  resolveAction: (effectId: string, targets: string[]) => void;
  /** Skip the effect */
  skipAction: (effectId: string) => void;
  /** Optional sound to play on resolve */
  playSound?: () => void;
}

interface UseEffectStepReturn<TEffect extends EffectWithId> {
  selectedTargets: string[];
  setSelectedTargets: React.Dispatch<React.SetStateAction<string[]>>;
  currentEffect: TEffect | null;
  validTargets: Set<string>;
  handleUse: () => void;
  handleSkip: () => void;
}

export function useEffectStep<TEffect extends EffectWithId>(
  config: UseEffectStepConfig<TEffect>
): UseEffectStepReturn<TEffect> {
  const { active, pendingEffects, getValidTargets, resolveAction, skipAction, playSound } = config;

  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  const currentEffect = useMemo((): TEffect | null => {
    if (!active || !pendingEffects || pendingEffects.length === 0) return null;
    return pendingEffects[0];
  }, [active, pendingEffects]);

  const validTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!currentEffect) return targets;
    getValidTargets(currentEffect).forEach(id => targets.add(id));
    return targets;
  }, [currentEffect, getValidTargets]);

  useEffect(() => {
    if (!currentEffect) {
      setSelectedTargets([]);
    }
  }, [currentEffect]);

  const handleUse = useCallback(() => {
    if (!currentEffect) return;
    resolveAction(currentEffect.id, selectedTargets);
    setSelectedTargets([]);
    playSound?.();
  }, [currentEffect, selectedTargets, resolveAction, playSound]);

  const handleSkip = useCallback(() => {
    if (!currentEffect) return;
    skipAction(currentEffect.id);
    setSelectedTargets([]);
  }, [currentEffect, skipAction]);

  return {
    selectedTargets,
    setSelectedTargets,
    currentEffect,
    validTargets,
    handleUse,
    handleSkip,
  };
}
