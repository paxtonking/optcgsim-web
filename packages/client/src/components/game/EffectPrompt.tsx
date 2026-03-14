import React from 'react';

interface EffectPromptProps {
  icon: string;
  title: string;
  cardName?: string;
  description: string;
  instruction?: string;
  warning?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  showSkip: boolean;
  skipLabel?: string;
  onConfirm: () => void;
  onSkip?: () => void;
  className?: string;
}

export const EffectPrompt: React.FC<EffectPromptProps> = ({
  icon,
  title,
  cardName,
  description,
  instruction,
  warning,
  confirmLabel,
  confirmDisabled = false,
  showSkip,
  skipLabel = 'Skip',
  onConfirm,
  onSkip,
  className = '',
}) => (
  <div className={`play-effect-prompt ${className}`}>
    <div className="play-effect-prompt__content">
      <div className="play-effect-prompt__header">
        <span className="play-effect-prompt__icon">{icon}</span>
        <span className="play-effect-prompt__title">{title}</span>
      </div>
      {cardName && (
        <div className="play-effect-prompt__card-name">{cardName}</div>
      )}
      <p className="play-effect-prompt__description">{description}</p>
      {warning && (
        <p className="play-effect-prompt__warning">{warning}</p>
      )}
      {instruction && (
        <p className="play-effect-prompt__instruction">{instruction}</p>
      )}
      <div className="play-effect-prompt__buttons">
        <button
          className="action-btn action-btn--use-effect"
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </button>
        {showSkip && (
          <button
            className="action-btn action-btn--skip-effect"
            onClick={onSkip}
          >
            {skipLabel}
          </button>
        )}
      </div>
    </div>
  </div>
);
