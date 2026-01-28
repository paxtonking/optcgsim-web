# CardDisplay Fix Plan

## Issues Identified

### Issue 1: Hover Preview Not Working Properly
**Location:** `packages/client/src/components/CardDisplay.tsx` lines 92-97

**Current Code:**
```tsx
{isHovered && size !== 'lg' && (
  <div className="fixed z-50 pointer-events-none" style={{ top: '50%', left: '60%', transform: 'translate(-50%, -50%)' }}>
    <CardPreview card={card} />
  </div>
)}
```

**Problems:**
1. Fixed positioning at center of screen - doesn't follow the card or mouse position
2. Preview appears in the same spot regardless of which card is hovered
3. May get clipped by parent containers with `overflow-hidden`
4. z-index of 50 may not be high enough

**Solution:**
- Track mouse position when hovering
- Position the preview relative to the mouse cursor
- Use a portal to render the preview outside the DOM hierarchy (avoids overflow clipping)
- Increase z-index and add smart positioning to keep preview on screen

---

### Issue 2: Click to Add Cards Not Working
**Location:** `packages/client/src/components/CardDisplay.tsx` line 51

**Current Code:**
```tsx
onClick={disabled ? undefined : onClick}
```

**Problem:**
- When `disabled` is true, onClick becomes `undefined`, preventing any click handling
- In `DeckBuilderPage.tsx`, disabled is set to `!currentDeck || (!canAdd && !isLeader)`
- This means when no deck is selected, clicking does nothing (no alert shown)
- The `handleCardClick` function has logic to show an alert when no deck exists, but it never gets called

**Solution:**
- Always attach the onClick handler, let the parent component handle disabled state logic
- Or: Pass a separate handler for when clicking a disabled card to show feedback
- The parent (`DeckBuilderPage`) should always receive the click and decide what to do

---

## Implementation Plan

### Step 1: Fix the Hover Preview

**Changes to `CardDisplay.tsx`:**

1. Add mouse position tracking state:
```tsx
const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
```

2. Update mouse event handlers:
```tsx
onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
```

3. Use React Portal to render preview outside component hierarchy:
```tsx
import { createPortal } from 'react-dom';
```

4. Smart positioning logic:
- Position preview to the right of cursor by default
- If near right edge of screen, position to the left
- If near bottom edge, adjust vertical position
- Add offset so preview doesn't cover the cursor

5. Higher z-index (z-[100] or higher)

### Step 2: Fix the Click Handler

**Changes to `CardDisplay.tsx`:**

1. Always call onClick, pass disabled state info:
```tsx
onClick={() => onClick?.()}
```

2. Add visual feedback for disabled state (keep opacity change)

**Changes to `DeckBuilderPage.tsx`:**

1. Update `handleCardClick` to handle all click cases:
```tsx
const handleCardClick = (card: typeof cards[0]) => {
  if (!currentDeck) {
    alert('Please create or select a deck first');
    return;
  }
  // ... rest of logic
};
```

2. Remove the `disabled` prop blocking clicks, or change how it's used:
- Option A: Don't pass `disabled` based on `!currentDeck`
- Option B: Pass a different handler when disabled

---

## Files to Modify

1. **`packages/client/src/components/CardDisplay.tsx`**
   - Add mouse position tracking
   - Use portal for hover preview
   - Smart positioning for preview
   - Fix click handler to always fire

2. **`packages/client/src/pages/DeckBuilderPage.tsx`**
   - Adjust disabled logic so clicks always register
   - Keep visual disabled state but allow click-through for feedback

---

## Testing Checklist

After implementation, verify:
- [ ] Hovering over a card shows preview near the cursor
- [ ] Preview stays on screen (doesn't go off edges)
- [ ] Preview appears above all other content
- [ ] Clicking a card when no deck is selected shows alert
- [ ] Clicking a card when deck is selected adds the card
- [ ] Clicking a leader card sets it as the deck leader
- [ ] Cards at max copies (4) show appropriate feedback
- [ ] Deck at max size (50) shows appropriate feedback
