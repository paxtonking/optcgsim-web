import { useState, useEffect, useRef } from 'react';
import { useLobbyChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { QUICK_MESSAGES, CHARACTER_EMOTES } from '@optcgsim/shared';

interface LobbyChatPanelProps {
  className?: string;
}

export function LobbyChatPanel({ className = '' }: LobbyChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emotePickerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const {
    messages,
    sendMessage,
    joinLobbyChat,
  } = useLobbyChatStore();

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

  const handleQuickMessage = (message: string) => {
    sendMessage(message);
    setShowEmotes(false);
  };

  const handleEmoji = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    setShowEmotes(false);
  };

  // Join lobby chat on mount
  useEffect(() => {
    const cleanup = joinLobbyChat();
    return cleanup;
  }, [joinLobbyChat]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

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

  const unreadCount = isMinimized ? messages.length : 0;

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className="p-3 border-b border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-750"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Lobby Chat</h2>
          {isMinimized && unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <button className="text-gray-400 hover:text-white">
          {isMinimized ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      </div>

      {!isMinimized && (
        <>
          {/* Messages container */}
          <div className="h-64 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                No messages yet. Say hello!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${
                    msg.isSystem
                      ? 'text-center'
                      : msg.senderId === user?.id
                      ? 'text-right'
                      : 'text-left'
                  }`}
                >
                  {msg.isSystem ? (
                    <span className="text-gray-500 text-xs italic">{msg.message}</span>
                  ) : (
                    <div
                      className={`inline-block max-w-[80%] ${
                        msg.senderId === user?.id
                          ? 'bg-blue-600 rounded-tl-lg rounded-tr-lg rounded-bl-lg'
                          : 'bg-gray-700 rounded-tl-lg rounded-tr-lg rounded-br-lg'
                      } px-3 py-2`}
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        <span
                          className={`text-xs font-medium ${
                            msg.senderId === user?.id ? 'text-blue-200' : 'text-gray-400'
                          }`}
                        >
                          {msg.senderId === user?.id ? 'You' : msg.senderUsername}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <p className="text-white text-sm break-words">{msg.message}</p>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Emote picker */}
          {showEmotes && (
            <div
              ref={emotePickerRef}
              className="border-t border-gray-700 bg-gray-700 p-3 max-h-40 overflow-y-auto"
            >
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-2">Quick Messages</p>
                <div className="flex flex-wrap gap-1">
                  {QUICK_MESSAGES.map((qm) => (
                    <button
                      key={qm.id}
                      onClick={() => handleQuickMessage(qm.message)}
                      className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white transition-colors"
                    >
                      {qm.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Emojis</p>
                <div className="flex flex-wrap gap-1">
                  {CHARACTER_EMOTES.map((emote) => (
                    <button
                      key={emote.id}
                      onClick={() => handleEmoji(emote.emoji)}
                      className="w-8 h-8 flex items-center justify-center bg-gray-600 hover:bg-gray-500 rounded text-lg transition-colors"
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
          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEmotes(!showEmotes)}
                className={`px-3 py-2 rounded transition-colors ${
                  showEmotes
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                }`}
                title="Emotes"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                maxLength={200}
                className="flex-1 px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-white text-sm"
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
