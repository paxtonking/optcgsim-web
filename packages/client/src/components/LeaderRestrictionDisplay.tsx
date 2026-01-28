import { useMemo } from 'react';
import { parseLeaderRestrictions } from '@optcgsim/shared';

interface LeaderRestrictionDisplayProps {
  effectText: string | undefined | null;
}

export function LeaderRestrictionDisplay({ effectText }: LeaderRestrictionDisplayProps) {
  const abilities = useMemo(() => {
    if (!effectText) return { restrictions: [], startOfGame: undefined };
    return parseLeaderRestrictions(effectText);
  }, [effectText]);

  if (abilities.restrictions.length === 0 && !abilities.startOfGame) {
    return null;
  }

  return (
    <div className="mb-4 space-y-2">
      {abilities.restrictions.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded p-2">
          <p className="text-yellow-400 text-xs font-medium mb-1">Deck Restrictions:</p>
          <ul className="text-yellow-300 text-xs space-y-0.5">
            {abilities.restrictions.map((r, i) => (
              <li key={i}>• {r.description}</li>
            ))}
          </ul>
        </div>
      )}

      {abilities.startOfGame && (
        <div className="bg-blue-900/30 border border-blue-700 rounded p-2">
          <p className="text-blue-400 text-xs font-medium mb-1">Start of Game:</p>
          <p className="text-blue-300 text-xs">{abilities.startOfGame.description}</p>
        </div>
      )}
    </div>
  );
}
