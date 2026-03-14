/**
 * Resolve a card's display image URL through the API proxy.
 *
 * Handles DON cards, official-domain images, and generic card images.
 * Shared by GameCard, CardPreview, GameBoard (AnimatingCard), and useGameState.
 */
export function resolveCardImageUrl(
  cardId: string,
  imageUrl?: string
): string {
  if (cardId === 'DON') return '/assets/cardbacks/CardFrontDon.png';

  const apiBase = import.meta.env.VITE_API_URL || '';
  if (imageUrl) {
    const filename = imageUrl.split('/').pop();
    if (imageUrl.includes('onepiece-cardgame.com')) {
      return `${apiBase}/api/images/official/${filename}`;
    }
    return `${apiBase}/api/images/cards/${filename}`;
  }
  return `${apiBase}/api/images/cards/${cardId}.png`;
}
