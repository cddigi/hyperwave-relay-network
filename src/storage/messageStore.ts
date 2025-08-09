import { Level } from 'level';
import { EventEmitter } from 'events';
import { DecryptedMessage, EncryptedMessage } from '../crypto/e2ee.js';
import { ATProtoClient } from '../atproto/client.js';

export interface StoredMessage extends DecryptedMessage {
  id: string;
  conversationId: string;
  isRead: boolean;
  isSent: boolean;
  isDelivered: boolean;
  uri?: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessageAt: string;
  createdAt: string;
  isGroup: boolean;
  name?: string;
  unreadCount: number;
}

export interface MessageFilter {
  conversationId?: string;
  sender?: string;
  recipient?: string;
  startDate?: Date;
  endDate?: Date;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

export class MessageStore extends EventEmitter {
  private db: Level<string, unknown>;
  private atClient: ATProtoClient;
  private conversations: Map<string, Conversation>;
  private messageCache: Map<string, StoredMessage>;
  private syncInterval?: NodeJS.Timeout;

  constructor(atClient: ATProtoClient, dbPath: string = './data/messages') {
    super();
    this.atClient = atClient;
    this.db = new Level(dbPath, { valueEncoding: 'json' });
    this.conversations = new Map();
    this.messageCache = new Map();
  }

  async initialize(): Promise<void> {
    await this.db.open();
    await this.loadConversations();
    await this.startSync();
  }

  async close(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    await this.db.close();
  }

  private async loadConversations(): Promise<void> {
    try {
      const conversations = await this.db.get('conversations').catch(() => []) as Conversation[];
      for (const conv of conversations) {
        this.conversations.set(conv.id, conv);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }

  private async saveConversations(): Promise<void> {
    const conversations = Array.from(this.conversations.values());
    await this.db.put('conversations', conversations);
  }

  async storeMessage(message: DecryptedMessage, uri?: string): Promise<StoredMessage> {
    const conversationId = this.getConversationId([message.sender, message.recipient]);
    const messageId = this.generateMessageId();

    const storedMessage: StoredMessage = {
      ...message,
      id: messageId,
      conversationId,
      isRead: false,
      isSent: message.sender === this.atClient.getDid(),
      isDelivered: false,
      uri
    };

    await this.db.put(`message:${messageId}`, storedMessage);
    this.messageCache.set(messageId, storedMessage);

    await this.updateConversation(conversationId, message);

    this.emit('messageStored', storedMessage);
    return storedMessage;
  }

  private getConversationId(participants: string[]): string {
    return participants.sort().join(':');
  }

  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async updateConversation(conversationId: string, message: DecryptedMessage): Promise<void> {
    let conversation = this.conversations.get(conversationId);

    if (!conversation) {
      conversation = {
        id: conversationId,
        participants: [message.sender, message.recipient].filter((v, i, a) => a.indexOf(v) === i),
        lastMessageAt: message.timestamp,
        createdAt: message.timestamp,
        isGroup: false,
        unreadCount: 0
      };
    }

    conversation.lastMessageAt = message.timestamp;
    
    if (message.recipient === this.atClient.getDid()) {
      conversation.unreadCount++;
    }

    this.conversations.set(conversationId, conversation);
    await this.saveConversations();

    this.emit('conversationUpdated', conversation);
  }

  async getMessages(filter: MessageFilter): Promise<StoredMessage[]> {
    const messages: StoredMessage[] = [];
    const iterator = this.db.iterator({
      gte: 'message:',
      lte: 'message:~'
    });

    try {
      for await (const [, value] of iterator) {
        const message = value as StoredMessage;

        if (filter.conversationId && message.conversationId !== filter.conversationId) continue;
        if (filter.sender && message.sender !== filter.sender) continue;
        if (filter.recipient && message.recipient !== filter.recipient) continue;
        if (filter.isRead !== undefined && message.isRead !== filter.isRead) continue;
        
        if (filter.startDate && new Date(message.timestamp) < filter.startDate) continue;
        if (filter.endDate && new Date(message.timestamp) > filter.endDate) continue;

        messages.push(message);

        if (filter.limit && messages.length >= filter.limit) break;
      }
    } finally {
      await iterator.close();
    }

    return messages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async getMessage(messageId: string): Promise<StoredMessage | null> {
    try {
      const cached = this.messageCache.get(messageId);
      if (cached) return cached;

      const message = await this.db.get(`message:${messageId}`) as StoredMessage;
      this.messageCache.set(messageId, message);
      return message;
    } catch {
      return null;
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    const message = await this.getMessage(messageId);
    if (!message) return;

    message.isRead = true;
    await this.db.put(`message:${messageId}`, message);
    this.messageCache.set(messageId, message);

    const conversation = this.conversations.get(message.conversationId);
    if (conversation && conversation.unreadCount > 0) {
      conversation.unreadCount--;
      await this.saveConversations();
      this.emit('conversationUpdated', conversation);
    }

    this.emit('messageRead', message);
  }

  async markAsDelivered(messageId: string): Promise<void> {
    const message = await this.getMessage(messageId);
    if (!message) return;

    message.isDelivered = true;
    await this.db.put(`message:${messageId}`, message);
    this.messageCache.set(messageId, message);

    this.emit('messageDelivered', message);
  }

  async deleteMessage(messageId: string): Promise<void> {
    const message = await this.getMessage(messageId);
    if (!message) return;

    await this.db.del(`message:${messageId}`);
    this.messageCache.delete(messageId);

    if (message.uri) {
      try {
        await this.atClient.deleteRecord(message.uri);
      } catch (error) {
        console.error('Failed to delete message from AT Protocol:', error);
      }
    }

    this.emit('messageDeleted', message);
  }

  async getConversation(conversationId: string): Promise<Conversation | undefined> {
    return this.conversations.get(conversationId);
  }

  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .sort((a, b) => 
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const messages = await this.getMessages({ conversationId });
    
    for (const message of messages) {
      await this.deleteMessage(message.id);
    }

    this.conversations.delete(conversationId);
    await this.saveConversations();

    this.emit('conversationDeleted', conversationId);
  }

  async searchMessages(query: string): Promise<StoredMessage[]> {
    const messages: StoredMessage[] = [];
    const lowerQuery = query.toLowerCase();
    const iterator = this.db.iterator({
      gte: 'message:',
      lte: 'message:~'
    });

    try {
      for await (const [, value] of iterator) {
        const message = value as StoredMessage;
        if (message.content.toLowerCase().includes(lowerQuery)) {
          messages.push(message);
        }
      }
    } finally {
      await iterator.close();
    }

    return messages;
  }

  private async startSync(): Promise<void> {
    await this.syncMessages();
    
    this.syncInterval = setInterval(async () => {
      await this.syncMessages();
    }, 30000);
  }

  private async syncMessages(): Promise<void> {
    try {
      const did = this.atClient.getDid();
      if (!did) return;

      const records = await this.atClient.listRecords('com.hyperwave.message', {
        limit: 100
      });

      for (const record of records) {
        const encryptedMessage = record.value as EncryptedMessage;
        
        const existingMessages = await this.getMessages({
          sender: encryptedMessage.sender,
          recipient: encryptedMessage.recipient,
          startDate: new Date(new Date(encryptedMessage.timestamp).getTime() - 1000),
          endDate: new Date(new Date(encryptedMessage.timestamp).getTime() + 1000)
        });

        if (existingMessages.length === 0) {
          this.emit('newMessageToDecrypt', encryptedMessage, record.uri);
        }
      }
    } catch (error) {
      console.error('Failed to sync messages:', error);
    }
  }

  async exportMessages(conversationId?: string): Promise<string> {
    const messages = await this.getMessages({ conversationId });
    return JSON.stringify(messages, null, 2);
  }

  async getMessageStats(): Promise<{
    totalMessages: number;
    unreadMessages: number;
    conversations: number;
    oldestMessage?: string;
    newestMessage?: string;
  }> {
    const messages = await this.getMessages({});
    const unread = messages.filter(m => !m.isRead && m.recipient === this.atClient.getDid());

    return {
      totalMessages: messages.length,
      unreadMessages: unread.length,
      conversations: this.conversations.size,
      oldestMessage: messages[0]?.timestamp,
      newestMessage: messages[messages.length - 1]?.timestamp
    };
  }
}