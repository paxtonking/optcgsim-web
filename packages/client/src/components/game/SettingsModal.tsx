import React from 'react';
import './GameBoard.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isMuted,
  onToggleMute
}) => {
  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal__header">
          <h2 className="settings-modal__title">Settings</h2>
          <button className="settings-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-modal__content">
          <div className="settings-modal__option">
            <span className="settings-modal__label">Sound Effects</span>
            <button
              className={`settings-modal__toggle ${!isMuted ? 'settings-modal__toggle--on' : ''}`}
              onClick={onToggleMute}
            >
              <span className="settings-modal__toggle-slider" />
              <span className="settings-modal__toggle-text">
                {isMuted ? 'OFF' : 'ON'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
