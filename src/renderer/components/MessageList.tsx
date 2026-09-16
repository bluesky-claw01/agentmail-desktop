import React, { useEffect, useRef } from 'react';
import { Message } from '../../shared/types';

interface MessageListProps {
  messages: Message[];
  selectedMessage: Message | null;
  selectedMessageIds: string[];
  onMessageSelect: (message: Message) => void;
  onMessageCheck: (messageId: string, checked: boolean) => void;
  onSelectAllShown: (messageIds: string[], checked: boolean) => void;
  loading: boolean;
  selectionDisabled?: boolean;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  selectedMessage,
  selectedMessageIds,
  onMessageSelect,
  onMessageCheck,
  onSelectAllShown,
  loading,
  selectionDisabled = false
}) => {
  const selectAllRef = useRef<HTMLInputElement>(null);

  const shownIds = messages.map((message) => message.id);
  const selectedShownCount = shownIds.filter((id) => selectedMessageIds.includes(id)).length;
  const allShownSelected = shownIds.length > 0 && selectedShownCount === shownIds.length;
  const someShownSelected = selectedShownCount > 0 && !allShownSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someShownSelected;
    }
  }, [someShownSelected]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="message-list">
        <div className="loading">Loading messages...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="message-list">
        <div className="empty-state">
          <h3>No messages</h3>
          <p>This folder is empty</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" style={{ flex: selectedMessage ? '0 0 400px' : 1 }}>
      <div className="message-bulk-bar">
        <label className="message-bulk-select-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allShownSelected}
            disabled={selectionDisabled}
            onChange={(e) => onSelectAllShown(shownIds, e.target.checked)}
          />
          <span>Select all shown</span>
        </label>
        <span className="message-bulk-count">
          {selectedMessageIds.length > 0 ? `${selectedMessageIds.length} selected` : ''}
        </span>
      </div>

      {messages.map((message) => {
        const checked = selectedMessageIds.includes(message.id);

        return (
          <div
            key={message.id}
            className={`message-item ${message.unread ? 'unread' : ''} ${
              selectedMessage?.id === message.id ? 'active' : ''
            }`}
            onClick={() => onMessageSelect(message)}
          >
            <div
              className="message-checkbox"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={selectionDisabled}
                onChange={(e) => {
                  e.stopPropagation();
                  onMessageCheck(message.id, e.target.checked);
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select message ${message.subject}`}
              />
            </div>

            <div className="message-item-body">
              <div className="message-header">
                <span className="message-from">{message.from}</span>
                <span className="message-date">{formatDate(message.date)}</span>
              </div>
              <div className="message-subject">{message.subject}</div>
              <div className="message-preview">
                {message.text?.substring(0, 100) || '(No content)'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MessageList;
