import React, { useState, useEffect } from 'react';
import { Message, ComposeMessage } from '../../shared/types';

interface ComposeWindowProps {
  inboxId: string;
  replyToMessage?: Message;
  onClose: () => void;
  onSendComplete: () => void;
}

const ComposeWindow: React.FC<ComposeWindowProps> = ({
  inboxId,
  replyToMessage,
  onClose,
  onSendComplete
}) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (replyToMessage) {
      setTo(replyToMessage.from);
      setSubject(
        replyToMessage.subject.startsWith('Re:')
          ? replyToMessage.subject
          : `Re: ${replyToMessage.subject}`
      );
    }
  }, [replyToMessage]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSending(true);

    try {
      const toAddresses = to.split(',').map(addr => addr.trim()).filter(addr => addr);
      const ccAddresses = cc ? cc.split(',').map(addr => addr.trim()).filter(addr => addr) : undefined;

      if (toAddresses.length === 0) {
        setError('Please enter at least one recipient');
        setSending(false);
        return;
      }

      if (replyToMessage) {
        const result = await window.electronAPI.replyToMessage(
          inboxId,
          replyToMessage.id,
          body
        );

        if (!result.success) {
          setError(result.error || 'Failed to send reply');
          setSending(false);
          return;
        }
      } else {
        const message: ComposeMessage = {
          to: toAddresses,
          cc: ccAddresses,
          subject,
          text: body
        };

        const result = await window.electronAPI.sendMessage(inboxId, message);

        if (!result.success) {
          setError(result.error || 'Failed to send message');
          setSending(false);
          return;
        }
      }

      onSendComplete();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setSending(false);
    }
  };

  return (
    <div className="compose-container" onClick={onClose}>
      <div className="compose-window" onClick={(e) => e.stopPropagation()}>
        <div className="compose-header">
          <h2>{replyToMessage ? 'Reply' : 'New Message'}</h2>
          <button className="btn btn-secondary" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSend}>
          <div className="compose-body">
            <div className="form-group">
              <label>To</label>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                required
                disabled={!!replyToMessage}
              />
            </div>

            {!replyToMessage && (
              <>
                <div className="form-group">
                  <label>Cc (optional)</label>
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                  />
                </div>

                <div className="form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    required
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your message here..."
                required
                rows={10}
              />
            </div>

            {error && <div className="error">{error}</div>}
          </div>

          <div className="compose-footer">
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ComposeWindow;
