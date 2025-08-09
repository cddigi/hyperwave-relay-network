import { BskyAgent } from '@atproto/api';
import { DidResolver } from '@atproto/identity';
import { AtUri } from '@atproto/syntax';

export interface ATProtoConfig {
  service: string;
  identifier?: string;
  password?: string;
  privateKey?: string;
}

export class ATProtoClient {
  private agent: BskyAgent;
  private didResolver: DidResolver;
  private did?: string;
  private handle?: string;

  constructor(config: ATProtoConfig) {
    this.agent = new BskyAgent({
      service: config.service
    });
    
    this.didResolver = new DidResolver({});
  }

  async login(identifier: string, password: string): Promise<void> {
    const response = await this.agent.login({
      identifier,
      password
    });
    
    this.did = response.data.did;
    this.handle = response.data.handle;
  }

  async createSession(did: string): Promise<void> {
    const resolution = await this.didResolver.resolve(did);
    
    if (!resolution) {
      throw new Error('Failed to resolve DID');
    }
    
    this.did = did;
  }

  async createRecord(collection: string, record: any): Promise<string> {
    if (!this.did) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.api.com.atproto.repo.createRecord({
      repo: this.did,
      collection,
      record
    });

    return response.data.uri;
  }

  async getRecord(uri: string): Promise<any> {
    const parsedUri = new AtUri(uri);
    
    const response = await this.agent.api.com.atproto.repo.getRecord({
      repo: parsedUri.hostname,
      collection: parsedUri.collection,
      rkey: parsedUri.rkey
    });

    return response.data.value;
  }

  async listRecords(collection: string, params?: any): Promise<any[]> {
    if (!this.did) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.api.com.atproto.repo.listRecords({
      repo: this.did,
      collection,
      ...params
    });

    return response.data.records;
  }

  async deleteRecord(uri: string): Promise<void> {
    const parsedUri = new AtUri(uri);
    
    await this.agent.api.com.atproto.repo.deleteRecord({
      repo: parsedUri.hostname,
      collection: parsedUri.collection,
      rkey: parsedUri.rkey
    });
  }

  async updateRecord(uri: string, record: any): Promise<void> {
    const parsedUri = new AtUri(uri);
    
    await this.agent.api.com.atproto.repo.putRecord({
      repo: parsedUri.hostname,
      collection: parsedUri.collection,
      rkey: parsedUri.rkey,
      record
    });
  }

  async resolveDid(handleOrDid: string): Promise<string> {
    if (handleOrDid.startsWith('did:')) {
      return handleOrDid;
    }

    const resolution = await this.didResolver.resolve(handleOrDid);
    if (!resolution) {
      throw new Error(`Failed to resolve handle: ${handleOrDid}`);
    }

    return resolution.id;
  }

  async resolveHandle(did: string): Promise<string | undefined> {
    const resolution = await this.didResolver.resolve(did);
    return resolution?.alsoKnownAs?.[0]?.replace('at://', '');
  }

  async subscribeToRepo(_did: string, _callback: (event: unknown) => void): Promise<() => void> {
    // WebSocket subscription placeholder
    // In production, use proper WebSocket client for Node.js
    
    // Return no-op unsubscribe function
    return () => {
    };
  }

  async uploadBlob(data: Uint8Array, mimeType: string): Promise<string> {
    const response = await this.agent.api.com.atproto.repo.uploadBlob(data, {
      encoding: mimeType
    });

    return response.data.blob.ref.toString();
  }

  getDid(): string | undefined {
    return this.did;
  }

  getHandle(): string | undefined {
    return this.handle;
  }

  getAgent(): BskyAgent {
    return this.agent;
  }
}