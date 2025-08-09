import { EventEmitter } from 'events';
import { ATProtoClient } from '../atproto/client.js';
import { E2EEManager, EncryptedMessage, DecryptedMessage } from '../crypto/e2ee.js';
import { FriendManager } from '../social/friendManager.js';
import { MessageStore, StoredMessage, Conversation } from '../storage/messageStore.js';

export interface MessageServiceConfig {
  atProtoService: string;
  dbPath?: string;
}

export interface SendMessageOptions {
  replyTo?: string;
  threadRoot?: string;
  ephemeral?: boolean;
  expiresIn?: number;
}

export class MessageService extends EventEmitter {
  private atClient: ATProtoClient;
  private e2eeManager: E2EEManager;
  private friendManager: FriendManager;
  private messageStore: MessageStore;
  private isInitialized: boolean = false;

  constructor(config: MessageServiceConfig) {
    super();
    
    this.atClient = new ATProtoClient({
      service: config.atProtoService
    });

    this.e2eeManager = new E2EEManager(this.atClient);
    this.friendManager = new FriendManager(this.atClient);
    this.messageStore = new MessageStore(this.atClient, config.dbPath);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.messageStore.on('newMessageToDecrypt', async (encrypted: EncryptedMessage, uri: string) => {
      try {
        const decrypted = await this.e2eeManager.decryptMessage(encrypted);
        await this.messageStore.storeMessage(decrypted, uri);
        this.emit('messageReceived', decrypted);
      } catch (error) {
        console.error('Failed to decrypt message:', error);
        this.emit('decryptionFailed', { encrypted, error });
      }
    });

    this.friendManager.on('userBlocked', async (blocked) => {
      const conversationId = this.getConversationId([
        this.atClient.getDid()!,
        blocked.did
      ]);
      await this.messageStore.deleteConversation(conversationId);
    });
  }

  async initialize(identifier: string, password: string): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Service already initialized');
    }

    await this.atClient.login(identifier, password);
    await this.e2eeManager.initializeKeys();
    await this.friendManager.initialize();
    await this.messageStore.initialize();

    await this.setupMessageSubscription();

    this.isInitialized = true;
    this.emit('initialized');
  }

  private async setupMessageSubscription(): Promise<void> {
    const did = this.atClient.getDid();
    if (!did) return;

    const unsubscribe = await this.atClient.subscribeToRepo(did, async (event: any) => {
      if (event.commit?.ops) {
        for (const op of event.commit.ops) {
          if (op.action === 'create' && op.path?.includes('com.hyperwave.message')) {
            await this.handleIncomingMessage(op.record);
          }
        }
      }
    });

    this.on('shutdown', unsubscribe);
  }

  private async handleIncomingMessage(record: any): Promise<void> {
    try {
      const encrypted = record as EncryptedMessage;
      
      if (encrypted.recipient !== this.atClient.getDid()) {
        return;
      }

      if (this.friendManager.isBlocked(encrypted.sender)) {
        this.emit('blockedMessageReceived', encrypted);
        return;
      }

      const decrypted = await this.e2eeManager.decryptMessage(encrypted);
      const stored = await this.messageStore.storeMessage(decrypted);

      this.emit('messageReceived', stored);
    } catch (error) {
      console.error('Failed to handle incoming message:', error);
      this.emit('messageError', error);
    }
  }

  async sendMessage(
    recipientDidOrHandle: string,
    content: string,
    options: SendMessageOptions = {}
  ): Promise<StoredMessage> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    const recipientDid = await this.atClient.resolveDid(recipientDidOrHandle);

    if (!this.friendManager.canMessage(recipientDid)) {
      throw new Error('Cannot send message to this user (not a friend or blocked)');
    }

    const encrypted = await this.e2eeManager.encryptMessage(
      recipientDid,
      content,
      options.replyTo,
      options.threadRoot
    );

    const uri = await this.atClient.createRecord('com.hyperwave.message', encrypted);

    const decrypted: DecryptedMessage = {
      sender: this.atClient.getDid()!,
      recipient: recipientDid,
      content,
      timestamp: encrypted.timestamp,
      replyTo: options.replyTo,
      threadRoot: options.threadRoot
    };

    const stored = await this.messageStore.storeMessage(decrypted, uri);
    await this.messageStore.markAsDelivered(stored.id);

    this.emit('messageSent', stored);
    return stored;
  }

  async getConversation(participantDidOrHandle: string): Promise<Conversation | undefined> {
    const participantDid = await this.atClient.resolveDid(participantDidOrHandle);
    const conversationId = this.getConversationId([
      this.atClient.getDid()!,
      participantDid
    ]);

    return this.messageStore.getConversation(conversationId);
  }

  async getMessages(participantDidOrHandle: string, limit: number = 50): Promise<StoredMessage[]> {
    const participantDid = await this.atClient.resolveDid(participantDidOrHandle);
    const conversationId = this.getConversationId([
      this.atClient.getDid()!,
      participantDid
    ]);

    return this.messageStore.getMessages({
      conversationId,
      limit
    });
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    await this.messageStore.markAsRead(messageId);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.messageStore.deleteMessage(messageId);
  }

  async searchMessages(query: string): Promise<StoredMessage[]> {
    return this.messageStore.searchMessages(query);
  }

  async getConversations(): Promise<Conversation[]> {
    return this.messageStore.getConversations();
  }

  async addFriend(didOrHandle: string, nickname?: string): Promise<void> {
    await this.friendManager.addFriend(didOrHandle, nickname);
  }

  async removeFriend(didOrHandle: string): Promise<void> {
    await this.friendManager.removeFriend(didOrHandle);
  }

  async blockUser(didOrHandle: string, reason?: string): Promise<void> {
    await this.friendManager.blockUser(didOrHandle, reason);
  }

  async unblockUser(didOrHandle: string): Promise<void> {
    await this.friendManager.unblockUser(didOrHandle);
  }

  getFriends() {
    return this.friendManager.getFriends();
  }

  getBlockedUsers() {
    return this.friendManager.getBlockedUsers();
  }

  private getConversationId(participants: string[]): string {
    return participants.sort().join(':');
  }

  async rotateKeys(): Promise<void> {
    await this.e2eeManager.rotateKeys();
    this.emit('keysRotated');
  }

  async exportData(): Promise<{
    friends: string;
    messages: string;
  }> {
    const friends = await this.friendManager.exportFriendList();
    const messages = await this.messageStore.exportMessages();

    return { friends, messages };
  }

  async getStats() {
    return {
      friends: this.friendManager.getFriends().length,
      blocked: this.friendManager.getBlockedUsers().length,
      ...(await this.messageStore.getMessageStats())
    };
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown');
    await this.messageStore.close();
    this.e2eeManager.clearAllSessions();
    this.isInitialized = false;
  }
}