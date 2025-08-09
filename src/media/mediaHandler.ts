import { PostQuantumCrypto } from '../crypto/postQuantum.js';
import { ATProtoClient } from '../atproto/client.js';

export interface MediaMetadata {
  type: 'image' | 'video' | 'file';
  mimeType: string;
  size: number;
  name?: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailRef?: string;
}

export interface EncryptedMedia {
  encryptedData: Uint8Array;
  encryptedKey: Uint8Array;
  nonce: Uint8Array;
  metadata: MediaMetadata;
  blobRef?: string;
}

export class MediaHandler {
  private crypto: PostQuantumCrypto;
  private atClient: ATProtoClient;
  private maxFileSize: number = 100 * 1024 * 1024; // 100MB

  constructor(atClient: ATProtoClient) {
    this.crypto = PostQuantumCrypto.getInstance();
    this.atClient = atClient;
  }

  async encryptMedia(
    data: Uint8Array,
    metadata: MediaMetadata
  ): Promise<EncryptedMedia> {
    if (data.length > this.maxFileSize) {
      throw new Error(`File size exceeds maximum of ${this.maxFileSize} bytes`);
    }

    const key = this.crypto.generateSalt();
    const nonce = this.crypto.generateNonce();
    
    const encryptedData = this.crypto.encryptWithKey(data, key, nonce);
    
    const encryptedKey = new Uint8Array(key);

    return {
      encryptedData,
      encryptedKey,
      nonce,
      metadata
    };
  }

  async decryptMedia(encryptedMedia: EncryptedMedia): Promise<Uint8Array> {
    return this.crypto.decryptWithKey(
      encryptedMedia.encryptedData,
      encryptedMedia.encryptedKey,
      encryptedMedia.nonce
    );
  }

  async uploadEncryptedMedia(encryptedMedia: EncryptedMedia): Promise<string> {
    const blobRef = await this.atClient.uploadBlob(
      encryptedMedia.encryptedData,
      'application/octet-stream'
    );

    encryptedMedia.blobRef = blobRef;
    return blobRef;
  }

  async generateThumbnail(
    _imageData: Uint8Array,
    _maxWidth: number = 200,
    _maxHeight: number = 200
  ): Promise<Uint8Array> {
    // Thumbnail generation placeholder - requires image processing library
    return new Uint8Array(0);
  }

  validateMediaType(mimeType: string): boolean {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'application/pdf',
      'text/plain',
      'application/zip'
    ];

    return allowedTypes.includes(mimeType);
  }

  getMediaType(mimeType: string): 'image' | 'video' | 'file' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'file';
  }

  async compressImage(imageData: Uint8Array, _quality: number = 0.8): Promise<Uint8Array> {
    // Image compression placeholder - requires image processing library
    return imageData;
  }

  sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .slice(0, 255);
  }
}