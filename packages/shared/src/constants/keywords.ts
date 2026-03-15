/**
 * Temporary keyword constants used as game mechanics.
 * Stored on card.temporaryKeywords or card.continuousKeywords.
 */

// Combat keywords
export const KW_UNBLOCKABLE = 'Unblockable';
export const KW_CAN_ATTACK_ACTIVE = 'CanAttackActive';
export const KW_BLOCKER = 'Blocker';
export const KW_IMMUNE_COMBAT = 'ImmuneCombat';

// Protection keywords
export const KW_IMMUNE_EFFECTS = 'ImmuneEffects';
export const KW_SILENCED = 'Silenced';
export const KW_KO_PROTECTOR = 'KOProtector';
export const KW_PREVENT_LIFE_ADD = 'PreventLifeAdd';
export const KW_IMMUNE_KO = 'ImmuneKO';
export const KW_CANT_BE_RESTED = 'CantBeRested';

// Player restriction keywords (applied to leader's temporaryKeywords AND player.restrictions)
export const KW_CANT_PLAY_CARDS = 'CantPlayCards';
export const KW_CANT_PLAY_CHARACTERS = 'CantPlayCharacters';
export const KW_DISABLE_EFFECT_DRAWS = 'DisableEffectDraws';
export const KW_NO_ON_PLAYS = 'NoOnPlays';
export const KW_DON_EQUALIZATION = 'DonEqualization';

// Prefix-based keywords (checked with startsWith)
export const KW_PREFIX_CONFUSION_TAX = 'ConfusionTax:';
export const KW_PREFIX_ATTRIBUTE = 'Attribute:';
