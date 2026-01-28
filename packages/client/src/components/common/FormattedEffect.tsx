import React from 'react';
import { parseEffectText, ParsedEffect, getEffectCategoryColor } from '../../utils/effectTextFormatter';
import './FormattedEffect.css';

interface FormattedEffectProps {
  effect: string | null | undefined;
  trigger?: string | null;
  compact?: boolean;  // Compact mode for smaller displays
}

/**
 * Displays card effect text with categorized sections
 */
export const FormattedEffect: React.FC<FormattedEffectProps> = ({
  effect,
  trigger,
  compact = false
}) => {
  const parsedEffects = parseEffectText(effect, trigger);

  if (parsedEffects.length === 0) {
    return null;
  }

  return (
    <div className={`formatted-effect ${compact ? 'formatted-effect--compact' : ''}`}>
      {parsedEffects.map((parsed, index) => (
        <EffectSection key={index} effect={parsed} compact={compact} />
      ))}
    </div>
  );
};

interface EffectSectionProps {
  effect: ParsedEffect;
  compact?: boolean;
}

const EffectSection: React.FC<EffectSectionProps> = ({ effect, compact }) => {
  const color = getEffectCategoryColor(effect.type);

  // Keywords shown as badges
  if (effect.type === 'keyword') {
    const keywords = effect.text.split(', ');
    return (
      <div className="formatted-effect__keywords">
        {keywords.map((keyword, i) => (
          <span
            key={i}
            className="formatted-effect__keyword-badge"
            style={{ backgroundColor: color }}
          >
            {keyword}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="formatted-effect__section">
      <div
        className="formatted-effect__header"
        style={{ borderLeftColor: color }}
      >
        {effect.icon && !compact && (
          <span className="formatted-effect__icon">{effect.icon}</span>
        )}
        <span
          className="formatted-effect__label"
          style={{ color }}
        >
          {effect.label}
        </span>
      </div>
      <p className="formatted-effect__text">{effect.text}</p>
    </div>
  );
};

export default FormattedEffect;
