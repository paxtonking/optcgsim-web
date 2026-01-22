import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';

interface ChatPanelProps {
  className?: string;
}

export function ChatPanel({ className = '' }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const {
    messages,
    sendMessage,
    clearMessages,
    setupChatListeners,
  } = useChatStore();

  // Setup chat listeners
  useEffect(() => {
    const cleanup = setupChatListeners();
    return () => {
      cleanup();
      clearMessages();
    };
  }, [setupChatListeners, clearMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div className={`flex flex-col bg-gray-900 ${className}`}>
      <div className="p-3 border-b border-gray-700">
        <h2 className="text-lg font-bold">Chat</h2>
      </div>

      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
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

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            maxLength={200}
            className="flex-1 px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 focus:outline-none text-white text-sm"
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
    </div>
  );
}
