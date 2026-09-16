import React from 'react';
import { Message } from '../../shared/types';

interface MessageDetailProps {
  message: Message;
}

const MessageDetail: React.FC<MessageDetailProps> = ({ message }) => {
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="message-detail" style={{ flex: 1, borderLeft: '1px solid #e0e0e0' }}>
      <div className="message-detail-header">
        <h1 className="message-detail-subject">{message.subject}</h1>
        <div className="message-detail-meta">
          <div><strong>From:</strong> {message.from}</div>
          <div><strong>To:</strong> {message.to.join(', ')}</div>
          {message.cc && message.cc.length > 0 && (
            <div><strong>Cc:</strong> {message.cc.join(', ')}</div>
          )}
          <div><strong>Date:</strong> {formatDate(message.date)}</div>
        </div>
      </div>
      
      <div className="message-detail-body">
        {message.html ? (
          <div dangerouslySetInnerHTML={{ __html: message.html }} />
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {message.text}
          </pre>
        )}
      </div>
    </div>
  );
};

export default MessageDetail;
