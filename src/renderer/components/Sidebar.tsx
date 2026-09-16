import React, { useState, useEffect } from 'react';
import { InboxInfo, FolderType } from '../../shared/types';

interface SidebarProps {
  inboxes: InboxInfo[];
  currentInbox: InboxInfo | null;
  currentFolder: FolderType;
  refreshKey: number;
  onInboxChange: (inbox: InboxInfo) => void;
  onFolderChange: (folder: FolderType) => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  inboxes,
  currentInbox,
  currentFolder,
  refreshKey,
  onInboxChange,
  onFolderChange,
  onLogout
}) => {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (currentInbox) {
      loadUnreadCounts();
    }
  }, [currentInbox, refreshKey]);

  const loadUnreadCounts = async () => {
    if (!currentInbox) return;

    const folders = [FolderType.INBOX, FolderType.SENT, FolderType.ARCHIVE];
    const counts: Record<string, number> = {};

    for (const folder of folders) {
      const result = await window.electronAPI.getUnreadCount(currentInbox.id, folder);
      if (result.success) {
        counts[folder] = result.data;
      }
    }

    setUnreadCounts(counts);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>AgentMail</h2>
        {currentInbox && inboxes.length > 0 && (
          <div className="inbox-switcher">
            <select
              value={currentInbox.id}
              onChange={(e) => {
                const inbox = inboxes.find((i) => i.id === e.target.value);
                if (inbox) onInboxChange(inbox);
              }}
            >
              {inboxes.map((inbox) => (
                <option key={inbox.id} value={inbox.id}>
                  {inbox.email}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="folder-list">
        <div
          className={`folder-item ${currentFolder === FolderType.INBOX ? 'active' : ''}`}
          onClick={() => onFolderChange(FolderType.INBOX)}
        >
          <span>Inbox</span>
          {unreadCounts[FolderType.INBOX] > 0 && (
            <span className="unread-badge">{unreadCounts[FolderType.INBOX]}</span>
          )}
        </div>

        <div
          className={`folder-item ${currentFolder === FolderType.SENT ? 'active' : ''}`}
          onClick={() => onFolderChange(FolderType.SENT)}
        >
          <span>Sent</span>
          {unreadCounts[FolderType.SENT] > 0 && (
            <span className="unread-badge">{unreadCounts[FolderType.SENT]}</span>
          )}
        </div>

        <div
          className={`folder-item ${currentFolder === FolderType.ARCHIVE ? 'active' : ''}`}
          onClick={() => onFolderChange(FolderType.ARCHIVE)}
        >
          <span>Archive</span>
          {unreadCounts[FolderType.ARCHIVE] > 0 && (
            <span className="unread-badge">{unreadCounts[FolderType.ARCHIVE]}</span>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
