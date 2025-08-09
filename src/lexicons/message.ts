export const messageLexicon = {
  lexicon: 1,
  id: 'com.hyperwave.message',
  defs: {
    main: {
      type: 'record',
      description: 'An encrypted message record',
      key: 'tid',
      record: {
        type: 'object',
        required: ['sender', 'recipient', 'encryptedContent', 'timestamp', 'ephemeralPublicKey', 'nonce'],
        properties: {
          sender: {
            type: 'string',
            format: 'did',
            description: 'DID of the message sender'
          },
          recipient: {
            type: 'string',
            format: 'did',
            description: 'DID of the message recipient'
          },
          encryptedContent: {
            type: 'bytes',
            description: 'Encrypted message content using post-quantum hybrid encryption'
          },
          ephemeralPublicKey: {
            type: 'bytes',
            description: 'Ephemeral public key for this message'
          },
          kemCiphertext: {
            type: 'bytes',
            description: 'Post-quantum KEM ciphertext (Kyber)'
          },
          nonce: {
            type: 'bytes',
            description: 'Nonce for encryption'
          },
          timestamp: {
            type: 'string',
            format: 'datetime',
            description: 'Message timestamp'
          },
          replyTo: {
            type: 'string',
            format: 'at-uri',
            description: 'URI of message being replied to'
          },
          threadRoot: {
            type: 'string',
            format: 'at-uri',
            description: 'Root message of the thread'
          }
        }
      }
    }
  }
}