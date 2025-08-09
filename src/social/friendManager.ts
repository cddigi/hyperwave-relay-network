import { ATProtoClient } from '../atproto/client.js';
import { EventEmitter } from 'events';

export interface Friend {
  did: string;
  handle?: string;
  nickname?: string;
  addedAt: string;
  trustLevel: number;
}

export interface BlockedUser {
  did: string;
  handle?: string;
  blockedAt: string;
  reason?: string;
}

export interface FriendList {
  friends: Friend[];
  blocked: BlockedUser[];
  updatedAt: string;
}

export enum TrustLevel {
  UNTRUSTED = 0,
  LOW = 25,
  MEDIUM = 50,
  HIGH = 75,
  FULL = 100
}

export class FriendManager extends EventEmitter {
  private atClient: ATProtoClient;
  private friendList: FriendList;
  private friendListUri?: string;

  constructor(atClient: ATProtoClient) {
    super();
    this.atClient = atClient;
    this.friendList = {
      friends: [],
      blocked: [],
      updatedAt: new Date().toISOString()
    };
  }

  async initialize(): Promise<void> {
    await this.loadFriendList();
  }

  private async loadFriendList(): Promise<void> {
    try {
      const records = await this.atClient.listRecords('com.hyperwave.friendList', {
        limit: 1
      });

      if (records.length > 0) {
        this.friendListUri = records[0].uri;
        this.friendList = records[0].value as FriendList;
        
        for (const friend of this.friendList.friends) {
          if (!friend.handle) {
            friend.handle = await this.atClient.resolveHandle(friend.did);
          }
        }
      } else {
        await this.saveFriendList();
      }
    } catch (error) {
      console.error('Failed to load friend list:', error);
      await this.saveFriendList();
    }
  }

  private async saveFriendList(): Promise<void> {
    this.friendList.updatedAt = new Date().toISOString();

    if (this.friendListUri) {
      await this.atClient.updateRecord(this.friendListUri, this.friendList);
    } else {
      this.friendListUri = await this.atClient.createRecord(
        'com.hyperwave.friendList',
        this.friendList
      );
    }

    this.emit('friendListUpdated', this.friendList);
  }

  async addFriend(
    didOrHandle: string,
    nickname?: string,
    trustLevel: TrustLevel = TrustLevel.MEDIUM
  ): Promise<Friend> {
    const did = await this.atClient.resolveDid(didOrHandle);
    const handle = didOrHandle.startsWith('did:') 
      ? await this.atClient.resolveHandle(did)
      : didOrHandle;

    const existingFriend = this.friendList.friends.find(f => f.did === did);
    if (existingFriend) {
      throw new Error('User is already a friend');
    }

    const blockedUser = this.friendList.blocked.find(b => b.did === did);
    if (blockedUser) {
      throw new Error('Cannot add blocked user as friend');
    }

    const friend: Friend = {
      did,
      handle,
      nickname,
      addedAt: new Date().toISOString(),
      trustLevel
    };

    this.friendList.friends.push(friend);
    await this.saveFriendList();

    this.emit('friendAdded', friend);
    return friend;
  }

  async removeFriend(didOrHandle: string): Promise<void> {
    const did = await this.atClient.resolveDid(didOrHandle);
    
    const index = this.friendList.friends.findIndex(f => f.did === did);
    if (index === -1) {
      throw new Error('User is not a friend');
    }

    const removed = this.friendList.friends.splice(index, 1)[0];
    await this.saveFriendList();

    this.emit('friendRemoved', removed);
  }

  async blockUser(didOrHandle: string, reason?: string): Promise<BlockedUser> {
    const did = await this.atClient.resolveDid(didOrHandle);
    const handle = didOrHandle.startsWith('did:') 
      ? await this.atClient.resolveHandle(did)
      : didOrHandle;

    const existingBlock = this.friendList.blocked.find(b => b.did === did);
    if (existingBlock) {
      throw new Error('User is already blocked');
    }

    const friendIndex = this.friendList.friends.findIndex(f => f.did === did);
    if (friendIndex !== -1) {
      this.friendList.friends.splice(friendIndex, 1);
    }

    const blockedUser: BlockedUser = {
      did,
      handle,
      blockedAt: new Date().toISOString(),
      reason
    };

    this.friendList.blocked.push(blockedUser);
    await this.saveFriendList();

    this.emit('userBlocked', blockedUser);
    return blockedUser;
  }

  async unblockUser(didOrHandle: string): Promise<void> {
    const did = await this.atClient.resolveDid(didOrHandle);
    
    const index = this.friendList.blocked.findIndex(b => b.did === did);
    if (index === -1) {
      throw new Error('User is not blocked');
    }

    const unblocked = this.friendList.blocked.splice(index, 1)[0];
    await this.saveFriendList();

    this.emit('userUnblocked', unblocked);
  }

  async updateFriendTrust(didOrHandle: string, trustLevel: TrustLevel): Promise<void> {
    const did = await this.atClient.resolveDid(didOrHandle);
    
    const friend = this.friendList.friends.find(f => f.did === did);
    if (!friend) {
      throw new Error('User is not a friend');
    }

    friend.trustLevel = trustLevel;
    await this.saveFriendList();

    this.emit('trustLevelUpdated', { friend, trustLevel });
  }

  async updateFriendNickname(didOrHandle: string, nickname: string): Promise<void> {
    const did = await this.atClient.resolveDid(didOrHandle);
    
    const friend = this.friendList.friends.find(f => f.did === did);
    if (!friend) {
      throw new Error('User is not a friend');
    }

    friend.nickname = nickname;
    await this.saveFriendList();

    this.emit('nicknameUpdated', { friend, nickname });
  }

  isFriend(did: string): boolean {
    return this.friendList.friends.some(f => f.did === did);
  }

  isBlocked(did: string): boolean {
    return this.friendList.blocked.some(b => b.did === did);
  }

  canMessage(did: string): boolean {
    return this.isFriend(did) && !this.isBlocked(did);
  }

  getFriend(did: string): Friend | undefined {
    return this.friendList.friends.find(f => f.did === did);
  }

  getFriends(): Friend[] {
    return [...this.friendList.friends];
  }

  getBlockedUsers(): BlockedUser[] {
    return [...this.friendList.blocked];
  }

  getFriendsByTrustLevel(minTrustLevel: TrustLevel): Friend[] {
    return this.friendList.friends.filter(f => f.trustLevel >= minTrustLevel);
  }

  async searchFriends(query: string): Promise<Friend[]> {
    const lowerQuery = query.toLowerCase();
    return this.friendList.friends.filter(f => 
      f.handle?.toLowerCase().includes(lowerQuery) ||
      f.nickname?.toLowerCase().includes(lowerQuery) ||
      f.did.toLowerCase().includes(lowerQuery)
    );
  }

  async exportFriendList(): Promise<string> {
    return JSON.stringify(this.friendList, null, 2);
  }

  async importFriendList(data: string): Promise<void> {
    try {
      const imported = JSON.parse(data) as FriendList;
      
      for (const friend of imported.friends) {
        if (!this.isFriend(friend.did)) {
          this.friendList.friends.push(friend);
        }
      }

      for (const blocked of imported.blocked) {
        if (!this.isBlocked(blocked.did)) {
          this.friendList.blocked.push(blocked);
        }
      }

      await this.saveFriendList();
    } catch (error) {
      throw new Error(`Failed to import friend list: ${error}`);
    }
  }
}