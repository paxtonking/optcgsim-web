/**
 * Parser for leader card restrictions and start-of-game abilities
 * Extracts deck building restrictions and special abilities from effect text
 */

export interface LeaderRestriction {
  type: 'COST_LIMIT' | 'COST_TYPE_LIMIT';
  cardType?: 'CHARACTER' | 'EVENT' | 'STAGE' | 'ALL';
  operator: 'LESS_THAN';
  value: number;
  description: string;
}

export interface StartOfGameAbility {
  type: 'PLAY_FROM_DECK';
  trait: string;
  cardType: 'STAGE' | 'CHARACTER' | 'EVENT';
  count: number;
  optional: boolean;
  description: string;
}

export interface LeaderAbilities {
  restrictions: LeaderRestriction[];
  startOfGame?: StartOfGameAbility;
}

/**
 * Parse leader effect text to extract deck restrictions and start-of-game abilities
 */
export function parseLeaderRestrictions(effectText: string): LeaderAbilities {
  const restrictions: LeaderRestriction[] = [];
  let startOfGame: StartOfGameAbility | undefined;

  if (!effectText) {
    return { restrictions };
  }

  // Pattern: "cannot include Events with a cost of 2 or more" (Imu OP13-079)
  const eventCostMatch = effectText.match(/cannot include Events? with a cost of (\d+) or more/i);
  if (eventCostMatch) {
    restrictions.push({
      type: 'COST_TYPE_LIMIT',
      cardType: 'EVENT',
      operator: 'LESS_THAN',
      value: parseInt(eventCostMatch[1], 10),
      description: `No Events with cost ${eventCostMatch[1]} or more`,
    });
  }

  // Pattern: "cannot include cards with a cost of 5 or more" (Shanks/Silvers Rayleigh OP12-001)
  const allCostMatch = effectText.match(/cannot include cards? with a cost of (\d+) or more/i);
  if (allCostMatch) {
    restrictions.push({
      type: 'COST_LIMIT',
      cardType: 'ALL',
      operator: 'LESS_THAN',
      value: parseInt(allCostMatch[1], 10),
      description: `No cards with cost ${allCostMatch[1]} or more`,
    });
  }

  // Pattern: "cannot include Characters with a cost of X or more"
  const charCostMatch = effectText.match(/cannot include Characters? with a cost of (\d+) or more/i);
  if (charCostMatch) {
    restrictions.push({
      type: 'COST_TYPE_LIMIT',
      cardType: 'CHARACTER',
      operator: 'LESS_THAN',
      value: parseInt(charCostMatch[1], 10),
      description: `No Characters with cost ${charCostMatch[1]} or more`,
    });
  }

  // Pattern: "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck" (Imu)
  // Also handles: "at the start of the game, play up to X {Trait} type CardType card"
  const startMatch = effectText.match(
    /at the start of the game,?\s*play up to (\d+) \{([^}]+)\} type (Stage|Character|Event) cards?/i
  );
  if (startMatch) {
    startOfGame = {
      type: 'PLAY_FROM_DECK',
      count: parseInt(startMatch[1], 10),
      trait: startMatch[2],
      cardType: startMatch[3].toUpperCase() as 'STAGE' | 'CHARACTER' | 'EVENT',
      optional: false, // Start-of-game abilities are mandatory if valid cards exist
      description: `At game start: Play up to ${startMatch[1]} {${startMatch[2]}} ${startMatch[3]} from deck`,
    };
  }

  return { restrictions, startOfGame };
}

/**
 * Check if a card violates a leader restriction
 */
export function cardViolatesRestriction(
  card: { type: string; cost: number | null },
  restriction: LeaderRestriction
): boolean {
  // Check card type matches restriction
  if (restriction.cardType !== 'ALL') {
    if (card.type !== restriction.cardType) {
      return false; // Different type, doesn't violate
    }
  }

  // Check cost
  const cost = card.cost ?? 0;
  if (restriction.operator === 'LESS_THAN') {
    // Restriction says cost must be LESS THAN value, so >= value violates
    return cost >= restriction.value;
  }

  return false;
}

/**
 * Format a restriction for display
 */
export function formatRestriction(restriction: LeaderRestriction): string {
  return restriction.description;
}
