import { useState, useMemo, useEffect, useCallback, useRef } from 'react';

interface EffectWithId {
  id: string;
  playerId: string;
}

/** Result of a fizzle check: whether the effect should auto-skip and an optional banner message. */
export interface FizzleCheckResult {
  shouldFizzle: boolean;
  message?: string;
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
  /**
   * The local player's ID. Required for auto-fizzle (only the owning
   * player's client should auto-skip).
   */
  playerId?: string;
  /** Callback to display an info banner to the player. Required for auto-fizzle. */
  showInfoBanner?: (message: string) => void;
  /**
   * Custom fizzle check. Called when the effect is active, belongs to this
   * player, and both `playerId` and `showInfoBanner` are provided.
   *
   * Return `{ shouldFizzle: true, message: '...' }` to auto-skip with a
   * banner, or `{ shouldFizzle: false }` to let the player choose normally.
   *
   * When omitted, the hook uses a default check: fizzle when the effect has
   * `requiresChoice === true` and `validTargets` is empty.
   */
  fizzleCheck?: (effect: TEffect, validTargets: Set<string>) => FizzleCheckResult;
  /** Delay in ms before the auto-skip fires (default 2000). */
  autoFizzleDelayMs?: number;
}

interface UseEffectStepReturn<TEffect extends EffectWithId> {
  selectedTargets: string[];
  setSelectedTargets: React.Dispatch<React.SetStateAction<string[]>>;
  currentEffect: TEffect | null;
  validTargets: Set<string>;
  handleUse: () => void;
  handleSkip: () => void;
}

/**
 * Default fizzle check: fizzle when the effect declares `requiresChoice`
 * and there are no valid targets to choose from.
 */
function defaultFizzleCheck<TEffect extends EffectWithId>(
  effect: TEffect,
  validTargets: Set<string>,
): FizzleCheckResult {
  const requiresChoice = (effect as TEffect & { requiresChoice?: boolean }).requiresChoice;
  if (requiresChoice && validTargets.size === 0) {
    return { shouldFizzle: true, message: 'No valid targets - effect fizzles' };
  }
  return { shouldFizzle: false };
}

export function useEffectStep<TEffect extends EffectWithId>(
  config: UseEffectStepConfig<TEffect>
): UseEffectStepReturn<TEffect> {
  const {
    active, pendingEffects, getValidTargets, resolveAction, skipAction, playSound,
    playerId, showInfoBanner, fizzleCheck, autoFizzleDelayMs = 2000,
  } = config;

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

  // ----- Auto-fizzle logic -----
  // Keep a ref to the latest skipAction so the timeout closure never goes stale.
  const skipActionRef = useRef(skipAction);
  skipActionRef.current = skipAction;

  useEffect(() => {
    // Opt-in: both playerId and showInfoBanner must be provided.
    if (!playerId || !showInfoBanner) return;
    if (!currentEffect || currentEffect.playerId !== playerId) return;

    const check = fizzleCheck
      ? fizzleCheck(currentEffect, validTargets)
      : defaultFizzleCheck(currentEffect, validTargets);

    if (!check.shouldFizzle) return;

    if (check.message) {
      showInfoBanner(check.message);
    }

    const timer = setTimeout(() => {
      skipActionRef.current(currentEffect.id);
    }, autoFizzleDelayMs);

    return () => clearTimeout(timer);
  }, [currentEffect, validTargets, playerId, showInfoBanner, fizzleCheck, autoFizzleDelayMs]);

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
