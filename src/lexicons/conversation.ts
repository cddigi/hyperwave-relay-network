export const conversationLexicon = {
  lexicon: 1,
  id: 'com.hyperwave.conversation',
  defs: {
    main: {
      type: 'record',
      description: 'A conversation between users',
      key: 'tid',
      record: {
        type: 'object',
        required: ['participants', 'createdAt', 'encryptedMetadata'],
        properties: {
          participants: {
            type: 'array',
            items: {
              type: 'string',
              format: 'did'
            },
            description: 'DIDs of conversation participants'
          },
          encryptedMetadata: {
            type: 'bytes',
            description: 'Encrypted conversation metadata (name, settings, etc.)'
          },
          lastMessageAt: {
            type: 'string',
            format: 'datetime',
            description: 'Timestamp of last message'
          },
          createdAt: {
            type: 'string',
            format: 'datetime',
            description: 'Conversation creation timestamp'
          },
          isGroup: {
            type: 'boolean',
            default: false,
            description: 'Whether this is a group conversation'
          }
        }
      }
    }
  }
}