import React, { useState, useEffect, useRef } from 'react';
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
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const currentInboxRef = useRef<InboxInfo | null>(null);
  const currentFolderRef = useRef<FolderType>(currentFolder);

  useEffect(() => {
    currentInboxRef.current = currentInbox;
  }, [currentInbox]);

  useEffect(() => {
    currentFolderRef.current = currentFolder;
  }, [currentFolder]);

  useEffect(() => {
    setSelectedMessageIds([]);
    setSelectedMessage(null);
  }, [currentInbox?.id, currentFolder]);

  useEffect(() => {
    loadInboxes();

    const handleSyncCompleted = () => {
      const inbox = currentInboxRef.current;
      const folder = currentFolderRef.current;
      if (inbox) {
        loadMessages(inbox.id, folder);
        setSelectedMessageIds([]);
        refreshSidebarCounts();
      }
    };

    window.electronAPI.onSyncCompleted(handleSyncCompleted);
  }, []);

  useEffect(() => {
    if (currentInbox) {
      loadMessages(currentInbox.id, currentFolder);
    }
  }, [currentInbox, currentFolder]);

  const refreshSidebarCounts = () => {
    setSidebarRefreshKey((prev) => prev + 1);
  };

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
      setSelectedMessageIds([]);
      refreshSidebarCounts();
    }
    setSyncing(false);
  };

  const handleMessageSelect = async (message: Message) => {
    setSelectedMessage(message);
    if (message.unread) {
      const result = await window.electronAPI.markAsRead(message.id);
      if (result.success) {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === message.id ? { ...msg, unread: false } : msg))
        );
        refreshSidebarCounts();
      }
    }
  };

  const handleMessageCheck = (messageId: string, checked: boolean) => {
    setSelectedMessageIds((prev) => {
      if (checked) {
        return prev.includes(messageId) ? prev : [...prev, messageId];
      }
      return prev.filter((id) => id !== messageId);
    });
  };

  const handleSelectAllShown = (messageIds: string[], checked: boolean) => {
    setSelectedMessageIds((prev) => {
      if (checked) {
        const merged = new Set([...prev, ...messageIds]);
        return Array.from(merged);
      }
      return prev.filter((id) => !messageIds.includes(id));
    });
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!currentInbox) return;

    if (
      !confirm(
        'Are you sure you want to permanently delete this message from AgentMail cloud and local storage?'
      )
    ) {
      return;
    }

    const result = await window.electronAPI.deleteMessage(currentInbox.id, messageId);
    if (result.success) {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setSelectedMessageIds((prev) => prev.filter((id) => id !== messageId));
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
      refreshSidebarCounts();
      if (result.disposition === 'remote_missing') {
        alert('Message no longer exists on AgentMail.\nLocal cached copy was removed.');
      }
    } else {
      alert(result.error || 'Failed to delete message');
    }
  };

  const handleBatchDelete = async () => {
    if (!currentInbox || selectedMessageIds.length === 0 || deleting) return;

    const count = selectedMessageIds.length;
    if (
      !confirm(
        `Are you sure you want to permanently delete ${count} selected messages from AgentMail cloud and local storage?`
      )
    ) {
      return;
    }

    setDeleting(true);
    const idsToDelete = [...selectedMessageIds];
    const succeededIds: string[] = [];
    const failedIds: string[] = [];

    for (const messageId of idsToDelete) {
      const result = await window.electronAPI.deleteMessage(currentInbox.id, messageId);
      if (result.success) {
        succeededIds.push(messageId);
      } else {
        failedIds.push(messageId);
      }
    }

    if (succeededIds.length > 0) {
      const succeededSet = new Set(succeededIds);
      setMessages((prev) => prev.filter((msg) => !succeededSet.has(msg.id)));
      setSelectedMessageIds(failedIds);
      if (selectedMessage && succeededSet.has(selectedMessage.id)) {
        setSelectedMessage(null);
      }
      refreshSidebarCounts();
    }

    setDeleting(false);

    if (failedIds.length > 0) {
      alert(
        `Deleted ${succeededIds.length} messages.\n${failedIds.length} messages could not be deleted.`
      );
    }
  };

  const handleToolbarDelete = () => {
    if (selectedMessageIds.length > 0) {
      handleBatchDelete();
      return;
    }
    if (selectedMessage) {
      handleDeleteMessage(selectedMessage.id);
    }
  };

  const handleArchive = async () => {
    if (!currentInbox || currentFolder !== FolderType.INBOX || archiving || deleting) return;

    const idsToArchive =
      selectedMessageIds.length > 0
        ? [...selectedMessageIds]
        : selectedMessage
          ? [selectedMessage.id]
          : [];

    if (idsToArchive.length === 0) return;

    setArchiving(true);
    const result = await window.electronAPI.archiveMessages(currentInbox.id, idsToArchive);
    setArchiving(false);

    if (!result.success) {
      alert(result.error || 'Failed to archive messages');
      return;
    }

    const archivedSet = new Set(idsToArchive);
    setSelectedMessageIds([]);
    if (selectedMessage && archivedSet.has(selectedMessage.id)) {
      setSelectedMessage(null);
    }
    await loadMessages(currentInbox.id, currentFolder);
    refreshSidebarCounts();
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

  const showDeleteButton = selectedMessageIds.length > 0 || !!selectedMessage;
  const deleteLabel =
    selectedMessageIds.length > 0
      ? deleting
        ? 'Deleting...'
        : `Delete (${selectedMessageIds.length})`
      : 'Delete';

  const showArchiveButton =
    currentFolder === FolderType.INBOX &&
    (selectedMessageIds.length > 0 || !!selectedMessage);
  const archiveLabel =
    selectedMessageIds.length > 0
      ? archiving
        ? 'Archiving...'
        : `Archive (${selectedMessageIds.length})`
      : archiving
        ? 'Archiving...'
        : 'Archive';

  const busy = deleting || archiving;

  return (
    <div className="app">
      <Sidebar
        inboxes={inboxes}
        currentInbox={currentInbox}
        currentFolder={currentFolder}
        refreshKey={sidebarRefreshKey}
        onInboxChange={setCurrentInbox}
        onFolderChange={setCurrentFolder}
        onLogout={handleLogout}
      />

      <div className="main-content">
        <div className="toolbar">
          <button className="btn btn-primary" onClick={handleCompose}>
            Compose
          </button>
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing || busy}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          {selectedMessage && selectedMessageIds.length === 0 && (
            <button className="btn btn-secondary" onClick={handleReply} disabled={busy}>
              Reply
            </button>
          )}
          {showArchiveButton && (
            <button className="btn btn-secondary" onClick={handleArchive} disabled={busy}>
              {archiveLabel}
            </button>
          )}
          {showDeleteButton && (
            <button
              className="btn btn-danger"
              onClick={handleToolbarDelete}
              disabled={busy}
            >
              {deleteLabel}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <MessageList
            messages={messages}
            selectedMessage={selectedMessage}
            selectedMessageIds={selectedMessageIds}
            onMessageSelect={handleMessageSelect}
            onMessageCheck={handleMessageCheck}
            onSelectAllShown={handleSelectAllShown}
            loading={loading}
            selectionDisabled={busy}
          />

          {selectedMessage && <MessageDetail message={selectedMessage} />}
        </div>
      </div>

      {isComposing && currentInbox && (
        <ComposeWindow
          inboxId={currentInbox.id}
          replyToMessage={isReplying ? selectedMessage ?? undefined : undefined}
          onClose={handleComposeClose}
          onSendComplete={handleSendComplete}
        />
      )}
    </div>
  );
};

export default MainApp;
