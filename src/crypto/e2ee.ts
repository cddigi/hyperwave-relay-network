import { PostQuantumCrypto, KeyPair, KyberKeyPair, HybridCiphertext } from './postQuantum.js';
import { ATProtoClient } from '../atproto/client.js';
import { fromString, toString } from 'uint8arrays';

export interface KeyBundle {
  identityKey: KeyPair;
  signedPreKey: KeyPair;
  kyberKey: KyberKeyPair;
  oneTimePreKeys: KeyPair[];
}

export interface PublicKeyBundle {
  did: string;
  identityKey: Uint8Array;
  signedPreKey: Uint8Array;
  signedPreKeySignature: Uint8Array;
  kyberPublicKey: Uint8Array;
  oneTimePreKeys: Uint8Array[];
  signature: Uint8Array;
  createdAt: string;
  expiresAt?: string;
}

export interface EncryptedMessage {
  sender: string;
  recipient: string;
  encryptedContent: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  kemCiphertext: Uint8Array;
  nonce: Uint8Array;
  timestamp: string;
  replyTo?: string;
  threadRoot?: string;
}

export interface DecryptedMessage {
  sender: string;
  recipient: string;
  content: string;
  timestamp: string;
  replyTo?: string;
  threadRoot?: string;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  type: 'image' | 'video' | 'file';
  mimeType: string;
  encryptedData: Uint8Array;
  encryptedKey: Uint8Array;
  size: number;
  name?: string;
  thumbnail?: Uint8Array;
}

export class E2EEManager {
  private crypto: PostQuantumCrypto;
  private atClient: ATProtoClient;
  private keyBundle?: KeyBundle;
  private peerKeyBundles: Map<string, PublicKeyBundle>;
  private sessionKeys: Map<string, Uint8Array>;

  constructor(atClient: ATProtoClient) {
    this.crypto = PostQuantumCrypto.getInstance();
    this.atClient = atClient;
    this.peerKeyBundles = new Map();
    this.sessionKeys = new Map();
  }

  async initializeKeys(): Promise<void> {
    this.keyBundle = {
      identityKey: this.crypto.generateEd25519KeyPair(),
      signedPreKey: this.crypto.generateX25519KeyPair(),
      kyberKey: this.crypto.generateKyberKeyPair(),
      oneTimePreKeys: Array.from({ length: 100 }, () => 
        this.crypto.generateX25519KeyPair()
      )
    };

    await this.publishKeyBundle();
  }

  private async publishKeyBundle(): Promise<void> {
    if (!this.keyBundle) {
      throw new Error('Key bundle not initialized');
    }

    const did = this.atClient.getDid();
    if (!did) {
      throw new Error('Not authenticated');
    }

    const signedPreKeySignature = this.crypto.sign(
      this.keyBundle.signedPreKey.publicKey,
      this.keyBundle.identityKey.privateKey
    );

    const bundleData = new Uint8Array([
      ...this.keyBundle.identityKey.publicKey,
      ...this.keyBundle.signedPreKey.publicKey,
      ...this.keyBundle.kyberKey.publicKey,
      ...this.keyBundle.oneTimePreKeys.flatMap(k => Array.from(k.publicKey))
    ]);

    const signature = this.crypto.sign(bundleData, this.keyBundle.identityKey.privateKey);

    const publicBundle: PublicKeyBundle = {
      did,
      identityKey: this.keyBundle.identityKey.publicKey,
      signedPreKey: this.keyBundle.signedPreKey.publicKey,
      signedPreKeySignature,
      kyberPublicKey: this.keyBundle.kyberKey.publicKey,
      oneTimePreKeys: this.keyBundle.oneTimePreKeys.map(k => k.publicKey),
      signature,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    await this.atClient.createRecord('com.hyperwave.keyBundle', publicBundle);
  }

  async fetchPeerKeyBundle(did: string): Promise<PublicKeyBundle> {
    const cached = this.peerKeyBundles.get(did);
    if (cached && new Date(cached.expiresAt || Date.now() + 1) > new Date()) {
      return cached;
    }

    const records = await this.atClient.listRecords('com.hyperwave.keyBundle', {
      repo: did,
      limit: 1
    });

    if (records.length === 0) {
      throw new Error(`No key bundle found for ${did}`);
    }

    const bundle = records[0].value as PublicKeyBundle;

    const bundleData = new Uint8Array([
      ...bundle.identityKey,
      ...bundle.signedPreKey,
      ...bundle.kyberPublicKey,
      ...bundle.oneTimePreKeys.flatMap(k => Array.from(k))
    ]);

    const isValid = this.crypto.verify(bundleData, bundle.signature, bundle.identityKey);
    if (!isValid) {
      throw new Error(`Invalid key bundle signature for ${did}`);
    }

    this.peerKeyBundles.set(did, bundle);
    return bundle;
  }

  async encryptMessage(
    recipientDid: string,
    content: string,
    replyTo?: string,
    threadRoot?: string
  ): Promise<EncryptedMessage> {
    const senderDid = this.atClient.getDid();
    if (!senderDid) {
      throw new Error('Not authenticated');
    }

    const peerBundle = await this.fetchPeerKeyBundle(recipientDid);
    
    const messageData = JSON.stringify({
      content,
      type: 'text',
      version: '1.0'
    });

    const messageBytes = fromString(messageData, 'utf8');

    const hybridCiphertext = await this.crypto.hybridEncrypt(
      messageBytes,
      peerBundle.kyberPublicKey,
      peerBundle.signedPreKey
    );

    return {
      sender: senderDid,
      recipient: recipientDid,
      encryptedContent: hybridCiphertext.encryptedData,
      ephemeralPublicKey: hybridCiphertext.ephemeralPublicKey,
      kemCiphertext: hybridCiphertext.kemCiphertext,
      nonce: hybridCiphertext.nonce,
      timestamp: new Date().toISOString(),
      replyTo,
      threadRoot
    };
  }

  async decryptMessage(encryptedMessage: EncryptedMessage): Promise<DecryptedMessage> {
    if (!this.keyBundle) {
      throw new Error('Key bundle not initialized');
    }

    const hybridCiphertext: HybridCiphertext = {
      kemCiphertext: encryptedMessage.kemCiphertext,
      encryptedData: encryptedMessage.encryptedContent,
      ephemeralPublicKey: encryptedMessage.ephemeralPublicKey,
      nonce: encryptedMessage.nonce
    };

    const decryptedBytes = await this.crypto.hybridDecrypt(
      hybridCiphertext,
      this.keyBundle.kyberKey.privateKey,
      this.keyBundle.signedPreKey.privateKey
    );

    const messageData = JSON.parse(toString(decryptedBytes, 'utf8'));

    return {
      sender: encryptedMessage.sender,
      recipient: encryptedMessage.recipient,
      content: messageData.content,
      timestamp: encryptedMessage.timestamp,
      replyTo: encryptedMessage.replyTo,
      threadRoot: encryptedMessage.threadRoot
    };
  }

  async establishSession(peerDid: string): Promise<void> {
    if (!this.keyBundle) {
      throw new Error('Key bundle not initialized');
    }

    await this.fetchPeerKeyBundle(peerDid);
    
    const sharedSecret = new Uint8Array(64);
    
    const keyExchange = new Uint8Array(32);
    // Placeholder for actual X25519 key exchange
    // In production, use proper key exchange protocol
    
    sharedSecret.set(keyExchange, 0);
    
    const sessionKey = this.crypto.hash(sharedSecret);
    this.sessionKeys.set(peerDid, sessionKey);
    
    this.crypto.secureWipe(sharedSecret);
  }

  async rotateKeys(): Promise<void> {
    await this.initializeKeys();
  }

  clearSession(peerDid: string): void {
    const sessionKey = this.sessionKeys.get(peerDid);
    if (sessionKey) {
      this.crypto.secureWipe(sessionKey);
      this.sessionKeys.delete(peerDid);
    }
  }

  clearAllSessions(): void {
    for (const [, key] of this.sessionKeys.entries()) {
      this.crypto.secureWipe(key);
    }
    this.sessionKeys.clear();
  }
}