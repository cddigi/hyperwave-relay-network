export const keyBundleLexicon = {
  lexicon: 1,
  id: 'com.hyperwave.keyBundle',
  defs: {
    main: {
      type: 'record',
      description: 'Public key bundle for post-quantum secure messaging',
      key: 'literal:self',
      record: {
        type: 'object',
        required: ['identityKey', 'signedPreKey', 'kyberPublicKey', 'signature', 'createdAt'],
        properties: {
          identityKey: {
            type: 'bytes',
            description: 'Long-term Ed25519 identity key'
          },
          signedPreKey: {
            type: 'bytes',
            description: 'Medium-term signed X25519 pre-key'
          },
          signedPreKeySignature: {
            type: 'bytes',
            description: 'Signature of the signed pre-key'
          },
          kyberPublicKey: {
            type: 'bytes',
            description: 'Post-quantum Kyber-1024 public key'
          },
          oneTimePreKeys: {
            type: 'array',
            items: {
              type: 'bytes'
            },
            description: 'One-time X25519 pre-keys'
          },
          signature: {
            type: 'bytes',
            description: 'Signature of the entire key bundle'
          },
          createdAt: {
            type: 'string',
            format: 'datetime',
            description: 'Key bundle creation timestamp'
          },
          expiresAt: {
            type: 'string',
            format: 'datetime',
            description: 'Key bundle expiration timestamp'
          }
        }
      }
    }
  }
}