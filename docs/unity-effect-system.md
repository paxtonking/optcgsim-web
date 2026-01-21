# Unity Effect System - Extracted from Assembly-CSharp.dll

## Action Triggers (ActionTrigger enum)
When a card effect can activate:

```
Passive, ActivateMain, OncePerTurn, OnAttack, Counter, Trigger, OnPlay, DonX, DonTap,
TrashX, AfterBattleCharacter, AfterKOCharacter, AllDonRested, AllyCharacterPreKO,
AnyCharacterKOd, AnyHitLeader, AttachDon, BattlingCharacter, BottomDeckAlly,
BottomDeckStage, CardDrawn, CostZeroExists, CounterOnlyForCharacters,
CounterOnlyForLeader, DeployedCharacterFromHand, DonIsReturned, EndOfTurn,
EqualOrLessDonThanOpponent, FailedKO, ForceOptional, HandEmpty, HitLeader, KOAlly,
LeaderHasZeroPower, LeaderIsActive, LessDonThanOpponent, LessLifeThanOpponent,
LifeAddedToHand, LifeReachesZero, LifeZero, Mandatory, MustBeMyDonReturnEffect,
MyDonIsReturned, NoLife, OnBlock, OnKO, OnKOEffectOnly, OnPlay2, OnPlayFromTrigger,
OpponentActivatesBlocker, OpponentAttack, OpponentCharacterKOd, OpponentDeploys,
OpponentHandCardIsEvent, OpponentPlaysEvent, OpponentTurn, PreBounce, PreDeckBottom,
PreKO, PreKOEffectOnly, PreSendToBottomLife, PreSendToTopLife, PreTrash, RecallSelf,
RestLeader, SelfPlaysEvent, SelfTap, ShareOPTWithOtherPreActions, TakeTopOrBottomLife,
TrashAlly, TrashRequiresTrigger, TrashSelf, TrashTopOrBottomLife, UsedTrigger,
WhileRestedOnYourTurn, YourTurn, ZeroDon
```

## Action Effects (ActionEffect enum)
What effects can do:

```
Rush, NoBlocker, Deploy, Blocker, BuffAny, BuffOther, BuffSelf, BuffCombat,
AceLeaderEffect, ActivateAll, ActivateAllFilmCharsEndOfTurn, ActivateAny,
ActivateCharacter, ActivateSelf, AddCharacterToLife, AddDeckToTopOrBottomLife,
AllCharsEffectImmune, AllCharsImmune, AllUniqueNames, BottomDeckMainTarget,
BounceSelf, BrookEffect, CanAttackActive, CantAttack, CantLeaveFieldFromEffects,
CantRushLeader, CheckTopDeckAndBottomIt, TopDeckCostOrMore,
CycleEntireHandToDeckBottom, DeployCharacter, DeployFromTopDeck,
AddToLifeFromTopDeck, DeployRested, DoubleAttack, Draw1Or2, DrawAfterTrash,
DrawCardOrGainLife, DrawFromDeck, DrawFromTrash, DrawOtherCharacterFromTrash,
FieldCantAttackLeader, ForceFaceUp, ForceKOSelfCharacter, FreezeAnyOpponent,
FreezeSelf, GainBanish, GainBlockerWhenUsed, GainCanAttackActive,
GainCombatImmuneToStart, GainImmune, GainRush, GiveSelfUpTo2RestedDon,
GrantAnyNoblock, GrantBanish, GrantCanAttackActive, GrantCharacterRush,
GrantDoubleAttack, GrantDoubleIfSecondary, GrantFieldImmuneInCombat, GrantFieldRush,
GrantFieldRushCharacter, GrantLeaderDoubleAttack, HasATrigger, HasNoEffects,
HideTopDeckDraw, ImmuneInCombat, ImmuneToLeaders, ImmuneToNoncombat,
ImmuneToStrikesIncludesLeaders, KOAllButMe, KOBounceOrLife,
KOCostOrLessCombinedLife, KOCostOrLessOpponentLife, KOCostZero, KOMainTarget,
KOOrBounceOpponent, KOSelf, LifeOrDeath, MatchAttackerPowerUntilTurnEnd,
MatchOpponentBasePowerUntilTurnEnd, MatchOpponentPowerUntilTurnEnd,
MatchCategoryOrStrike, MatchLeaderToBasePowerUntilTurnStart, MoveEitherTopLife,
NoTakeLifeToTurnStart, OnlyActive, OnlyBlockers, OnlyRested,
OpponentCanOnlyAttackMyName, OpponentCantAttack, OrRestDon, PlaceAnyCharacterOnDeckBottom,
PlaceAnyOpponentOnDeckBottom, PlayFromDeck, PlayFromHandOrTrash, PlayFromTrash,
PlayOtherRested, PreventFriendlyKOs, PreventKO, Reject, RestAllOpponentCharacters,
RestAnyOpponent, RestOrKORestedCharacter, ReturnAnyCharacter, ReturnAtEndOfTurnIfUsed,
ReturnOpponentCharacter, ReturnMyCharacter, ReturnOrDeckAnyCharacter, RevealAndDrawTopDeck,
RevealAndPlayTopDeck, RevealAndPlayTopLife, SecondaryFreezeCostZero, SecondaryKOPowerZero,
SecondaryKOCostZero, SecondaryLeaderActive, SelfTapAfter, SendAllMyCharactersToDeckBottom,
SendAllyToTopOrBottomLife, SendAnyCharacterToAnyLife, SendMeToBottom,
SendOpponentToTopLife, SendOpponentToTopOrBottomLife, ShuffleAfterReturnTrash,
ShuffleHandIntoDeck, SilenceSelf, SwapDeployedWithOtherColorHand, TakeAnotherTurn,
TempGainBanish, TempGainDoubleAttack, TopDeckTopOrBottom, TrashAtEndOfTurnIfUsed,
TrashOpponentStage, TrashRemainingTopDeck, TrashSelf, TrashSelfFromHand, WinWithDeckOut,
ActivateDon, ActivateDonIfOptionalTrash, AddDeckToLife, AddHandToLife, BanishOpponentLife,
BaseCostActiveCharactersImmuneToEffects, BasePowerOrLess, BothPlayersTrashToHandX,
BottomDeck2ndCostOrLess, BounceAnyCharactersForXCombat, BuffAnyToTurnStart,
BuffCharacters, BuffCombatIfSecondary, BuffCombatWhenLifeIsLow,
BuffCombatWhenOpponentLifeIsLow, BuffFieldToTurnStart, BuffLeader, BuffLeaderCounter,
BuffLeaderToNextTurnEnd, BuffLeaderToTurnStart, BuffLeaderToOppEnd, BuffOpponent,
BuffOpponentCharacter, BuffOtherCharacters, BuffPer2TrashedEvents, BuffPerDeploy,
BuffPerHand, Buff1KPerTrash, BuffSelfIfCostZeroExists, BuffSelfToTurnStart,
BuffWhenAttacking, Buff1KPerXRestedDon, ChangeOpponentCost, CostOrLess,
CostOrLessOpponentOnly, CostOrMore, DebuffCharacters,
DeployCostOrLessBlackFromHandAfterDrawTrash, DeployCostOrLessFromHandAfterTargetOpponent,
DrawAndTrashAfterTarget, DrawCards, DrawHandOrLower, DrawTo, EndWithMillDeck,
ExtraTargets, FreezeAllCostOrLess, GainActiveDon, GainRestedDon,
GainRestedDonWhenLifeIsLow, GrantSelfRestedDon, HandTopDeck, KO2ndCostOrLess,
KO2ndPowerOrLess, KOAllCostOrLess, KOAllOpponentCostOrLess, KOAllyForLeaderBuff,
KOAnyCostOrLess, KOCombinedPowerOrLess, KOCostOrLess, KOCostOrLessStage,
KOHigherCostIfSecondary, KOOriginalPowerOrLess, KOPowerOrLess, LifeOrNerf,
LowLifeThreshold, MillDeck, MoveAnyRestedDonToAlly, OpponentBottomDeckCards,
OpponentBottomDeckCharacters, OpponentBouncesCharacters, OpponentCharacterCantAttack,
OpponentFieldCostChange, OpponentLifeToDeckBottom, OpponentReturnDon,
OpponentReturnTrash, OpponentShuffleHandAndDraw, OpponentTrashCards,
OpponentTrashRandom, OptionalTrash, PlayFromTrash2ndCostOrLess, PowerOrLess,
PowerOrMore, ReduceCardCosts, RestOpponentCharacter, RestOpponentDon,
Return2ndCostOrLess, RevealOpponentHand, SecondaryAddDeckToLifeWhenLifeIsLessThan,
SecondaryDrawAndTrashLifeWhenLifeAtLeast, SecondaryBottomdeckCostOrLess,
SecondaryBuffAny, SecondaryBuffOpponent, SecondaryCombinedLifeOrLess,
SecondaryKOCostOrLess, SecondaryKOPowerOrLess, SecondaryKOPowerZeroWhenLifeLessThan,
SecondaryKORestedCostOrLess, SecondaryOpponentPowerOrMore, SecondaryRestCostOrLess,
SecondaryRestedCardCount, SecondaryTrashCount, SendAllCostOrLowerToDeckBottom,
SendHandToBottomAfter, SilenceThenKOPowerOrLess, TakeOpponentLife, TempBuffSelf,
TopDeck, TrashAnyCardsForXCombat, TrashCards, TrashFilmAtTurnEnd, TrashRandomCards,
TrashTopDeck, TurnEndActivateDon
```

## Card Definition Fields (Passive/Keyword Effects)
These are the card properties from the CardDefinition class:

### Keywords
```
Banish, Blocker, DoubleAttack, Rush, Unblockable, CanAttackActive, RushCharacters
```

### Passive Power Modifiers
```
PassivePowerChange, PassiveBasePowerMatchLeader, Passive1KPerXTrash,
Passive1KPerXEventTrash, Passive1KPerXRestedDon, Passive1CostPerXTrash,
Passive2CostPerXTrash, PassiveCantAttack, PassiveCostChange
```

### Field Effects
```
FieldPowerDebuff, FieldPowerBuff, FieldBasePowerChange, FieldCantAttack,
FieldRushCharacters, AllyFieldCostChange, AllyHandPlayCostReduce,
OpponentFieldCostChange, OpponentFieldImmuneToRemoval
```

### Immunity Effects
```
ImmuneToBattle, ImmuneToNoncombat, ImmuneToRemoval,
ImmuneToRemovalFromCharactersXBasePowerOrLess, ImmuneToRest, ImmuneToStrikes,
ImmuneToLeaderStrikes, VulnerableToNoncombat, VulnerableToStrikes,
OtherCharsImmuneToNoncombatKO
```

### Cost/Restriction Effects
```
HandCostChange, CantBeDeployedViaEffect, BlockerMustBeXOrMore, BlockerMustBeXOrLess,
AllDeployRested, NoOnPlays, FreezeAllCostOrLess, CharacterTypeHas1KCounter
```

### Special Effects
```
CountsAsEverything, FaceUpLifeGoesToDeck, WinsByDeckout, ForceOpponent
```

## Target Effects (ActV3Effect fields)
Effects that modify targets:

```
BuffPower, BuffXPerPrevTargets, BuffPowerToOppEnd, BuffPowerToOwnersEnd,
BuffCombatPower, BuffCombatXPerPrevTargets, SetBasePowerToStart, SetBasePowerToOppEnd,
ChangeCost, ChangeCostToOppEnd, GainConfusion, Activate, ActivateMainOfCard,
AttachActiveDon, AttachRestedDon, BecomeDefenderCharacter, DetachDon, CantAttack,
CantAttackOrigCostOrLess, CantPlayOriginalCostOrMore, CantRest, CantDrawFromEffects,
DeployCharacter, Freeze, FlipLifeDown, GainBanish, GainBlocker, GainBlockerToOppEnd,
GainDoubleAttack, GainRush, GainRushCharacters, GainUnblockable, GainCanAttackActive,
GainImmune, GainCombatImmuneToStart, InfiniteReturnToDeck, KOCard, KOIfCostXOrLess,
LoseBlocker, MatchOpponentPowerUntilTurnEnd, MatchOpponentBasePowerUntilTurnEnd,
MatchLeaderToBasePowerUntilTurnStart, Rest, RevealCard, SendToDeckBottom, SendToDeckTop,
SendToHand, SendToTopLife, SendToBottomLife, SetPowerToZero, Silence, SilenceToOwnersEnd,
SwapBasePower, SwapBasePowerWithLeader, TrashCard, TransformToSavedString,
RosinanteLeader, GrantEffect, BuffSelf1KPerXTargets, DeploySelf, RestSelf, TrashSelf
```

## Self/Global Effects
```
DrawCards, DonMinus, DonTap, FlipTopLifeUp, FlipTopLifeDown, GainActiveDon,
GainRestedDon, Heal, HealEndOfTurn, MillDeck, OppTrashRandom, OppTakeLife,
StartTopDeck, StartTopDeckOpp, TrashOppLife, AllCharsEffectImmune,
ActivateAllFilmCharsEndOfTurn, CantActivateDonToTurnEnd, CantPlayAnyCardsFromHand,
CantPlayAnyCharactersToField, CleanUpTopDeck, CycleEntireHandToDeckBottom,
DealDamage, DrawSavedCount, EndOfTurnEqDon, EffectImmune, FieldCantAttackLeader,
HideOppHand, MillForXPreviousTargets, NoTakeLifeToTurnStart,
OpponentCanOnlyAttackMyName, OppNoOnPlayToTurnEnd, OppNoBlockerThisTurn,
OptionalReturnDon, LeaveLifeInPosition, PeekSelfLife, PeekOppLife, PeekOppTopDeckFlip,
RevealOppHand, SendTopLifeToBot, SendOppTopLifeToBot, ShuffleDeck, ShuffleHandIntoDeck,
StartTopDeckFromHand, StartTopDeckFromTrash, StartTopDeckFromOppTrash,
StartTopDeckFromDeck, StartTopDeckFromLife, StartTopDeckFromLifeAll,
StartTopDeckFromOppLifeAll, TakeDamage, TakeTopLife, TakeBottomLife, TrashTopLife,
TrashBottomLife, TrashLifeTo, TopDeckToDeckBottom, TopDeckToDeckTop, TopDeckToLife,
TopDeckToOppLife, TrashTopDeck, TrashAllFaceUpLife, TurnEndActivateDon,
TurnEndGainActiveDon, WinTheGame
```

## Card Categories (CardCategory enum)
All character types/affiliations:

```
AccinoFamily, AlabastaKingdom, Alchemi, AlvidaPirates, AmazonLily, Animal,
AnimalKingdomPirates, ArlongCrew, AsukaIsland, BaroqueWorks, BartoClub, Baterilla,
BeautifulPirates, BellamyPirates, BigMomPirates, BiologicalWeapon, BlackbeardPirates,
BlackCatPirates, BluejamPirates, BoinArchipelago, BonneyPirates, Botanist,
BrownbeardPirates, BuggyPirates, BuggysDelivery, Captain, CaribouPirates,
CelestialDragon, CP0, CP7, CP9, FormerCP9, CrossGuild, CrownIsland,
DonquixotePirates, DrakePirates, Dressrosa, DrumKingdom, EastBlue, Egghead,
EldoraggoPirates, EvilBlackDrumKingdom, FallenMonkPirates, Fairy, FILM,
FiretankPirates, FishMan, FishmanIsland, FiveElders, Flevance, FlyingFishRiders,
FlyingPirates, FoolshoutIsland, FormerArlongPirates, FormerBaroqueWorks,
FormerBigMomPirates, FormerNavy, FormerRogerPirates, FormerRollingPirates,
FormerRumbarPirates, FormerWhiteBeardPirates, FourEmperors, FoxyPirates,
FrankyFamily, GalleyLaCompany, GaspardePirates, Germa66, GermaKingdom, Giants,
GoaKingdom, GodsPriests, GoldenLionPirates, GranTesoro, GyroPirates, HapposuiArmy,
HawkinsPirates, HeartPirates, Homies, ImpelDown, ImposterStrawhatCrew, JailerBeast,
Jaya, JellyfishPirates, Journalist, KidPirates, KouzukiFamily, KriegPirates,
KujaPirates, KurozumiFamily, LongRingLongLand, LulusiaKingdom, Lunarian, MechaIsland,
Mermaid, MinkTribe, MONSTERS, Moon, MountainBandit, Navy, NeoNavy, NewFishmanPirates,
NewGiantWarriorPirates, NineRedScabbards, ODYSSEY, Ohara, OmatsuriIsland, OnAirPirates,
OriginalRockPirates, PirateFest, PirateKing, Plague, ProdenceKingdom, PunkHazard,
RedHairedPirates, RevolutionaryArmy, RocksPirates, RogerPirates, RosyLifeRiders,
RumbarPirates, SabaodyArchipelago, SaruyamaAlliance, Scientist, SeaKing, Seraphim,
SevenWarlords, ShandoraWarrior, SheepsHouse, ShikkearuKingdom, ShimotsukiVillage,
ShipbuildingTown, SkyIsland, Smile, SniperIsland, Song, SpadePirates, StrawHatChase,
StrawHatCrew, SunPirates, Supernovas, SuperRookie, Sword, TheHolyLandMaryGeoise,
ThrillerBarkPirates, Tontatta, TreasurePirates, TrumpPirates, VinsmokeFamily,
WanoCountry, WaterSeven, WeevilsMom, WhitebeardPirates, WhitebeardPiratesSubordinates,
WholeCakeIsland, WindmillVillage, WorldGovernment, WorldPirates, NONE
```

## Card Colors (CardColor enum)
```
Red, Green, Blue, Purple, Black, Yellow
```

## Card Types (CardType enum)
```
Leader, Character, Event, Stage
```

## Strike Types (StrikeType enum)
```
Strike, Slash, Ranged, Special, Wisdom, None
```

## Button Choice Types (used for UI prompts)
```
AddBottomLife, AddTopLife, Attack, BackToMain, BottomDeckSelfStage, BottomDeckOppStage,
BottomLifeInsteadOfKO, BrookReturn, BrookTrash, Cancel, CardAction, ConfirmCounter,
ConfirmDon, ConfirmEndTurn, ConfirmRevealedCard, Deploy, Draw1Card, Draw2Cards,
DrawCard, DrawDon, DrawNone, DrawTopCard, DropCost, EndTurn, EndWithMill,
FinalizeTopDeck, ForcedAllowNerf, ForcedGrantLife, ForcedTrashLife, Gain1Life,
GoFirst, GoSecond, HostNetwork, HostServer, JoinNetwork, Mill, MoveToBottom,
MoveToTop, NoBlocker, NoMill, NormalCounter, NoTrigger, NoTriggerOutOfOrder,
OpponentDisconnect, PeekMyLife, PeekOppLife, PeronaCost, PeronaTrash, PlayTopCard,
PlayWithNoEffect, Rematch, RejectDamage, RejectKO, ResolveAttack, RestCharacter,
ReturnToHandInstead, ReturnToHandInsteadOfKO, ShowFullDeck, ShowOnlyValid,
StartingHand_Keep, StartingHand_Mulligan, TakeBottomLife, TakeTopLife, TapLeader,
TapStage, TopDeckToBottom, TopDeckToTop, TopLifeInsteadOfKO, TrashBottomLife,
TrashTopLife, Trigger, TriggerOutOfOrder, UseAceLeader, UseOnPlay, UseV3OnPlay,
FinalizeLifeOrder, ArrangeOpponentLife, FlipAllLifeDown, SelectAttachedDon,
SelectOptionalReturnDon, SelectTargets, SelectFriendlyTargets, SelectEnemyTargets,
SelectEnemyCharacters, SelectEnemyLeaders, SelectEnemyStage, SelectTrashTargets,
ConfirmInfiniteTargets, V3Choice, AttachAllActiveDon, ConfirmAttachAllActiveDon,
Guess, GuessDown, GuessUp
```

## Game States
```
Start_WaitOnTurnSelection, Start_WaitOnTurnOrder, Start_WaitOnDeckFill,
Start_WaitOnStartGameAction, Start_WaitOnMulliganChoice, Start_WaitOnOpponentStart,
PlayerTurn_Start, PlayerTurn_StartWait, PlayerTurn_Untap, PlayerTurn_DrawCard,
PlayerTurn_DrawCardWait, PlayerTurn_DrawDon, PlayerTurn_DrawDonWait,
PlayerTurn_MainWait, PlayerTurn_Action, Action_AttachingDon, Action_SelectingDeploySwap,
Attack_SelectingTarget, Attack_HandlingConfusion, Attack_WaitOnCounters,
Attack_WaitOnBlocker, Life_ActivateTrigger, Life_DoubleTriggering, MainMenu,
Lobby_Hosting, Lobby_Joining, GameOver, OpponentTurn_Action, Trash_ViewingSelf,
Trash_ViewingOpponent, ConfirmRevealedCard, ConfirmRevealedCardOnOpponentsTurn,
MultiplayerRematch, MultiplayerRematchReady, OpponentDisconnect, Observing,
ObservingCombat, PostAttack_HitLeader, PostAttack_HitLeaderDouble,
PostAttack_KOdCharacter, Attack_BeforeBlocker, EndingTurn, EndTurnTrashingFilm,
EndTurnEqualDon, SaveState_TurnStart
```

## Target Conditions (ActV3StepDetails)
Conditions for targeting:

```
Required, ConfirmAction, NoCancel, FullTargetsRequired, EndAfterStep, SearchingDeck,
AllyCostOrMore, AllyCostCount, BoardLessThanCostX, LeaderNameRequired,
LeaderCategoryRequired, CanUseOnPlays, CharactersOrMore, CharacterCostXOrMore,
CharacterPowerXOrMore, FieldIsOnlyCategory, HandXOrLess, HandEmpty, HandXOrMore,
OppHandXOrMore, HandDiffXOrMore, OppPowerXOrMore, AnyPowerXOrMore, HasPreviousTargets,
NoPreviousTargets, HasValidTargets, CategoryInPlayRequired, CategoryInPlayCount,
AllyNameNotInPlay, LeaderColorCountOrMore, LeaderHasColors, OppXMoreOrMoreCharacters,
OppCharactersOrMore, OppCharactersOrLess, AttackerHasStrikeTypes, AttackerHasCardTypes,
AvailableDon, LessThanXAvailableDon, DonXOrMore, DonXOrLess, OppDonXOrMore,
OppDonXOrLess, SelfAttachedDon, LessOrEqDon, LessDon, LifeXOrLess, LifeXOrMore,
CombinedLifeXOrLess, CombinedLifeXOrMore, OppLifeXOrLess, OppLifeXOrMore, LifeLess,
LifeLessOrEqual, LifeIsZero, FacedownLife, PreviousTargetNowInLife,
PreviousTargetNowInHand, PreviousTargetNowInDeck, SelfRestedCharacters, SelfRestedCards,
OppRestedCharacters, CostZeroOrXOrMoreExists, OppCostZeroOrXOrMoreExists,
TopDeckCountOrMore, TrashXOrMore, TrashEventsXOrMore, TopDeckHasCategory,
TopDeckCostOrMore, TopDeckCostOrLess, TopDeckHasType, TopDeckMatchesSavedCost,
FirstTurnOnly, LastTrashedCostXOrMore, SelfRestedCharacterCategory, SelfCharacterCategory,
CostXOrHigherCharacterCategory, RequirePreviousTargets
```

## Target Selection (ActV3Target)
```
AutoSelf, AutoCopyPreviousTargets, AutoAllMatchingTargets, NoUsingPreviousTargets,
AutoMainTarget, NoDuplicateNames, TargetCount, TargetCountHandOverflow,
TargetCountSavedCount, OverrideUITargetCount, AttachedDon, DeployedCharacter, Leader,
HandCard, TopDeckCard, TrashCard, StageCard, DonAreaCard, DeckCard, LifeCard,
FriendlyOnly, EnemyOnly, ActiveOnly, RestedOnly, NotSelf, OnlySelf, FaceUp, OnlyTypes,
OnlyColors, OnlyCategories, OnlyStrikeTypes, OnlyNames, NotNames, NameMatchesSaved,
PowerXOrLess, PowerXOrMore, CombinedPowerXOrLess, OriginalPowerXOrLess,
OriginalPowerXOrMore, SecondOriginalPowerXOrLess, PowerZero, BasePowerZero, CostOrLess,
CostOrMore, OriginalCostOrLess, OriginalCostOrMore, SecondCostOrLess,
SecondOriginalCostOrLess, CostDonOrLess, CostOppDonOrLess, CostMyLifeOrLess,
CostOppLifeOrLess, CostCombinedLifeOrLess, CostZero, CostOrLessOverride,
CostOverrideMyCostXOrMoreExists, NameOverrides, ColoredEventOverrides,
StrikeTypeOverrides, HasNoEffects, HasNoOnPlay, HasNoOnAttack, HasBlocker, HasTrigger,
HasActivateMain, WillBeRemoved, DifferentColorFromPrevTarget,
SecondCostOrLessCheckPrevTarget, lTargetOverrides
```

## Server RPC Methods (225 total game actions)
See the full list extracted from DLL - these are all the networked game actions.
