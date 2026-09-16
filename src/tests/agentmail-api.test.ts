import { AgentMailAPI } from '../main/agentmail-api';
import { FolderType } from '../shared/types';

jest.mock('agentmail', () => {
  return {
    AgentMailClient: jest.fn().mockImplementation(() => ({
      inboxes: {
        list: jest.fn().mockResolvedValue({
          data: [
            { id: 'inbox1', email: 'test1@agentmail.to', name: 'Test Inbox 1' },
            { id: 'inbox2', email: 'test2@agentmail.to', name: 'Test Inbox 2' }
          ]
        }),
        messages: {
          list: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'msg1',
                threadId: 'thread1',
                from: { email: 'sender@example.com' },
                to: [{ email: 'recipient@example.com' }],
                subject: 'Test Message',
                text: 'Hello, world!',
                date: new Date().toISOString(),
                labels: ['unread']
              }
            ]
          }),
          send: jest.fn().mockResolvedValue({
            messageId: 'new-msg-id'
          }),
          reply: jest.fn().mockResolvedValue({
            messageId: 'reply-msg-id'
          }),
          delete: jest.fn().mockResolvedValue(undefined)
        }
      }
    }))
  };
});

describe('AgentMailAPI', () => {
  let api: AgentMailAPI;

  beforeEach(() => {
    api = new AgentMailAPI();
    api.setApiKey('test-api-key');
  });

  test('should validate API key', async () => {
    const isValid = await api.validateApiKey();
    expect(isValid).toBe(true);
  });

  test('should list inboxes', async () => {
    const inboxes = await api.listInboxes();
    
    expect(inboxes).toHaveLength(2);
    expect(inboxes[0].id).toBe('inbox1');
    expect(inboxes[0].email).toBe('test1@agentmail.to');
  });

  test('should list messages and map folder correctly', async () => {
    const messages = await api.listMessages('inbox1');
    
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('msg1');
    expect(messages[0].from).toBe('sender@example.com');
    expect(messages[0].folder).toBe(FolderType.INBOX);
    expect(messages[0].unread).toBe(true);
  });

  test('should send message', async () => {
    const messageId = await api.sendMessage('inbox1', {
      to: ['recipient@example.com'],
      subject: 'Test',
      text: 'Hello'
    });
    
    expect(messageId).toBe('new-msg-id');
  });

  test('should reply to message', async () => {
    const messageId = await api.replyToMessage('inbox1', 'msg1', 'Reply text');
    
    expect(messageId).toBe('reply-msg-id');
  });

  test('should delete message via API', async () => {
    await expect(api.deleteMessage('inbox1', 'msg1')).resolves.not.toThrow();
  });

  test('should throw error when API key not set', async () => {
    const newApi = new AgentMailAPI();
    
    await expect(newApi.listInboxes()).rejects.toThrow('API key not set');
  });
});
