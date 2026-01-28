import React, { useState, useCallback, useRef, useEffect } from 'react';
import './EffectAnimation.css';

export type EffectAnimationType =
  | 'buff'
  | 'debuff'
  | 'draw'
  | 'ko'
  | 'don'
  | 'trigger'
  | 'counter'
  | 'search'
  | 'play'
  | 'neutral';

// Position type for card locations
interface Position {
  x: number;
  y: number;
}

// Particle animation data
interface ParticleData {
  id: string;
  type: EffectAnimationType;
  startPos: Position;
  endPos: Position;
  size: 'small' | 'medium' | 'large';
  delay: number;
  duration: number;
}

// Trail animation data
interface TrailData {
  id: string;
  type: EffectAnimationType;
  startPos: Position;
  endPos: Position;
  duration: number;
}

// Burst animation data (radial effect at a position)
interface BurstData {
  id: string;
  type: EffectAnimationType;
  position: Position;
  size: number;
  duration: number;
}

// Impact flash data
interface ImpactData {
  id: string;
  type: EffectAnimationType;
  position: Position;
}

// Floating text data
interface FloatTextData {
  id: string;
  type: EffectAnimationType;
  position: Position;
  text: string;
}

// Shatter fragment data
interface ShatterData {
  id: string;
  position: Position;
  fragments: Array<{
    id: string;
    dx: number;
    dy: number;
    rotation: number;
  }>;
}

// Combined animation state
interface AnimationState {
  particles: ParticleData[];
  trails: TrailData[];
  bursts: BurstData[];
  impacts: ImpactData[];
  floatTexts: FloatTextData[];
  shatters: ShatterData[];
}

let animationIdCounter = 0;

export interface EffectAnimationAPI {
  // Particle trail from source to target
  playParticleTrail: (
    type: EffectAnimationType,
    sourcePos: Position,
    targetPos: Position,
    particleCount?: number
  ) => void;

  // Energy trail line from source to target
  playEnergyTrail: (
    type: EffectAnimationType,
    sourcePos: Position,
    targetPos: Position
  ) => void;

  // Radial burst at a position (for self-buffs)
  playBurst: (
    type: EffectAnimationType,
    position: Position,
    size?: number
  ) => void;

  // Impact flash at target
  playImpact: (
    type: EffectAnimationType,
    position: Position
  ) => void;

  // Floating text (damage numbers, buff amounts)
  playFloatText: (
    type: EffectAnimationType,
    position: Position,
    text: string
  ) => void;

  // KO shatter effect
  playShatter: (position: Position) => void;

  // Combined effect: particles + burst at source + impact at target
  playFullEffect: (
    type: EffectAnimationType,
    sourcePos: Position,
    targetPos: Position,
    text?: string
  ) => void;

  // Clear all animations
  clearAll: () => void;
}

interface EffectAnimationLayerProps {
  apiRef?: React.MutableRefObject<EffectAnimationAPI | null>;
}

export const EffectAnimationLayer: React.FC<EffectAnimationLayerProps> = ({ apiRef }) => {
  const [state, setState] = useState<AnimationState>({
    particles: [],
    trails: [],
    bursts: [],
    impacts: [],
    floatTexts: [],
    shatters: [],
  });

  // Cleanup functions ref
  const cleanupTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());

  // Helper to schedule cleanup
  const scheduleCleanup = useCallback((
    type: keyof AnimationState,
    id: string,
    delay: number
  ) => {
    const timeout = setTimeout(() => {
      setState(prev => ({
        ...prev,
        [type]: prev[type].filter((item: { id: string }) => item.id !== id),
      }));
      cleanupTimeouts.current.delete(timeout);
    }, delay);
    cleanupTimeouts.current.add(timeout);
  }, []);

  // API implementation
  const playParticleTrail = useCallback((
    type: EffectAnimationType,
    sourcePos: Position,
    targetPos: Position,
    particleCount = 8
  ) => {
    const particles: ParticleData[] = [];
    const baseDuration = 400;

    for (let i = 0; i < particleCount; i++) {
      const id = `particle-${++animationIdCounter}`;
      // Add some randomness to trajectory
      const offsetX = (Math.random() - 0.5) * 40;
      const offsetY = (Math.random() - 0.5) * 40;

      particles.push({
        id,
        type,
        startPos: sourcePos,
        endPos: {
          x: targetPos.x + offsetX,
          y: targetPos.y + offsetY,
        },
        size: ['small', 'medium', 'large'][Math.floor(Math.random() * 3)] as 'small' | 'medium' | 'large',
        delay: i * 30, // Stagger particles
        duration: baseDuration + Math.random() * 100,
      });

      scheduleCleanup('particles', id, baseDuration + i * 30 + 200);
    }

    setState(prev => ({
      ...prev,
      particles: [...prev.particles, ...particles],
    }));
  }, [scheduleCleanup]);

  const playEnergyTrail = useCallback((
    type: EffectAnimationType,
    sourcePos: Position,
    targetPos: Position
  ) => {
    const id = `trail-${++animationIdCounter}`;
    const duration = 300;

    const trail: TrailData = {
      id,
      type,
      startPos: sourcePos,
      endPos: targetPos,
      duration,
    };

    setState(prev => ({
      ...prev,
      trails: [...prev.trails, trail],
    }));

    scheduleCleanup('trails', id, duration + 50);
  }, [scheduleCleanup]);

  const playBurst = useCallback((
    type: EffectAnimationType,
    position: Position,
    size = 150
  ) => {
    const id = `burst-${++animationIdCounter}`;
    const duration = 400;

    const burst: BurstData = {
      id,
      type,
      position,
      size,
      duration,
    };

    setState(prev => ({
      ...prev,
      bursts: [...prev.bursts, burst],
    }));

    scheduleCleanup('bursts', id, duration + 50);
  }, [scheduleCleanup]);

  const playImpact = useCallback((
    type: EffectAnimationType,
    position: Position
  ) => {
    const id = `impact-${++animationIdCounter}`;

    const impact: ImpactData = {
      id,
      type,
      position,
    };

    setState(prev => ({
      ...prev,
      impacts: [...prev.impacts, impact],
    }));

    scheduleCleanup('impacts', id, 350);
  }, [scheduleCleanup]);

  const playFloatText = useCallback((
    type: EffectAnimationType,
    position: Position,
    text: string
  ) => {
    const id = `float-${++animationIdCounter}`;

    const floatText: FloatTextData = {
      id,
      type,
      position,
      text,
    };

    setState(prev => ({
      ...prev,
      floatTexts: [...prev.floatTexts, floatText],
    }));

    scheduleCleanup('floatTexts', id, 850);
  }, [scheduleCleanup]);

  const playShatter = useCallback((position: Position) => {
    const id = `shatter-${++animationIdCounter}`;
    const fragmentCount = 12;
    const fragments: ShatterData['fragments'] = [];

    for (let i = 0; i < fragmentCount; i++) {
      const angle = (i / fragmentCount) * Math.PI * 2;
      const distance = 50 + Math.random() * 50;

      fragments.push({
        id: `frag-${i}`,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        rotation: Math.random() * 360,
      });
    }

    const shatter: ShatterData = {
      id,
      position,
      fragments,
    };

    setState(prev => ({
      ...prev,
      shatters: [...prev.shatters, shatter],
    }));

    scheduleCleanup('shatters', id, 550);
  }, [scheduleCleanup]);

  const playFullEffect = useCallback((
    type: EffectAnimationType,
    sourcePos: Position,
    targetPos: Position,
    text?: string
  ) => {
    // Burst at source
    playBurst(type, sourcePos, 100);

    // Particles flying to target
    setTimeout(() => {
      playParticleTrail(type, sourcePos, targetPos, 10);
    }, 100);

    // Impact at target
    setTimeout(() => {
      playImpact(type, targetPos);
      if (text) {
        playFloatText(type, targetPos, text);
      }
    }, 350);
  }, [playBurst, playParticleTrail, playImpact, playFloatText]);

  const clearAll = useCallback(() => {
    cleanupTimeouts.current.forEach(timeout => clearTimeout(timeout));
    cleanupTimeouts.current.clear();
    setState({
      particles: [],
      trails: [],
      bursts: [],
      impacts: [],
      floatTexts: [],
      shatters: [],
    });
  }, []);

  // Expose API via ref
  useEffect(() => {
    if (apiRef) {
      apiRef.current = {
        playParticleTrail,
        playEnergyTrail,
        playBurst,
        playImpact,
        playFloatText,
        playShatter,
        playFullEffect,
        clearAll,
      };
    }
  }, [apiRef, playParticleTrail, playEnergyTrail, playBurst, playImpact, playFloatText, playShatter, playFullEffect, clearAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTimeouts.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  // Calculate angle and length for trail
  const getTrailStyles = (trail: TrailData) => {
    const dx = trail.endPos.x - trail.startPos.x;
    const dy = trail.endPos.y - trail.startPos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    return {
      left: trail.startPos.x,
      top: trail.startPos.y,
      transform: `rotate(${angle}deg)`,
      '--trail-length': `${length}px`,
      '--trail-duration': `${trail.duration}ms`,
    } as React.CSSProperties;
  };

  return (
    <div className="effect-animation-layer">
      {/* Particles */}
      {state.particles.map(particle => (
        <div
          key={particle.id}
          className={`effect-particle effect-particle--${particle.size} effect-particle--${particle.type} effect-particle--flying`}
          style={{
            left: particle.startPos.x,
            top: particle.startPos.y,
            '--dx': `${particle.endPos.x - particle.startPos.x}px`,
            '--dy': `${particle.endPos.y - particle.startPos.y}px`,
            '--particle-duration': `${particle.duration}ms`,
            animationDelay: `${particle.delay}ms`,
          } as React.CSSProperties}
        />
      ))}

      {/* Trails */}
      {state.trails.map(trail => (
        <div
          key={trail.id}
          className={`effect-trail effect-trail--${trail.type} effect-trail--active`}
          style={getTrailStyles(trail)}
        />
      ))}

      {/* Bursts */}
      {state.bursts.map(burst => (
        <div
          key={burst.id}
          className={`effect-burst effect-burst--${burst.type} effect-burst--active`}
          style={{
            left: burst.position.x,
            top: burst.position.y,
            '--burst-size': `${burst.size}px`,
            '--burst-duration': `${burst.duration}ms`,
          } as React.CSSProperties}
        />
      ))}

      {/* Impacts */}
      {state.impacts.map(impact => (
        <div
          key={impact.id}
          className={`effect-impact effect-impact--${impact.type} effect-impact--active`}
          style={{
            left: impact.position.x,
            top: impact.position.y,
          }}
        />
      ))}

      {/* Float Texts */}
      {state.floatTexts.map(ft => (
        <div
          key={ft.id}
          className={`effect-float-text effect-float-text--${ft.type} effect-float-text--active`}
          style={{
            left: ft.position.x,
            top: ft.position.y,
          }}
        >
          {ft.text}
        </div>
      ))}

      {/* Shatters */}
      {state.shatters.map(shatter => (
        <div
          key={shatter.id}
          className="effect-shatter"
          style={{
            left: shatter.position.x,
            top: shatter.position.y,
          }}
        >
          {shatter.fragments.map(frag => (
            <div
              key={frag.id}
              className="effect-shatter__fragment effect-shatter__fragment--flying"
              style={{
                '--fx': `${frag.dx}px`,
                '--fy': `${frag.dy}px`,
                '--fr': `${frag.rotation}deg`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// Hook for using effect animations
export function useEffectAnimation(): [
  React.ReactNode,
  EffectAnimationAPI
] {
  const apiRef = useRef<EffectAnimationAPI | null>(null);

  const api: EffectAnimationAPI = {
    playParticleTrail: (...args) => apiRef.current?.playParticleTrail(...args),
    playEnergyTrail: (...args) => apiRef.current?.playEnergyTrail(...args),
    playBurst: (...args) => apiRef.current?.playBurst(...args),
    playImpact: (...args) => apiRef.current?.playImpact(...args),
    playFloatText: (...args) => apiRef.current?.playFloatText(...args),
    playShatter: (...args) => apiRef.current?.playShatter(...args),
    playFullEffect: (...args) => apiRef.current?.playFullEffect(...args),
    clearAll: () => apiRef.current?.clearAll(),
  };

  const element = <EffectAnimationLayer apiRef={apiRef} />;

  return [element, api];
}

export default EffectAnimationLayer;
