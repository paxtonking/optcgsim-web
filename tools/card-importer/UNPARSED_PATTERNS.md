# Unparsed Effect Patterns

Generated: 2026-01-26

**Summary**: 193 cards out of 1937 (10%) have effect text that the parser doesn't handle.

## Priority Categories (by card count)

### 1. Cost Reduction on Opponent's Characters (~40+ cards)
Pattern: `Give up to X of your opponent's Characters −N cost during this turn`

Examples:
- ST06-010: `[On Play] Give up to 1 of your opponent's Characters −3 cost during this turn.`
- OP02-103: `[DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters −2 cost during this turn.`

**EffectType needed**: `DEBUFF_COST` (similar to DEBUFF_POWER but for cost)

---

### 2. [Trigger] Play This Card (~20+ cards)
Pattern: `[Trigger] Play this card.` or `[Trigger] ...condition...: Play this card.`

Examples:
- OP01-009: `[Trigger] Play this card.`
- EB02-055: `[Trigger] If your Leader has the {Fish-Man} type, play this card.`

**EffectType needed**: `PLAY_SELF` with `EffectTrigger.TRIGGER`

---

### 3. Add From Trash to Hand (~15+ cards)
Pattern: `Add up to X ... from your trash to your hand`

Examples:
- OP01-005: `[On Play] Add up to 1 red Character card with a cost of 3 or less from your trash to your hand.`
- OP11-085: `[On Play] Add up to 1 {SMILE} type card with a cost of 5 or less from your trash to your hand.`

**EffectType needed**: `RETURN_FROM_TRASH` (already exists as stub: `DRAW_FROM_TRASH`)

---

### 4. DON!! Threshold Effects (~15+ cards)
Pattern: `[DON!! xN] effect`

Examples:
- OP01-021: `[DON!! x1] This Character can also attack your opponent's active Characters.`
- OP02-014: `[DON!! x1] This Character can also attack your opponent's active Characters.`

**Trigger needed**: `DON_X` (already in IMPLEMENTED_TRIGGERS, but parsing may be broken)
**EffectType needed**: `CAN_ATTACK_ACTIVE`

---

### 5. DON!! Return Cost (~15+ cards)
Pattern: `DON!! −X (You may return...)` as a cost

Examples:
- OP01-094: `[On Play] DON!! −6 : If your Leader has the {Animal Kingdom Pirates} type, K.O. all Characters.`
- OP02-075: `[Trigger] DON!! −1 : Play this card.`

**Cost type needed**: `RETURN_DON`

---

### 6. Play Named Card (~15+ cards)
Pattern: `Play up to 1 [CardName] from your hand/deck/trash`

Examples:
- EB02-014: `[On Play] Play up to 1 [Gaimon] from your hand.`
- OP01-069: `[On K.O.] Play up to 1 [Smiley] from your deck, then shuffle your deck.`

**EffectType needed**: `PLAY_NAMED_CARD` with `cardName` filter

---

### 7. Life Card Manipulation (~12+ cards)
Patterns:
- `Add X card from the top of your deck to the top of your Life cards`
- `Trash X card from the top of your opponent's Life cards`
- `Look at up to 1 card from the top of your Life cards`

Examples:
- OP03-114: `add up to 1 card from the top of your deck to the top of your Life cards`
- OP03-120: `trash up to 1 card from the top of your opponent's Life cards`

**EffectTypes needed**: `ADD_TO_LIFE`, `TRASH_LIFE`, `LOOK_AT_LIFE` (already stubs)

---

### 8. Set Power/Cost to Zero (~8+ cards)
Pattern: `Set the power/cost of up to X Characters to 0`

Examples:
- OP07-002: `[On Play] Set the power of up to 1 of your opponent's Characters to 0 during this turn.`
- OP03-091: `[On Play] Set the cost of up to 1 of your opponent's Characters to 0 during this turn.`

**EffectType**: `SET_POWER_ZERO` (already implemented), need `SET_COST_ZERO`

---

### 9. Opponent Discard/Trash (~8+ cards)
Pattern: `Your opponent trashes X card from their hand`

Examples:
- OP07-090: `[On Play] Your opponent trashes 1 card from their hand`
- OP12-085: `your opponent trashes 1 card from their hand`

**EffectType needed**: `OPPONENT_DISCARD` (already a stub)

---

### 10. Freeze / Prevent Untap (~5+ cards)
Pattern: `will not become active in opponent's next Refresh Phase`

Examples:
- OP04-031: `Up to 3 of your opponent's rested cards will not become active in opponent's next Refresh Phase.`
- OP05-040: `all Characters with a cost of 5 or less do not become active in Refresh Phases`

**EffectType**: `FREEZE` (already implemented, but parsing may be broken)

---

### 11. Protection Effects (~5+ cards)
Pattern: `cannot be removed from the field by your opponent's effects`

Examples:
- OP02-027: `this Character cannot be removed from the field by your opponent's effects`

**EffectType needed**: `IMMUNE_REMOVAL` or enhance `IMMUNE_EFFECTS`

---

### 12. Rest Opponent's DON (~5+ cards)
Pattern: `Rest up to X of your opponent's DON!! cards`

Examples:
- OP04-021: `Rest up to 1 of your opponent's DON!! cards.`
- OP06-020: `Rest up to 1 of your opponent's DON!! cards or Characters`

**EffectType needed**: `REST_OPPONENT_DON`

---

### 13. Return Opponent's DON (~3+ cards)
Pattern: `Your opponent returns X DON!! cards from their field to their DON!! deck`

Examples:
- OP02-085: `Your opponent returns 1 DON!! card from their field to their DON!! deck.`

**EffectType needed**: `OPPONENT_RETURN_DON` (already a stub)

---

### 14. Give DON to Character (~3+ cards)
Pattern: `Give up to X of your currently given DON!! cards to Y`

Examples:
- OP07-001: `Give up to 2 total of your currently given DON!! cards to 1 of your Characters.`
- EB02-009: `Give up to 1 of your currently given DON!! cards to 1 of your Characters.`

**EffectType needed**: `TRANSFER_DON`

---

### 15. Win Condition / Alternative Win (~1 card)
Pattern: `When your deck is reduced to 0, you win the game`

Examples:
- OP03-040: `When your deck is reduced to 0, you win the game instead of losing`

**EffectType**: `WIN_GAME` (already a stub) with special trigger

---

## Implementation Priority

| Priority | Pattern | Est. Cards | Complexity |
|----------|---------|-----------|------------|
| HIGH | Cost Reduction (DEBUFF_COST) | 40+ | Medium |
| HIGH | [Trigger] Play Self | 20+ | Low |
| HIGH | Add from Trash to Hand | 15+ | Medium |
| HIGH | DON!! xN Threshold (fix parsing) | 15+ | Low |
| MEDIUM | DON!! Return Cost | 15+ | Medium |
| MEDIUM | Play Named Card | 15+ | Medium |
| MEDIUM | Life Card Manipulation | 12+ | High |
| MEDIUM | Set Cost to Zero | 8+ | Low |
| MEDIUM | Opponent Discard | 8+ | Low |
| LOW | Freeze / Prevent Untap (fix) | 5+ | Low |
| LOW | Protection / Immunity | 5+ | Medium |
| LOW | Rest Opponent DON | 5+ | Low |
| LOW | Return Opponent DON | 3+ | Low |
| LOW | Transfer DON | 3+ | Medium |
| LOW | Alternative Win | 1 | High |

---

## Verified No-Effect Cards

The following card patterns legitimately have no actionable effects:
- Keywords only (Rush, Blocker) - handled separately
- Counter only (+2000 Counter) - handled separately
- Basic Trigger (Add this card to hand) - simple trigger handled separately

These don't need parser attention.
