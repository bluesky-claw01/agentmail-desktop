import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import MessageDetail from './MessageDetail';
import ComposeWindow from './ComposeWindow';
import { Message, InboxInfo, FolderType } from '../../shared/types';

interface MainAppProps {
  onLogout: () => void;
}

const MainApp: React.FC<MainAppProps> = ({ onLogout }) => {
  const [inboxes, setInboxes] = useState<InboxInfo[]>([]);
  const [currentInbox, setCurrentInbox] = useState<InboxInfo | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderType>(FolderType.INBOX);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadInboxes();
    
    window.electronAPI.onSyncCompleted(() => {
      if (currentInbox) {
        loadMessages(currentInbox.id, currentFolder);
      }
    });
  }, []);

  useEffect(() => {
    if (currentInbox) {
      loadMessages(currentInbox.id, currentFolder);
    }
  }, [currentInbox, currentFolder]);

  const loadInboxes = async () => {
    const result = await window.electronAPI.getSelectedInboxes();
    if (result.success && result.data.length > 0) {
      setInboxes(result.data);
      setCurrentInbox(result.data[0]);
    }
  };

  const loadMessages = async (inboxId: string, folder: string) => {
    setLoading(true);
    const result = await window.electronAPI.getMessages(inboxId, folder);
    if (result.success) {
      setMessages(result.data);
    }
    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    const result = await window.electronAPI.syncMessages();
    if (result.success && currentInbox) {
      await loadMessages(currentInbox.id, currentFolder);
    }
    setSyncing(false);
  };

  const handleMessageSelect = async (message: Message) => {
    setSelectedMessage(message);
    if (message.unread) {
      await window.electronAPI.markAsRead(message.id);
      setMessages(prev => 
        prev.map(msg => msg.id === message.id ? { ...msg, unread: false } : msg)
      );
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!currentInbox) return;
    
    if (!confirm('Are you sure you want to permanently delete this message from AgentMail cloud and local storage?')) {
      return;
    }

    const result = await window.electronAPI.deleteMessage(currentInbox.id, messageId);
    if (result.success) {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
    }
  };

  const handleCompose = () => {
    setIsComposing(true);
    setIsReplying(false);
  };

  const handleReply = () => {
    if (selectedMessage) {
      setIsReplying(true);
      setIsComposing(true);
    }
  };

  const handleComposeClose = () => {
    setIsComposing(false);
    setIsReplying(false);
  };

  const handleSendComplete = async () => {
    setIsComposing(false);
    setIsReplying(false);
    if (currentInbox) {
      await handleSync();
    }
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out? Your API key will be removed.')) {
      await window.electronAPI.clearApiKey();
      onLogout();
    }
  };

  return (
    <div className="app">
      <Sidebar
        inboxes={inboxes}
        currentInbox={currentInbox}
        currentFolder={currentFolder}
        onInboxChange={setCurrentInbox}
        onFolderChange={setCurrentFolder}
        onLogout={handleLogout}
      />
      
      <div className="main-content">
        <div className="toolbar">
          <button className="btn btn-primary" onClick={handleCompose}>
            Compose
          </button>
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          {selectedMessage && (
            <>
              <button className="btn btn-secondary" onClick={handleReply}>
                Reply
              </button>
              <button 
                className="btn btn-danger" 
                onClick={() => handleDeleteMessage(selectedMessage.id)}
              >
                Delete
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <MessageList
            messages={messages}
            selectedMessage={selectedMessage}
            onMessageSelect={handleMessageSelect}
            loading={loading}
          />
          
          {selectedMessage && (
            <MessageDetail message={selectedMessage} />
          )}
        </div>
      </div>

      {isComposing && currentInbox && (
        <ComposeWindow
          inboxId={currentInbox.id}
          replyToMessage={isReplying ? selectedMessage : undefined}
          onClose={handleComposeClose}
          onSendComplete={handleSendComplete}
        />
      )}
    </div>
  );
};

export default MainApp;
