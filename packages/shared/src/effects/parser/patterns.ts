// Pattern definitions for parsing effect text

import {
  EffectTrigger,
  EffectType,
  TargetType,
  ConditionType,
  EffectDuration,
} from '../types';
import {
  ParsedTrigger,
  ParsedAction,
  ParsedTarget,
  ParsedFilter,
  ParsedCondition,
  ParsedCost,
} from './types';

// ============================================
// TRIGGER PATTERNS
// ============================================

interface TriggerPattern {
  pattern: RegExp;
  trigger: EffectTrigger;
  extractValue?: (match: RegExpMatchArray) => number | undefined;
}

export const TRIGGER_PATTERNS: TriggerPattern[] = [
  // NOTE: DON!! x requirements are now handled as CONDITIONS, not triggers
  // See CONDITION_PATTERNS for DON_ATTACHED_OR_MORE

  // Dual triggers
  { pattern: /\[On Play\]\/\[When Attacking\]/i, trigger: EffectTrigger.ON_PLAY }, // Dual trigger - treat as On Play

  // Basic triggers
  { pattern: /\[On Play\]/i, trigger: EffectTrigger.ON_PLAY },
  { pattern: /\[When Attacking\]/i, trigger: EffectTrigger.ON_ATTACK },
  { pattern: /\[On Attack\]/i, trigger: EffectTrigger.ON_ATTACK },
  { pattern: /\[On Block\]/i, trigger: EffectTrigger.ON_BLOCK },
  { pattern: /\[Counter\]/i, trigger: EffectTrigger.COUNTER },
  { pattern: /\[Trigger\]/i, trigger: EffectTrigger.TRIGGER },

  // Main phase triggers
  { pattern: /\[Activate:\s*Main\]/i, trigger: EffectTrigger.ACTIVATE_MAIN },
  { pattern: /\[Main\]\/\[Counter\]/i, trigger: EffectTrigger.MAIN }, // Dual trigger - treat as Main
  { pattern: /\[Main\]/i, trigger: EffectTrigger.MAIN },

  // Turn-based triggers
  { pattern: /\[End of (?:Your )?Turn\]/i, trigger: EffectTrigger.END_OF_TURN },
  { pattern: /\[Your Turn\]/i, trigger: EffectTrigger.YOUR_TURN },
  { pattern: /\[Opponent'?s?\s*Turn\]/i, trigger: EffectTrigger.OPPONENT_TURN },

  // KO triggers
  { pattern: /\[On K\.?O\.?\]/i, trigger: EffectTrigger.ON_KO },
  { pattern: /\[When K\.?O\.?'?d\]/i, trigger: EffectTrigger.ON_KO },

  // Opponent triggers
  { pattern: /\[On Your Opponent'?s?\s*Attack\]/i, trigger: EffectTrigger.OPPONENT_ATTACK },
];

// Keywords that indicate passive abilities
export const KEYWORD_PATTERNS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /\[Rush\]/i, keyword: 'Rush' },
  { pattern: /\[Blocker\]/i, keyword: 'Blocker' },
  { pattern: /\[Banish\]/i, keyword: 'Banish' },
  { pattern: /\[Double Attack\]/i, keyword: 'Double Attack' },
];

// ============================================
// ACTION PATTERNS
// ============================================

interface ActionPattern {
  pattern: RegExp;
  actionType: EffectType;
  extractValue?: (match: RegExpMatchArray) => number | undefined;
  extractKeyword?: (match: RegExpMatchArray) => string | undefined;
  targetType?: TargetType;
}

export const ACTION_PATTERNS: ActionPattern[] = [
  // Draw effects
  {
    pattern: /Draw (\d+) cards?/i,
    actionType: EffectType.DRAW_CARDS,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /Draw a card/i,
    actionType: EffectType.DRAW_CARDS,
    extractValue: () => 1
  },

  // Power modifications - gains +X power
  {
    pattern: /gains?\s*\+(\d+)\s*power/i,
    actionType: EffectType.BUFF_POWER,
    extractValue: (m) => parseInt(m[1])
  },
  // Give ... +X power
  {
    pattern: /[Gg]ive.*\+(\d+)\s*power/i,
    actionType: EffectType.BUFF_POWER,
    extractValue: (m) => parseInt(m[1])
  },
  // -X power (debuff)
  {
    pattern: /[−\-](\d+)\s*power/i,
    actionType: EffectType.DEBUFF_POWER,
    extractValue: (m) => parseInt(m[1])
  },

  // -X cost (debuff cost for KO effects) - "Give up to 1 of your opponent's Characters −3 cost"
  {
    pattern: /[Gg]ive.*[−\-](\d+)\s*cost/i,
    actionType: EffectType.DEBUFF_COST,
    extractValue: (m) => parseInt(m[1])
  },
  // "gains +X cost" - some characters gain cost based on conditions
  {
    pattern: /gains?\s*\+(\d+)\s*cost/i,
    actionType: EffectType.INCREASE_COST,
    extractValue: (m) => parseInt(m[1])
  },

  // KO effects
  {
    pattern: /K\.?O\.?\s+up to\s+(\d+)/i,
    actionType: EffectType.KO_CHARACTER,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /K\.?O\.?\s+(\d+)/i,
    actionType: EffectType.KO_CHARACTER,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /K\.?O\.?\s+(?:this|that)/i,
    actionType: EffectType.KO_CHARACTER,
    extractValue: () => 1
  },
  // K.O. stages specifically (e.g., "K.O. up to 1 of your opponent's Stages")
  {
    pattern: /K\.?O\.?.*Stages?/i,
    actionType: EffectType.KO_CHARACTER,  // Reuse KO_CHARACTER for stages too
    extractValue: () => 1
  },

  // Card movement - Return to hand
  {
    pattern: /[Rr]eturn.*to.*(?:owner'?s?\s+)?hand/i,
    actionType: EffectType.RETURN_TO_HAND
  },
  // Send to bottom of deck
  {
    pattern: /place.*(?:at the )?bottom of.*deck/i,
    actionType: EffectType.SEND_TO_DECK_BOTTOM
  },
  // Trash from hand
  {
    pattern: /trash\s+(\d+)\s+cards?\s+from\s+(?:your\s+)?hand/i,
    actionType: EffectType.DISCARD_FROM_HAND,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /trash\s+a\s+card\s+from\s+(?:your\s+)?hand/i,
    actionType: EffectType.DISCARD_FROM_HAND,
    extractValue: () => 1
  },

  // DON effects
  {
    pattern: /[Ss]et\s+(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?(?:rested\s+)?DON!!\s*(?:cards?\s+)?(?:as\s+)?active/i,
    actionType: EffectType.ACTIVE_DON,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  {
    pattern: /[Gg]ive\s+(?:up to\s+)?(\d+)?\s*rested\s+DON!!/i,
    actionType: EffectType.ATTACH_DON,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  {
    pattern: /[Aa]dd\s+(?:up to\s+)?(\d+)?\s*DON!!\s*(?:cards?\s+)?from\s+(?:your\s+)?DON!!\s*deck/i,
    actionType: EffectType.ADD_DON,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Rest/Activate characters
  {
    pattern: /[Rr]est\s+(?:up to\s+)?(?:a total of\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?(?:opponent'?s?\s+)?Characters?/i,
    actionType: EffectType.REST_CHARACTER,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  {
    pattern: /[Ss]et.*(?:as\s+)?active/i,
    actionType: EffectType.ACTIVATE_CHARACTER
  },

  // Keyword grants
  {
    pattern: /gains?\s+\[([^\]]+)\]/i,
    actionType: EffectType.GRANT_KEYWORD,
    extractKeyword: (m) => m[1]
  },
  {
    pattern: /[Gg]ive.*\[([^\]]+)\]/i,
    actionType: EffectType.GRANT_KEYWORD,
    extractKeyword: (m) => m[1]
  },

  // Play named card from hand - "Play up to 1 [CardName] from your hand" (MUST BE BEFORE GENERAL PATTERNS)
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+(?:with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+)?from\s+(?:your\s+)?hand/i,
    actionType: EffectType.PLAY_FROM_HAND,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  // Play named card from trash - "Play up to 1 [CardName] from your trash" (MUST BE BEFORE GENERAL PATTERNS)
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+(?:with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+)?from\s+(?:your\s+)?trash/i,
    actionType: EffectType.PLAY_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  // Play named card from deck - "Play up to 1 [CardName] from your deck" (MUST BE BEFORE GENERAL PATTERNS)
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+from\s+(?:your\s+)?deck/i,
    actionType: EffectType.PLAY_FROM_DECK,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  // Play colored Character from hand - "Play up to 1 red Character from your hand" (MUST BE BEFORE GENERAL PATTERNS)
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*(?:red|green|blue|purple|black|yellow)?\s*Character\s+(?:cards?\s+)?(?:other than\s+\[[^\]]+\]\s+)?(?:with\s+a\s+cost\s+of\s+\d+\s+)?from\s+(?:your\s+)?hand/i,
    actionType: EffectType.PLAY_FROM_HAND,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Play from zones (general patterns - must be after specific named patterns)
  {
    pattern: /[Pp]lay.*from.*hand/i,
    actionType: EffectType.PLAY_FROM_HAND
  },
  {
    pattern: /[Pp]lay.*from.*trash/i,
    actionType: EffectType.PLAY_FROM_TRASH
  },
  {
    pattern: /[Pp]lay.*(?:from.*deck|Character card)/i,
    actionType: EffectType.PLAY_FROM_DECK
  },

  // Look at / Search deck
  // IMPORTANT: SEARCH_AND_SELECT must come BEFORE LOOK_AT_TOP_DECK (more specific pattern first)
  // Search and select pattern: "Look at X cards...reveal up to Y...add to hand...trash the rest"
  {
    pattern: /[Ll]ook at (\d+) cards?.*reveal up to.*add.*to.*hand.*trash the rest/i,
    actionType: EffectType.SEARCH_AND_SELECT,
    extractValue: (m) => parseInt(m[1])
  },
  // Search and select variant: "Look at X cards...reveal up to Y...add to hand" (without explicit "trash the rest")
  {
    pattern: /[Ll]ook at (\d+) cards?\s+from\s+(?:the\s+)?top.*reveal up to.*add.*to.*hand/i,
    actionType: EffectType.SEARCH_AND_SELECT,
    extractValue: (m) => parseInt(m[1])
  },
  // Simple look at top deck (no selection)
  {
    pattern: /[Ll]ook at (\d+) cards?\s+from\s+(?:the\s+)?top/i,
    actionType: EffectType.LOOK_AT_TOP_DECK,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /[Rr]eveal.*add.*to.*hand/i,
    actionType: EffectType.SEARCH_DECK
  },

  // Life effects
  {
    pattern: /[Aa]dd\s+(\d+)\s+(?:cards?\s+)?(?:from.*)?(?:to\s+)?(?:your\s+)?[Ll]ife/i,
    actionType: EffectType.ADD_TO_LIFE,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /[Tt]rash\s+(\d+)\s+(?:cards?\s+)?from\s+(?:your\s+)?[Ll]ife/i,
    actionType: EffectType.TRASH_LIFE,
    extractValue: (m) => parseInt(m[1])
  },

  // Protection/Restriction effects
  {
    pattern: /cannot be K\.?O\.?'?d/i,
    actionType: EffectType.IMMUNE_KO
  },
  {
    pattern: /cannot attack/i,
    actionType: EffectType.CANT_ATTACK
  },
  {
    pattern: /cannot be blocked/i,
    actionType: EffectType.CANT_BE_BLOCKED
  },

  // Attack active characters - "[DON!! x1] This Character can also attack your opponent's active Characters"
  {
    pattern: /(?:can|also)\s+attack.*(?:your opponent'?s?\s*)?active\s+Characters?/i,
    actionType: EffectType.CAN_ATTACK_ACTIVE
  },

  // Add colored [Name] from trash - "Add up to 1 blue [Usopp] from your trash to your hand" (BEFORE GENERAL)
  {
    pattern: /[Aa]dd\s+(?:up to\s+)?(\d+)?\s*(?:red|green|blue|purple|black|yellow)?\s*\[[^\]]+\]\s+from\s+(?:your\s+)?trash\s+to\s+(?:your\s+)?hand/i,
    actionType: EffectType.DRAW_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  // Add from trash to hand - "Add up to 1 ... from your trash to your hand" (general)
  {
    pattern: /[Aa]dd\s+(?:up to\s+)?(\d+)?.*from\s+(?:your\s+)?trash\s+to\s+(?:your\s+)?hand/i,
    actionType: EffectType.DRAW_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Opponent discard - "Your opponent trashes X card(s) from their hand"
  {
    pattern: /(?:your\s+)?opponent\s+trashes?\s+(\d+)?\s*cards?\s+from\s+(?:their\s+)?hand/i,
    actionType: EffectType.OPPONENT_DISCARD,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Play this card - self-play effect (triggers strip brackets, so match simple text)
  {
    pattern: /^[Pp]lay this card\.?$/i,
    actionType: EffectType.PLAY_FROM_DECK  // Card plays itself from trigger
  },

  // Set power to 0 - "Set the power of ... to 0"
  {
    pattern: /[Ss]et\s+(?:the\s+)?power\s+(?:of\s+)?.*to\s+0/i,
    actionType: EffectType.SET_POWER_ZERO
  },

  // Set base power to specific value - "base power becomes 7000"
  {
    pattern: /base\s+power\s+becomes?\s+(\d+)/i,
    actionType: EffectType.SET_BASE_POWER,
    extractValue: (m) => parseInt(m[1])
  },

  // Set cost to 0 - "Set the cost of ... to 0"
  {
    pattern: /[Ss]et\s+(?:the\s+)?cost\s+(?:of\s+)?.*to\s+0/i,
    actionType: EffectType.REDUCE_COST,
    extractValue: () => 99  // Large value to effectively set to 0
  },

  // Transfer DON - "Give up to X of your currently given DON!! cards to Y"
  {
    pattern: /[Gg]ive.*(?:your\s+)?(?:currently\s+)?(?:given\s+)?DON!!\s*(?:cards?\s+)?to/i,
    actionType: EffectType.ATTACH_DON
  },

  // Play named card from hand - "Play up to 1 [CardName] from your hand"
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+from\s+(?:your\s+)?hand/i,
    actionType: EffectType.PLAY_FROM_HAND,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Play named card from trash - "Play up to 1 [CardName] from your trash"
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+from\s+(?:your\s+)?trash/i,
    actionType: EffectType.PLAY_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Look at Life cards - "Look at up to X card(s) from the top of your Life cards"
  {
    pattern: /[Ll]ook at\s+(?:up to\s+)?(\d+)?\s*cards?\s+from.*[Ll]ife/i,
    actionType: EffectType.LOOK_AT_LIFE,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Trash from Life - "trash X card from your Life" OR "Trash up to 1 of your opponent's Life cards"
  {
    pattern: /[Tt]rash\s+(?:up to\s+)?(\d+)?\s*cards?\s+from.*[Ll]ife/i,
    actionType: EffectType.TRASH_LIFE,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
  // Trash opponent's Life cards - "Trash up to 1 of your opponent's Life cards."
  {
    pattern: /[Tt]rash\s+(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?opponent'?s?\s+[Ll]ife\s+cards?/i,
    actionType: EffectType.TRASH_LIFE,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Freeze effects - "will not become active in your opponent's next Refresh Phase"
  {
    pattern: /will not (?:become|turn)\s+active\s+in\s+(?:your\s+)?(?:opponent'?s?\s+)?(?:next\s+)?Refresh Phase/i,
    actionType: EffectType.FREEZE
  },

  // Rest opponent's DON!! - "Rest up to 1 of your opponent's DON!! cards"
  {
    pattern: /[Rr]est\s+(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?opponent'?s?\s+DON!!/i,
    actionType: EffectType.REST_CHARACTER,  // Reuse REST_CHARACTER for DON
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Add named card from trash to hand - "Add up to 1 [Name] from your trash to your hand"
  {
    pattern: /[Aa]dd\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+from\s+(?:your\s+)?trash\s+to\s+(?:your\s+)?hand/i,
    actionType: EffectType.DRAW_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Reveal and add named card from deck - "Reveal up to 1 [Name] from your deck and add it to your hand"
  {
    pattern: /[Rr]eveal\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+from\s+(?:your\s+)?deck\s+and\s+add/i,
    actionType: EffectType.SEARCH_DECK,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Play named card with cost condition - "Play up to 1 [Name] with a cost of X or less from your hand"
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+from\s+(?:your\s+)?hand/i,
    actionType: EffectType.PLAY_FROM_HAND,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Play named card with cost condition from trash - "Play up to 1 [Name] with a cost of X or less from your trash"
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+from\s+(?:your\s+)?trash/i,
    actionType: EffectType.PLAY_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Play card from deck - "Play up to 1 [Name] from your deck"
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+from\s+(?:your\s+)?deck/i,
    actionType: EffectType.PLAY_FROM_DECK,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Opponent returns DON - "your opponent returns X DON!! card(s) from their field to their DON!! deck"
  {
    pattern: /opponent\s+returns?\s+(\d+)?\s*DON!!\s*cards?\s+from\s+their\s+field/i,
    actionType: EffectType.OPPONENT_RETURN_DON,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Cannot be removed by effects - "cannot be removed from the field by your opponent's effects"
  {
    pattern: /cannot be removed from the field by.*effects?/i,
    actionType: EffectType.IMMUNE_EFFECTS
  },

  // Opponent reveals hand cards - "your opponent reveals those cards"
  {
    pattern: /opponent\s+reveals?\s+(?:those\s+)?cards?/i,
    actionType: EffectType.REVEAL_HAND
  },

  // Add to Life face-up - "add to the top or bottom of the owner's Life cards face-up"
  {
    pattern: /add.*to\s+(?:the\s+)?(?:top|bottom).*(?:of\s+)?(?:the\s+)?(?:owner'?s?\s+)?Life\s+cards?\s+face-up/i,
    actionType: EffectType.ADD_TO_LIFE
  },

  // Return all cards in hand to deck - "Return all cards in your hand to your deck"
  {
    pattern: /[Rr]eturn\s+all\s+cards?\s+in\s+(?:your\s+)?hand\s+to\s+(?:your\s+)?deck/i,
    actionType: EffectType.SEND_TO_DECK_BOTTOM
  },

  // Trash cards from deck - "trash X cards from the top of your deck"
  {
    pattern: /[Tt]rash\s+(\d+)\s+cards?\s+from\s+(?:the\s+)?top\s+of\s+(?:your\s+)?deck/i,
    actionType: EffectType.MILL_DECK,
    extractValue: (m) => parseInt(m[1])
  },

  // Add colored card from trash - "Add up to 1 red Character card other than [Uta] from your trash"
  {
    pattern: /[Aa]dd\s+(?:up to\s+)?(\d+)?\s*(?:red|green|blue|purple|black|yellow)?\s*Character\s+cards?\s+(?:other than\s+\[[^\]]+\]\s+)?(?:with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+)?from\s+(?:your\s+)?trash/i,
    actionType: EffectType.DRAW_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Play colored card from hand - "Play up to 1 red Character other than [Name] with a cost of X from your hand"
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*(?:red|green|blue|purple|black|yellow)?\s*Character\s+(?:cards?\s+)?(?:other than\s+\[[^\]]+\]\s+)?(?:with\s+a\s+cost\s+of\s+\d+\s+)?from\s+(?:your\s+)?hand/i,
    actionType: EffectType.PLAY_FROM_HAND,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Trigger conditional play - "[Trigger] If your Leader has the {type} type, play this card"
  {
    pattern: /[Pp]lay\s+this\s+card/i,
    actionType: EffectType.PLAY_FROM_DECK
  },

  // Negate effect - "Negate the effect of up to 1 of your opponent's"
  {
    pattern: /[Nn]egate\s+(?:the\s+)?effects?\s+of/i,
    actionType: EffectType.SILENCE
  },

  // Return opponent's hand to deck - "opponent returns all cards in their hand to their deck"
  {
    pattern: /opponent\s+returns?\s+all\s+cards?\s+in\s+their\s+hand\s+to\s+their\s+deck/i,
    actionType: EffectType.SEND_TO_DECK_BOTTOM
  },

  // Trash from opponent's hand (Main) - "[Main] Trash 1 card from your opponent's hand"
  {
    pattern: /[Tt]rash\s+(\d+)?\s*cards?\s+from\s+(?:your\s+)?opponent'?s?\s+hand/i,
    actionType: EffectType.OPPONENT_DISCARD,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Add card from deck to life - "add up to 1 card from the top of your deck to the top of your Life"
  {
    pattern: /[Aa]dd\s+(?:up to\s+)?(\d+)?\s*cards?\s+from\s+(?:the\s+)?(?:top\s+of\s+)?(?:your\s+)?deck\s+to\s+(?:the\s+)?(?:top\s+of\s+)?(?:your\s+)?[Ll]ife/i,
    actionType: EffectType.ADD_TO_LIFE,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Attack characters on play turn - "can attack Characters on the turn in which they are played"
  {
    pattern: /can\s+attack\s+Characters?\s+on\s+the\s+turn\s+in\s+which\s+they\s+are\s+played/i,
    actionType: EffectType.GRANT_RUSH_VS_CHARACTERS
  },

  // Choose and play from trash - "Choose up to 1 Character card with a cost of X or less ... from your trash"
  {
    pattern: /[Cc]hoose\s+(?:up to\s+)?(\d+)?\s*Character\s+cards?\s+(?:with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+)?(?:and\s+up to\s+\d+\s+Character\s+cards?\s+(?:with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+)?)?from\s+(?:your\s+)?trash/i,
    actionType: EffectType.PLAY_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Return cards to bottom of deck - "return X cards from your trash to the bottom of your deck"
  {
    pattern: /[Rr]eturn\s+(\d+)?\s*cards?\s+from\s+(?:your\s+)?trash\s+to\s+(?:the\s+)?bottom\s+of\s+(?:your\s+)?deck/i,
    actionType: EffectType.SEND_TO_DECK_BOTTOM,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Add type card from trash - "Add up to 1 {Type} type card other than [Name] from your trash"
  {
    pattern: /[Aa]dd\s+(?:up to\s+)?(\d+)?\s*\{[^}]+\}\s+type\s+cards?\s+(?:other than\s+\[[^\]]+\]\s+)?from\s+(?:your\s+)?trash/i,
    actionType: EffectType.DRAW_FROM_TRASH,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Draw X cards then trash - "draw X cards, then trash X cards from your hand" (simplified)
  {
    pattern: /[Dd]raw\s+(\d+)\s+cards?,?\s+then\s+trash/i,
    actionType: EffectType.DRAW_CARDS,
    extractValue: (m) => parseInt(m[1])
  },

  // Play card from hand rested - "Play up to 1 [Name] from your hand rested"
  {
    pattern: /[Pp]lay\s+(?:up to\s+)?(\d+)?\s*\[[^\]]+\]\s+(?:with\s+a\s+cost\s+of\s+\d+\s+or\s+less\s+)?from\s+(?:your\s+)?hand\s+rested/i,
    actionType: EffectType.PLAY_FROM_HAND,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Trash by power - "Trash up to 1 of your opponent's Characters with X power or less"
  {
    pattern: /[Tt]rash\s+(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?opponent'?s?\s+Characters?\s+with\s+\d+\s*(?:000)?\s*power\s+or\s+less/i,
    actionType: EffectType.KO_POWER_OR_LESS,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Do not become active (broader) - "do not become active in your and your opponent's Refresh Phases"
  {
    pattern: /do\s+not\s+become\s+active\s+in\s+(?:your\s+)?(?:and\s+)?(?:your\s+)?opponent'?s?\s+Refresh\s+Phases?/i,
    actionType: EffectType.FREEZE
  },

  // Give DON to multiple characters - "Give up to X of your {type} Characters up to 1 rested DON!! card each"
  {
    pattern: /[Gg]ive\s+(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?\{[^}]+\}\s*(?:or\s+\{[^}]+\})?\s*(?:type\s+)?Characters?\s+(?:up to\s+)?(\d+)?\s*rested\s+DON!!/i,
    actionType: EffectType.ATTACH_DON,
    extractValue: (m) => m[2] ? parseInt(m[2]) : 1
  },

  // If would be K.O.'d replacement - "If your Character [Name] would be K.O.'d, you may trash this Character instead"
  {
    pattern: /[Ii]f\s+(?:your\s+)?(?:Character\s+)?\[[^\]]+\]\s+would\s+be\s+K\.?O\.?'?d/i,
    actionType: EffectType.PREVENT_KO
  },

  // If this Character would be K.O.'d - "If this Character would be K.O.'d by your opponent's effect"
  {
    pattern: /[Ii]f\s+this\s+Character\s+would\s+be\s+K\.?O\.?'?d/i,
    actionType: EffectType.PREVENT_KO
  },

  // If type Character would be K.O.'d - "If your {Type} type Character would be K.O.'d"
  {
    pattern: /[Ii]f\s+(?:your\s+)?(?:\{[^}]+\}\s+type\s+)?Character\s+(?:with\s+a\s+type\s+including\s+"[^"]+"\s+)?would\s+be\s+K\.?O\.?'?d/i,
    actionType: EffectType.PREVENT_KO
  },

  // If green/colored Character would be removed - "If you have a green Character that would be removed from the field"
  {
    pattern: /[Ii]f\s+(?:you\s+have\s+)?(?:a\s+)?(?:red|green|blue|purple|black|yellow)?\s*Character\s+(?:other\s+than\s+\[[^\]]+\]\s+)?(?:that\s+)?would\s+be\s+removed/i,
    actionType: EffectType.PREVENT_KO
  },

  // Rest up to X of opponent's Leader or Character - "Rest up to 1 of your opponent's Leader or Character cards"
  {
    pattern: /[Rr]est\s+(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?opponent'?s?\s+(?:Leader\s+or\s+)?Characters?\s*(?:cards?)?/i,
    actionType: EffectType.REST_CHARACTER,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Rest up to X of opponent's cards - "Rest up to 2 of your opponent's cards"
  {
    pattern: /[Rr]est\s+(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?opponent'?s?\s+cards/i,
    actionType: EffectType.REST_CHARACTER,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Cannot be K.O.'d until - "none of your {Type} Characters can be K.O.'d by effects until"
  {
    pattern: /(?:none\s+of\s+your|cannot\s+be)\s+.*?(?:can'?t?\s+be\s+)?K\.?O\.?'?d\s+(?:by\s+effects?\s+)?until/i,
    actionType: EffectType.IMMUNE_KO_UNTIL
  },

  // Cannot be rested until - "cannot be rested until the end of"
  {
    pattern: /cannot\s+be\s+rested\s+until/i,
    actionType: EffectType.CANT_BE_RESTED
  },

  // Swap power - "Swap the base power of the selected Characters with each other"
  {
    pattern: /[Ss]wap\s+(?:the\s+)?(?:base\s+)?power\s+(?:of\s+)?(?:the\s+)?(?:selected\s+)?Characters?/i,
    actionType: EffectType.SWAP_POWER
  },

  // Change attack target - "Change the attack target to the selected card"
  {
    pattern: /[Cc]hange\s+(?:the\s+)?attack\s+target\s+to/i,
    actionType: EffectType.REDIRECT_ATTACK
  },

  // Look at all Life cards - "Look at all of your Life cards"
  {
    pattern: /[Ll]ook\s+at\s+all\s+(?:of\s+)?(?:your\s+)?Life\s+cards/i,
    actionType: EffectType.REORDER_LIFE
  },

  // Opponent rests DON - "your opponent rests X of their active DON!! cards"
  {
    pattern: /opponent\s+rests?\s+(\d+)?\s*(?:of\s+)?(?:their\s+)?(?:active\s+)?DON!!/i,
    actionType: EffectType.REST_DON,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Cannot add Life to hand - "you cannot add Life cards to your hand"
  {
    pattern: /cannot\s+add\s+Life\s+cards?\s+to\s+(?:your\s+)?hand/i,
    actionType: EffectType.PREVENT_LIFE_ADD
  },

  // Can attack Characters on play turn (conditional Rush) - "this Character can attack Characters on the turn"
  {
    pattern: /this\s+Character\s+can\s+attack\s+Characters?\s+on\s+the\s+turn\s+in\s+which\s+it\s+is\s+played/i,
    actionType: EffectType.GRANT_RUSH_VS_CHARACTERS
  },

  // Give Leader or Character DON - "Give this Leader or 1 of your Characters up to 1 rested DON!!"
  {
    pattern: /[Gg]ive\s+(?:this\s+Leader\s+or\s+)?(?:up to\s+)?(\d+)?\s*(?:of\s+)?(?:your\s+)?Characters?\s+(?:up to\s+)?(\d+)?\s*rested\s+DON!!/i,
    actionType: EffectType.ATTACH_DON,
    extractValue: (m) => m[2] ? parseInt(m[2]) : 1
  },

  // Draw cards equal to number trashed - "draw cards equal to the number of cards trashed"
  {
    pattern: /[Dd]raw\s+cards?\s+equal\s+to\s+(?:the\s+)?number\s+(?:of\s+)?cards?\s+trashed/i,
    actionType: EffectType.DRAW_CARDS
  },

  // K.O. all Characters - "K.O. all Characters other than this" or "K.O. all of your opponent's Characters"
  {
    pattern: /K\.?O\.?\s+all\s+(?:of\s+)?(?:your\s+)?(?:opponent'?s?\s+)?Characters?/i,
    actionType: EffectType.KO_CHARACTER
  },

  // Reveal from top of deck - "Reveal 1 card from the top of your deck"
  {
    pattern: /[Rr]eveal\s+(\d+)?\s*cards?\s+from\s+(?:the\s+)?top\s+of\s+(?:your\s+)?deck/i,
    actionType: EffectType.LOOK_AT_TOP_DECK,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Reveal from Life - "Reveal 1 card from the top of your Life cards"
  {
    pattern: /[Rr]eveal\s+(\d+)?\s*cards?\s+from\s+(?:the\s+)?(?:top\s+of\s+)?(?:your\s+)?Life/i,
    actionType: EffectType.LOOK_AT_LIFE,
    extractValue: (m) => m[1] ? parseInt(m[1]) : 1
  },
];

// ============================================
// TARGET PATTERNS
// ============================================

interface TargetPattern {
  pattern: RegExp;
  targetType: TargetType;
  extractCount?: (match: RegExpMatchArray) => { count?: number; maxCount?: number };
}

export const TARGET_PATTERNS: TargetPattern[] = [
  // Self reference
  {
    pattern: /this Character/i,
    targetType: TargetType.SELF,
    extractCount: () => ({ count: 1 })
  },
  {
    pattern: /this Leader/i,
    targetType: TargetType.SELF,
    extractCount: () => ({ count: 1 })
  },

  // Your targets
  {
    pattern: /(?:up to )?(\d+)?\s*(?:of )?your (?:Leader or )?Characters?/i,
    targetType: TargetType.YOUR_CHARACTER,
    extractCount: (m) => ({ maxCount: m[1] ? parseInt(m[1]) : 1 })
  },
  {
    pattern: /your Leader/i,
    targetType: TargetType.YOUR_LEADER,
    extractCount: () => ({ count: 1 })
  },
  {
    pattern: /your Leader or (?:\d+ of your )?Characters?/i,
    targetType: TargetType.YOUR_LEADER_OR_CHARACTER
  },

  // Opponent targets
  {
    pattern: /(?:up to )?(?:a total of )?(\d+)?\s*(?:of )?your opponent'?s?\s*(?:Leader or )?Characters?/i,
    targetType: TargetType.OPPONENT_CHARACTER,
    extractCount: (m) => ({ maxCount: m[1] ? parseInt(m[1]) : 1 })
  },
  {
    pattern: /your opponent'?s?\s*Leader/i,
    targetType: TargetType.OPPONENT_LEADER,
    extractCount: () => ({ count: 1 })
  },
  {
    pattern: /your opponent'?s?\s*(?:Leader or )?Character/i,
    targetType: TargetType.OPPONENT_LEADER_OR_CHARACTER
  },

  // Combined targets
  {
    pattern: /(?:your )?(?:Leader or )?Character cards?/i,
    targetType: TargetType.YOUR_LEADER_OR_CHARACTER
  },

  // Zone targets
  {
    pattern: /from your hand/i,
    targetType: TargetType.YOUR_HAND
  },
  {
    pattern: /from your trash/i,
    targetType: TargetType.YOUR_TRASH
  },
  {
    pattern: /from (?:the top of )?your deck/i,
    targetType: TargetType.YOUR_DECK
  },

  // DON targets
  {
    pattern: /(?:your )?(?:rested )?DON!!\s*cards?/i,
    targetType: TargetType.YOUR_DON
  },
  {
    pattern: /your opponent'?s?\s*DON!!/i,
    targetType: TargetType.OPPONENT_DON
  },

  // Stage targets
  {
    pattern: /(?:up to )?(\d+)?\s*(?:of )?your opponent'?s?\s*Stages?/i,
    targetType: TargetType.OPPONENT_STAGE,
    extractCount: (m) => ({ maxCount: m[1] ? parseInt(m[1]) : 1 })
  },
  {
    pattern: /(?:your )?Stage/i,
    targetType: TargetType.YOUR_STAGE,
    extractCount: () => ({ count: 1 })
  },
];

// ============================================
// FILTER PATTERNS
// ============================================

interface FilterPattern {
  pattern: RegExp;
  buildFilter: (match: RegExpMatchArray) => ParsedFilter;
}

export const FILTER_PATTERNS: FilterPattern[] = [
  // Cost filters
  {
    pattern: /(?:with )?(?:a )?cost of (\d+) or less/i,
    buildFilter: (m) => ({ property: 'COST', operator: 'OR_LESS', value: parseInt(m[1]) })
  },
  {
    pattern: /(?:with )?(?:a )?cost of (\d+) or more/i,
    buildFilter: (m) => ({ property: 'COST', operator: 'OR_MORE', value: parseInt(m[1]) })
  },
  {
    pattern: /(?:with )?(?:a )?cost of (\d+)(?!\s*or)/i,
    buildFilter: (m) => ({ property: 'COST', operator: 'EQUALS', value: parseInt(m[1]) })
  },

  // Power filters
  {
    pattern: /(?:with )?(\d+)\s*(?:base )?power or less/i,
    buildFilter: (m) => ({ property: 'POWER', operator: 'OR_LESS', value: parseInt(m[1]) })
  },
  {
    pattern: /(?:with )?(\d+)\s*base power or less/i,
    buildFilter: (m) => ({ property: 'BASE_POWER', operator: 'OR_LESS', value: parseInt(m[1]) })
  },
  {
    pattern: /(?:with )?(\d+)\s*(?:base )?power or more/i,
    buildFilter: (m) => ({ property: 'POWER', operator: 'OR_MORE', value: parseInt(m[1]) })
  },

  // Trait filters - {Type} type
  {
    pattern: /\{([^}]+)\}\s*type/i,
    buildFilter: (m) => ({ property: 'TRAIT', operator: 'CONTAINS', value: [m[1]] })
  },

  // Name filters - [Card Name]
  {
    pattern: /other than \[([^\]]+)\]/i,
    buildFilter: (m) => ({ property: 'NAME', operator: 'NOT', value: m[1] })
  },

  // State filters
  {
    pattern: /rested Characters?/i,
    buildFilter: () => ({ property: 'STATE', operator: 'EQUALS', value: 'RESTED' })
  },
  {
    pattern: /active Characters?/i,
    buildFilter: () => ({ property: 'STATE', operator: 'EQUALS', value: 'ACTIVE' })
  },
];

// ============================================
// DURATION PATTERNS
// ============================================

interface DurationPattern {
  pattern: RegExp;
  duration: EffectDuration;
}

export const DURATION_PATTERNS: DurationPattern[] = [
  { pattern: /during this battle/i, duration: EffectDuration.UNTIL_END_OF_BATTLE },
  { pattern: /during this turn/i, duration: EffectDuration.UNTIL_END_OF_TURN },
  { pattern: /until the end of this turn/i, duration: EffectDuration.UNTIL_END_OF_TURN },
  { pattern: /until the end of.*opponent'?s?\s*(?:next\s+)?turn/i, duration: EffectDuration.UNTIL_END_OF_OPPONENT_TURN },
  { pattern: /until the start of your next turn/i, duration: EffectDuration.UNTIL_START_OF_YOUR_TURN },
];

// ============================================
// CONDITION PATTERNS
// ============================================

interface ConditionPattern {
  pattern: RegExp;
  conditionType: ConditionType;
  extractValue?: (match: RegExpMatchArray) => number | string[] | undefined;
  extractLeaderName?: (match: RegExpMatchArray) => string | undefined;
  isOpponent?: boolean;
}

export const CONDITION_PATTERNS: ConditionPattern[] = [
  // DON!! x requirements (card must have X DON attached)
  {
    pattern: /\[DON!!\s*[x×]\s*(\d+)\]/i,
    conditionType: ConditionType.DON_ATTACHED_OR_MORE,
    extractValue: (m) => parseInt(m[1])
  },

  // Life conditions
  {
    pattern: /(?:you have|if you have)\s*(\d+)\s*or\s*(?:less|fewer)\s*[Ll]ife/i,
    conditionType: ConditionType.LIFE_COUNT_OR_LESS,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /(?:you have|if you have)\s*(\d+)\s*or\s*more\s*[Ll]ife/i,
    conditionType: ConditionType.LIFE_COUNT_OR_MORE,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /(?:your )?opponent\s*has\s*(\d+)\s*or\s*(?:less|fewer)\s*[Ll]ife/i,
    conditionType: ConditionType.LIFE_COUNT_OR_LESS,
    extractValue: (m) => parseInt(m[1]),
    isOpponent: true
  },

  // DON conditions
  {
    pattern: /(\d+)\s*or\s*more\s*DON!!/i,
    conditionType: ConditionType.DON_COUNT_OR_MORE,
    extractValue: (m) => parseInt(m[1])
  },

  // Leader conditions
  {
    pattern: /(?:your )?[Ll]eader has (?:the )?\{([^}]+)\}\s*type/i,
    conditionType: ConditionType.LEADER_HAS_TRAIT,
    extractValue: (m) => [m[1]]
  },
  // "If your Leader is [Name]" pattern - matches [Imu], [Luffy], etc.
  {
    pattern: /(?:if\s+)?(?:your\s+)?[Ll]eader\s+is\s+\[([^\]]+)\]/i,
    conditionType: ConditionType.LEADER_IS,
    extractLeaderName: (m) => m[1]
  },

  // Character count conditions
  {
    pattern: /(?:you have|if you have)\s*(\d+)\s*or\s*more\s*Characters?/i,
    conditionType: ConditionType.CHARACTER_COUNT_OR_MORE,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /(?:you have|if you have)\s*(\d+)\s*or\s*(?:less|fewer)\s*Characters?/i,
    conditionType: ConditionType.CHARACTER_COUNT_OR_LESS,
    extractValue: (m) => parseInt(m[1])
  },

  // Hand conditions
  {
    pattern: /(?:you have|if you have)\s*(\d+)\s*or\s*(?:less|fewer).*in.*hand/i,
    conditionType: ConditionType.HAND_COUNT_OR_LESS,
    extractValue: (m) => parseInt(m[1])
  },
  {
    pattern: /(?:you have|if you have)\s*(\d+)\s*or\s*more.*in.*hand/i,
    conditionType: ConditionType.HAND_COUNT_OR_MORE,
    extractValue: (m) => parseInt(m[1])
  },

  // Turn conditions
  {
    pattern: /your turn/i,
    conditionType: ConditionType.YOUR_TURN
  },
  {
    pattern: /opponent'?s?\s*turn/i,
    conditionType: ConditionType.OPPONENT_TURN
  },
];

// ============================================
// COST PATTERNS
// ============================================

interface CostPattern {
  pattern: RegExp;
  costType: 'DON' | 'DON_MINUS' | 'TRASH_CARD' | 'REST_DON' | 'REST_THIS' | 'LIFE' | 'TRASH_FROM_HAND';
  extractCount?: (match: RegExpMatchArray) => number;
}

export const COST_PATTERNS: CostPattern[] = [
  // DON costs
  {
    pattern: /DON!!\s*[−\-]\s*(\d+)/i,
    costType: 'DON_MINUS',
    extractCount: (m) => parseInt(m[1])
  },
  {
    pattern: /[Rr]est\s*(\d+)?\s*(?:of\s+your\s+)?DON!!/i,
    costType: 'REST_DON',
    extractCount: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Trash costs - complex "or" pattern: "trash X ... Characters or X card from hand"
  // Must come BEFORE simple pattern
  {
    pattern: /[Tt]rash\s*(\d+)?\s*(?:of\s+your\s+)?(?:\{[^}]+\}\s*type\s+)?Characters?\s+or\s+(\d+)?\s*cards?\s*from\s*(?:your\s*)?hand/i,
    costType: 'TRASH_FROM_HAND',
    extractCount: (m) => m[1] ? parseInt(m[1]) : 1
  },
  // Trash costs - simple pattern
  {
    pattern: /[Tt]rash\s*(\d+)?\s*cards?\s*from\s*(?:your\s*)?hand/i,
    costType: 'TRASH_FROM_HAND',
    extractCount: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Life costs
  {
    pattern: /[Tt]ake\s*(\d+)?\s*damage/i,
    costType: 'LIFE',
    extractCount: (m) => m[1] ? parseInt(m[1]) : 1
  },

  // Rest this card cost
  {
    pattern: /[Rr]est\s+this\s+(?:Character|card)/i,
    costType: 'REST_THIS',
    extractCount: () => 1
  },

  // Rest this card and named card - "rest this card and 1 of your [Name] cards"
  {
    pattern: /[Rr]est\s+this\s+card\s+and\s+(\d+)?\s*(?:of\s+your\s+)?\[[^\]]+\]/i,
    costType: 'REST_THIS',
    extractCount: (m) => m[1] ? parseInt(m[1]) + 1 : 2
  },

  // DON cost area - "➀ (rest DON in cost area)"
  {
    pattern: /➀|➁|➂|➃|➄|➅|➆|➇|➈|➉/,
    costType: 'REST_DON',
    extractCount: (m) => {
      const char = m[0];
      const map: Record<string, number> = {'➀':1,'➁':2,'➂':3,'➃':4,'➄':5,'➅':6,'➆':7,'➇':8,'➈':9,'➉':10};
      return map[char] || 1;
    }
  },
];

// Pattern to detect optional cost prefix ("You may")
export const OPTIONAL_COST_PATTERN = /You\s+may\s+/i;

// ============================================
// HELPER FUNCTIONS
// ============================================

export function extractTriggers(text: string): ParsedTrigger[] {
  const triggers: ParsedTrigger[] = [];

  for (const { pattern, trigger, extractValue } of TRIGGER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      triggers.push({
        type: trigger,
        value: extractValue?.(match)
      });
    }
  }

  return triggers;
}

export function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  for (const { pattern, keyword } of KEYWORD_PATTERNS) {
    if (pattern.test(text)) {
      keywords.push(keyword);
    }
  }

  return keywords;
}

export function extractAction(text: string): ParsedAction | null {
  for (const { pattern, actionType, extractValue, extractKeyword } of ACTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        type: actionType,
        value: extractValue?.(match),
        keyword: extractKeyword?.(match),
      };
    }
  }
  return null;
}

export function extractTarget(text: string): ParsedTarget | null {
  for (const { pattern, targetType, extractCount } of TARGET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const counts = extractCount?.(match) ?? {};
      return {
        type: targetType,
        count: counts.count,
        maxCount: counts.maxCount,
        optional: /up to/i.test(text),
        filters: extractFilters(text)
      };
    }
  }
  return null;
}

export function extractFilters(text: string): ParsedFilter[] {
  const filters: ParsedFilter[] = [];

  for (const { pattern, buildFilter } of FILTER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      filters.push(buildFilter(match));
    }
  }

  return filters;
}

export function extractDuration(text: string): EffectDuration {
  for (const { pattern, duration } of DURATION_PATTERNS) {
    if (pattern.test(text)) {
      return duration;
    }
  }
  return EffectDuration.INSTANT;
}

export function extractConditions(text: string): ParsedCondition[] {
  const conditions: ParsedCondition[] = [];

  // First check for "If" clauses
  const ifMatch = text.match(/If\s+([^,:.]+)/i);
  const conditionText = ifMatch ? ifMatch[1] : text;

  for (const { pattern, conditionType, extractValue, extractLeaderName } of CONDITION_PATTERNS) {
    const match = conditionText.match(pattern);
    if (match) {
      const value = extractValue?.(match);
      const leaderName = extractLeaderName?.(match);
      conditions.push({
        type: conditionType,
        value: typeof value === 'number' ? value : undefined,
        traits: Array.isArray(value) ? value : undefined,
        leaderName: leaderName,
        negated: /\bnot\b/i.test(conditionText)
      });
    }
  }

  return conditions;
}

export function extractCosts(text: string): ParsedCost[] {
  const costs: ParsedCost[] = [];

  // Check if the cost section has "You may" prefix (optional cost)
  const isOptionalCost = OPTIONAL_COST_PATTERN.test(text);

  for (const { pattern, costType, extractCount } of COST_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      costs.push({
        type: costType,
        count: extractCount?.(match) ?? 1,
        optional: isOptionalCost
      });
    }
  }

  return costs;
}

export function isOncePerTurn(text: string): boolean {
  return /\[Once Per Turn\]/i.test(text);
}

export function isOptional(text: string): boolean {
  return /\bYou may\b/i.test(text);
}

// ============================================
// SEARCH AND SELECT PATTERN EXTRACTION
// ============================================

export interface SearchAndSelectDetails {
  lookCount: number;        // Number of cards to look at
  maxSelections: number;    // Max cards to select (e.g., 1 for "up to 1")
  traitFilter?: string;     // Required trait (e.g., "Celestial Dragons")
  excludeNames?: string[];  // Names to exclude (e.g., "The Five Elders Are at Your Service!!!")
  selectAction: 'ADD_TO_HAND' | 'PLAY_TO_FIELD' | 'ADD_TO_LIFE';
  remainderAction: 'TRASH' | 'DECK_BOTTOM' | 'SHUFFLE_INTO_DECK';
}

export function extractSearchAndSelectDetails(text: string): SearchAndSelectDetails | null {
  // Check if this is a search and select pattern
  const lookMatch = text.match(/[Ll]ook at (\d+) cards?\s+from\s+(?:the\s+)?top/i);
  if (!lookMatch) return null;

  const lookCount = parseInt(lookMatch[1]);

  // Extract max selections: "reveal up to 1", "reveal 1", etc.
  const selectMatch = text.match(/reveal\s+(?:up to\s+)?(\d+)/i);
  const maxSelections = selectMatch ? parseInt(selectMatch[1]) : 1;

  // Extract trait filter: "{Celestial Dragons} type"
  const traitMatch = text.match(/\{([^}]+)\}\s*type/i);
  const traitFilter = traitMatch ? traitMatch[1] : undefined;

  // Extract excluded names: "other than [Card Name]"
  const excludeMatch = text.match(/other than \[([^\]]+)\]/i);
  const excludeNames = excludeMatch ? [excludeMatch[1]] : undefined;

  // Determine select action
  let selectAction: 'ADD_TO_HAND' | 'PLAY_TO_FIELD' | 'ADD_TO_LIFE' = 'ADD_TO_HAND';
  if (/add.*to.*life/i.test(text)) {
    selectAction = 'ADD_TO_LIFE';
  } else if (/(?:play it|play (?:that|the|this) card|play (?:it )?(?:to|on|onto)(?: the)? field)/i.test(text)) {
    // Only match "play" when it refers to playing the selected card, not "[On Play]" trigger
    selectAction = 'PLAY_TO_FIELD';
  }

  // Determine remainder action
  let remainderAction: 'TRASH' | 'DECK_BOTTOM' | 'SHUFFLE_INTO_DECK' = 'TRASH';
  if (/(?:place|put).*(?:bottom|deck)/i.test(text) && !/trash/i.test(text)) {
    remainderAction = 'DECK_BOTTOM';
  } else if (/shuffle.*deck/i.test(text)) {
    remainderAction = 'SHUFFLE_INTO_DECK';
  }

  return {
    lookCount,
    maxSelections,
    traitFilter,
    excludeNames,
    selectAction,
    remainderAction
  };
}
