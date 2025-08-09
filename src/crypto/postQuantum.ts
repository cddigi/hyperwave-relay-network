import { ml_kem1024 } from '@noble/post-quantum/ml-kem';
import sodium from 'libsodium-wrappers';

await sodium.ready;

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface KyberKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface HybridCiphertext {
  kemCiphertext: Uint8Array;
  encryptedData: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  nonce: Uint8Array;
}

export class PostQuantumCrypto {
  private static instance: PostQuantumCrypto;

  private constructor() {}

  static getInstance(): PostQuantumCrypto {
    if (!PostQuantumCrypto.instance) {
      PostQuantumCrypto.instance = new PostQuantumCrypto();
    }
    return PostQuantumCrypto.instance;
  }

  generateKyberKeyPair(): KyberKeyPair {
    const keypair = ml_kem1024.keygen();
    return {
      publicKey: keypair.publicKey,
      privateKey: keypair.secretKey
    };
  }

  generateX25519KeyPair(): KeyPair {
    const keypair = sodium.crypto_box_keypair();
    return {
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey
    };
  }

  generateEd25519KeyPair(): KeyPair {
    const keypair = sodium.crypto_sign_keypair();
    return {
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey
    };
  }

  async hybridEncrypt(
    data: Uint8Array,
    recipientKyberPublicKey: Uint8Array,
    recipientX25519PublicKey: Uint8Array
  ): Promise<HybridCiphertext> {
    const kemResult = ml_kem1024.encapsulate(recipientKyberPublicKey);
    const kemSharedSecret = kemResult.sharedSecret;

    const ephemeralKeyPair = this.generateX25519KeyPair();
    
    const x25519SharedSecret = sodium.crypto_scalarmult(
      ephemeralKeyPair.privateKey,
      recipientX25519PublicKey
    );

    const combinedSecret = new Uint8Array(kemSharedSecret.length + x25519SharedSecret.length);
    combinedSecret.set(kemSharedSecret, 0);
    combinedSecret.set(x25519SharedSecret, kemSharedSecret.length);

    const derivedKey = sodium.crypto_generichash(32, combinedSecret);

    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const encryptedData = sodium.crypto_secretbox_easy(data, nonce, derivedKey);

    sodium.memzero(kemSharedSecret);
    sodium.memzero(x25519SharedSecret);
    sodium.memzero(combinedSecret);
    sodium.memzero(derivedKey);

    return {
      kemCiphertext: kemResult.cipherText,
      encryptedData,
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
      nonce
    };
  }

  async hybridDecrypt(
    ciphertext: HybridCiphertext,
    recipientKyberPrivateKey: Uint8Array,
    recipientX25519PrivateKey: Uint8Array
  ): Promise<Uint8Array> {
    const kemSharedSecret = ml_kem1024.decapsulate(
      ciphertext.kemCiphertext,
      recipientKyberPrivateKey
    );

    const x25519SharedSecret = sodium.crypto_scalarmult(
      recipientX25519PrivateKey,
      ciphertext.ephemeralPublicKey
    );

    const combinedSecret = new Uint8Array(kemSharedSecret.length + x25519SharedSecret.length);
    combinedSecret.set(kemSharedSecret, 0);
    combinedSecret.set(x25519SharedSecret, kemSharedSecret.length);

    const derivedKey = sodium.crypto_generichash(32, combinedSecret);

    const decryptedData = sodium.crypto_secretbox_open_easy(
      ciphertext.encryptedData,
      ciphertext.nonce,
      derivedKey
    );

    sodium.memzero(kemSharedSecret);
    sodium.memzero(x25519SharedSecret);
    sodium.memzero(combinedSecret);
    sodium.memzero(derivedKey);

    return decryptedData;
  }

  sign(data: Uint8Array, privateKey: Uint8Array): Uint8Array {
    return sodium.crypto_sign_detached(data, privateKey);
  }

  verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return sodium.crypto_sign_verify_detached(signature, data, publicKey);
  }

  hash(data: Uint8Array): Uint8Array {
    return sodium.crypto_generichash(32, data);
  }

  deriveKey(password: string, salt: Uint8Array): Uint8Array {
    return sodium.crypto_pwhash(
      32,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );
  }

  generateSalt(): Uint8Array {
    return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  }

  generateNonce(): Uint8Array {
    return sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  }

  encryptWithKey(data: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array {
    return sodium.crypto_secretbox_easy(data, nonce, key);
  }

  decryptWithKey(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array {
    return sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  }

  secureWipe(data: Uint8Array): void {
    sodium.memzero(data);
  }
}