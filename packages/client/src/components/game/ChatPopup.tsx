import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { QUICK_MESSAGES, CHARACTER_EMOTES } from '@optcgsim/shared';
import './ChatPopup.css';

interface ChatPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatPopup({ isOpen, onClose }: ChatPopupProps) {
  const [inputValue, setInputValue] = useState('');
  const [showEmotes, setShowEmotes] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emotePickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();
  const { messages, sendMessage } = useChatStore();

  // Chat listeners are set up at GameBoard level, not here
  // This component is UI-only: display messages and handle input

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Close emote picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emotePickerRef.current && !emotePickerRef.current.contains(e.target as Node)) {
        setShowEmotes(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleQuickMessage = (message: string) => {
    sendMessage(message);
    setShowEmotes(false);
  };

  const handleEmoji = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    setShowEmotes(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="chat-popup-overlay" onClick={onClose}>
      <div className="chat-popup" onClick={(e) => e.stopPropagation()}>
        <div className="chat-popup__header">
          <h2 className="chat-popup__title">Chat</h2>
          <button
            className="chat-popup__close"
            onClick={onClose}
            aria-label="Close chat"
          >
            &times;
          </button>
        </div>

        {/* Messages container */}
        <div className="chat-popup__messages">
          {messages.length === 0 ? (
            <p className="chat-popup__empty">
              No messages yet. Say hello!
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-popup__message ${
                  msg.isSystem
                    ? 'chat-popup__message--system'
                    : msg.senderId === user?.id
                    ? 'chat-popup__message--self'
                    : 'chat-popup__message--other'
                }`}
              >
                {msg.isSystem ? (
                  <span className="chat-popup__system-text">{msg.message}</span>
                ) : (
                  <div className="chat-popup__bubble">
                    <div className="chat-popup__meta">
                      <span className="chat-popup__sender">
                        {msg.senderId === user?.id ? 'You' : msg.senderUsername}
                      </span>
                      <span className="chat-popup__time">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="chat-popup__text">{msg.message}</p>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Emote picker */}
        {showEmotes && (
          <div ref={emotePickerRef} className="chat-popup__emotes">
            <div className="chat-popup__emotes-section">
              <p className="chat-popup__emotes-label">Quick Messages</p>
              <div className="chat-popup__quick-messages">
                {QUICK_MESSAGES.map((qm) => (
                  <button
                    key={qm.id}
                    onClick={() => handleQuickMessage(qm.message)}
                    className="chat-popup__quick-btn"
                  >
                    {qm.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="chat-popup__emotes-section">
              <p className="chat-popup__emotes-label">Emojis</p>
              <div className="chat-popup__emoji-grid">
                {CHARACTER_EMOTES.map((emote) => (
                  <button
                    key={emote.id}
                    onClick={() => handleEmoji(emote.emoji)}
                    className="chat-popup__emoji-btn"
                    title={emote.label}
                  >
                    {emote.emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleSubmit} className="chat-popup__form">
          <button
            type="button"
            onClick={() => setShowEmotes(!showEmotes)}
            className={`chat-popup__emote-toggle ${showEmotes ? 'chat-popup__emote-toggle--active' : ''}`}
            title="Emotes"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            maxLength={200}
            className="chat-popup__input"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="chat-popup__send"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatPopup;
