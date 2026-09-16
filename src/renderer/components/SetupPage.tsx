import React, { useState } from 'react';
import { InboxInfo } from '../../shared/types';

interface SetupPageProps {
  onComplete: () => void;
}

const SetupPage: React.FC<SetupPageProps> = ({ onComplete }) => {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inboxes, setInboxes] = useState<InboxInfo[]>([]);
  const [selectedInboxIds, setSelectedInboxIds] = useState<string[]>([]);
  const [step, setStep] = useState<'api-key' | 'select-inboxes'>('api-key');

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await window.electronAPI.setApiKey(apiKey.trim());

      if (!result.success) {
        setError(result.error || 'Failed to validate API key');
        setLoading(false);
        return;
      }

      const inboxesResult = await window.electronAPI.listInboxes();

      if (!inboxesResult.success) {
        const inboxError = inboxesResult.error || 'Failed to load inboxes';
        setError(inboxError);
        setLoading(false);
        return;
      }

      setInboxes(inboxesResult.data);
      setStep('select-inboxes');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInboxSelection = (inboxId: string) => {
    setSelectedInboxIds(prev => {
      if (prev.includes(inboxId)) {
        return prev.filter(id => id !== inboxId);
      } else if (prev.length < 3) {
        return [...prev, inboxId];
      }
      return prev;
    });
  };

  const handleInboxesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedInboxIds.length === 0) {
      setError('Please select at least one inbox');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await window.electronAPI.saveSelectedInboxes(selectedInboxIds, inboxes);
      
      if (!result.success) {
        setError(result.error || 'Failed to save selected inboxes');
        setLoading(false);
        return;
      }

      await window.electronAPI.syncMessages();
      onComplete();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="setup-container">
      <div className="setup-card">
        {step === 'api-key' ? (
          <>
            <h1>Welcome to AgentMail Desktop</h1>
            <p>Enter your AgentMail API Key to get started</p>
            
            <form onSubmit={handleApiKeySubmit}>
              <div className="form-group">
                <label htmlFor="apiKey">API Key</label>
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  required
                />
              </div>

              {error && <div className="error">{error}</div>}

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Validating...' : 'Continue'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>Select Inboxes</h1>
            <p>Choose up to 3 inboxes to use with this client</p>
            
            <form onSubmit={handleInboxesSubmit}>
              <div className="inbox-selector">
                <div className="inbox-list">
                  {inboxes.map(inbox => (
                    <div key={inbox.id} className="inbox-item">
                      <input
                        type="checkbox"
                        id={`inbox-${inbox.id}`}
                        checked={selectedInboxIds.includes(inbox.id)}
                        onChange={() => handleInboxSelection(inbox.id)}
                        disabled={!selectedInboxIds.includes(inbox.id) && selectedInboxIds.length >= 3}
                      />
                      <label htmlFor={`inbox-${inbox.id}`}>
                        <strong>{inbox.email}</strong>
                        {inbox.name && <span> ({inbox.name})</span>}
                      </label>
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                  Selected: {selectedInboxIds.length} / 3
                </p>
              </div>

              {error && <div className="error">{error}</div>}

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep('api-key')}
                  disabled={loading}
                >
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Setting up...' : 'Complete Setup'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default SetupPage;
