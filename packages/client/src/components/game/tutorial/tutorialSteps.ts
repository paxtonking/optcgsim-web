import type { TutorialPhase } from '../../../stores/tutorialStore';

export interface TutorialStep {
  id: string;
  phase: TutorialPhase;
  /** CSS selector for the element to spotlight, or null for center-screen messages */
  highlightTarget: string | null;
  /** Instruction text shown in the speech bubble */
  message: string;
  /** The action the player must take to advance. null = use Next button or autoAdvance */
  requiredAction: {
    type: string;
    cardId?: string;
    targetId?: string;
    targetType?: 'leader' | 'character';
  } | null;
  /** Where to position the speech bubble relative to the highlight */
  bubblePosition: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Show a "Next" button instead of requiring a game action */
  hasNextButton?: boolean;
  /** Auto-advance after this many ms (for watching AI turns) */
  autoAdvanceDelay?: number;
  /** If true, advance is triggered by detecting a game state change, not a click */
  waitForState?: boolean;
  /** If true, allow normal gameplay interactions during this step */
  allowFreePlay?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  // ========== MULLIGAN ==========
  {
    id: 'mulligan-welcome',
    phase: 'MULLIGAN',
    highlightTarget: null,
    message: "Welcome to the One Piece Card Game! This tutorial will teach you the basics over 3 turns. Let's start by looking at your hand.",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 'mulligan-explain',
    phase: 'MULLIGAN',
    highlightTarget: null,
    message: "You drew 5 cards. In a normal game you could mulligan (redraw) once if you don't like your hand. For now, let's keep these cards.",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 'mulligan-keep',
    phase: 'MULLIGAN',
    highlightTarget: '.action-btn--keep',
    message: 'Click "Keep Hand" to keep your starting cards.',
    requiredAction: { type: 'KEEP_HAND' },
    bubblePosition: 'left',
  },

  // ========== TURN 1 ==========
  {
    id: 't1-intro',
    phase: 'TURN_1',
    highlightTarget: null,
    message: "Turn 1! As the first player, you get 1 DON!! card. DON is your resource — you spend it to play cards and attach it to characters for +1000 power each. You also skip the draw phase on your very first turn.",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 't1-show-don',
    phase: 'TURN_1',
    highlightTarget: '[data-zone="don-field"]',
    message: "See your 1 DON!! card in the cost area. Let's use it to play a character.",
    requiredAction: null,
    bubblePosition: 'top',
    hasNextButton: true,
  },
  {
    id: 't1-play-nami',
    phase: 'TURN_1',
    highlightTarget: '[data-card-code="ST01-007"]',
    message: "Play Nami! She costs 1 DON. Click on her in your hand.",
    requiredAction: { type: 'PLAY_CARD', cardId: 'ST01-007' },
    bubblePosition: 'top',
  },
  {
    id: 't1-explain-sickness',
    phase: 'TURN_1',
    highlightTarget: null,
    message: "Nami is on the field! Characters can't attack the turn they're played — this is called \"summoning sickness\" — unless they have the Rush keyword. Since you used your only DON, let's end the turn.",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 't1-end-turn',
    phase: 'TURN_1',
    highlightTarget: '.action-btn--end',
    message: 'Click "End Turn" to pass to your opponent.',
    requiredAction: { type: 'END_TURN' },
    bubblePosition: 'left',
  },
  {
    id: 't1-ai-turn',
    phase: 'TURN_1',
    highlightTarget: null,
    message: "Now it's your opponent's turn. Watch what they do...",
    requiredAction: null,
    bubblePosition: 'center',
    waitForState: true,
  },

  // ========== TURN 2 ==========
  {
    id: 't2-intro',
    phase: 'TURN_2',
    highlightTarget: null,
    message: "Turn 2! You drew a card and received 2 more DON!! cards (3 total). This turn you'll learn about attaching DON and attacking!",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 't2-select-don',
    phase: 'TURN_2',
    highlightTarget: '[data-zone="don-field"]',
    message: "First, let's power up your Leader. Click on a DON!! card in your cost area to select it.",
    requiredAction: { type: 'SELECT_DON' },
    bubblePosition: 'top',
  },
  {
    id: 't2-attach-don',
    phase: 'TURN_2',
    highlightTarget: '[data-zone="leader"]',
    message: "Now click on your Leader (Luffy) to attach the DON!! This gives Luffy +1000 power (5000 → 6000) for this turn!",
    requiredAction: { type: 'ATTACH_DON' },
    bubblePosition: 'top',
  },
  {
    id: 't2-play-karoo',
    phase: 'TURN_2',
    highlightTarget: '[data-card-code="ST01-003"]',
    message: "You still have 2 DON left. Play Karoo (cost 1) — click on him in your hand.",
    requiredAction: { type: 'PLAY_CARD', cardId: 'ST01-003' },
    bubblePosition: 'top',
  },
  {
    id: 't2-attack-explain',
    phase: 'TURN_2',
    highlightTarget: null,
    message: "Now let's attack! Your Leader can attack the opponent's Leader. Your Luffy has 6000 power (5000 + 1000 from DON) vs the opponent's 5000. If attacker power ≥ defender power, the attack hits!",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 't2-declare-attack',
    phase: 'TURN_2',
    highlightTarget: '[data-zone="leader"]',
    message: "Click on your Leader to attack with him! Then select the opponent's Leader as the target.",
    requiredAction: { type: 'DECLARE_ATTACK', cardId: 'ST01-001', targetType: 'leader' },
    bubblePosition: 'top',
  },
  {
    id: 't2-attack-result',
    phase: 'TURN_2',
    highlightTarget: null,
    message: "Your attack connected! The opponent lost 1 life card. When a player's life reaches 0 and they take another hit, they lose! After attacking, your Leader becomes \"rested\" (turned sideways) and can't attack again until next turn.",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 't2-end-turn',
    phase: 'TURN_2',
    highlightTarget: '.action-btn--end',
    message: "Great job! Let's end the turn.",
    requiredAction: { type: 'END_TURN' },
    bubblePosition: 'left',
  },
  {
    id: 't2-ai-turn',
    phase: 'TURN_2',
    highlightTarget: null,
    message: "Opponent's turn. Watch what they do...",
    requiredAction: null,
    bubblePosition: 'center',
    waitForState: true,
  },

  // ========== TURN 3 ==========
  {
    id: 't3-intro',
    phase: 'TURN_3',
    highlightTarget: null,
    message: "Turn 3! You now have more DON available. This turn you'll learn about defense — Blockers and Counter cards!",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 't3-play-chopper',
    phase: 'TURN_3',
    highlightTarget: '[data-card-code="ST01-006"]',
    message: "Play Chopper! He costs 1 DON and has the Blocker keyword — he can intercept attacks aimed at your Leader. Click on him.",
    requiredAction: { type: 'PLAY_CARD', cardId: 'ST01-006' },
    bubblePosition: 'top',
  },
  {
    id: 't3-explain-blocker',
    phase: 'TURN_3',
    highlightTarget: null,
    message: "Chopper is on the field with Blocker! When the opponent attacks your Leader, you can rest Chopper to redirect the attack to him instead. Now end your turn and see what happens.",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  {
    id: 't3-end-turn',
    phase: 'TURN_3',
    highlightTarget: '.action-btn--end',
    message: "End your turn. The opponent will attack, and you'll learn to defend!",
    requiredAction: { type: 'END_TURN' },
    bubblePosition: 'left',
  },
  // --- Attack 1: Teach Counter ---
  {
    id: 't3-ai-attacks',
    phase: 'TURN_3',
    highlightTarget: null,
    message: "The opponent's leader is attacking yours! Time to defend.",
    requiredAction: null,
    bubblePosition: 'center',
    waitForState: true,
  },
  {
    id: 't3-skip-blocker',
    phase: 'TURN_3',
    highlightTarget: '.combat-modal__btn--skip',
    message: "Let's skip blocking for now and learn countering first. Click Skip.",
    requiredAction: { type: 'PASS_BLOCKER' },
    bubblePosition: 'bottom',
  },
  {
    id: 't3-use-counter',
    phase: 'TURN_3',
    highlightTarget: '[data-card-code="ST01-009"]',
    message: "This is the Counter Step! Vivi adds +1000 power. Click her in your hand to select, then click Counter!",
    requiredAction: { type: 'USE_COUNTER' },
    bubblePosition: 'top',
  },
  {
    id: 't3-counter-result',
    phase: 'TURN_3',
    highlightTarget: null,
    message: "It worked! Your Leader's power rose to 6000, beating the opponent's 5000. Attack repelled!",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
  // --- Attack 2: Teach Blocker ---
  {
    id: 't3-watch-attack-2',
    phase: 'TURN_3',
    highlightTarget: null,
    message: "The opponent has more attackers — watch for the next one...",
    requiredAction: null,
    bubblePosition: 'center',
    waitForState: true,
  },
  {
    id: 't3-use-blocker',
    phase: 'TURN_3',
    highlightTarget: '[data-card-code="ST01-006"]',
    message: "Use your Blocker! Click Chopper on your field, then click Block to redirect the attack.",
    requiredAction: { type: 'SELECT_BLOCKER' },
    bubblePosition: 'top',
  },
  {
    id: 't3-skip-counter-2',
    phase: 'TURN_3',
    highlightTarget: '.combat-modal__btn--skip',
    message: "Chopper is taking the hit — no need to counter. Click Skip.",
    requiredAction: { type: 'PASS_COUNTER' },
    bubblePosition: 'bottom',
  },
  {
    id: 't3-blocker-result',
    phase: 'TURN_3',
    highlightTarget: null,
    message: "Chopper was knocked out protecting your Leader! Blockers sacrifice themselves to keep you safe.",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },

  // ========== TUTORIAL COMPLETE ==========
  {
    id: 'tutorial-complete',
    phase: 'TURN_3',
    highlightTarget: null,
    message: "Excellent! You've learned the basics of the One Piece Card Game: playing characters with DON, attaching DON for power boosts, attacking, and defending with counters and blockers. The game will now continue as a normal match. Good luck!",
    requiredAction: null,
    bubblePosition: 'center',
    hasNextButton: true,
  },
];
