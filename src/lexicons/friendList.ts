export const friendListLexicon = {
  lexicon: 1,
  id: 'com.hyperwave.friendList',
  defs: {
    main: {
      type: 'record',
      description: 'Friend list for secure messaging',
      key: 'literal:self',
      record: {
        type: 'object',
        required: ['friends', 'blocked', 'updatedAt'],
        properties: {
          friends: {
            type: 'array',
            items: {
              type: 'object',
              required: ['did', 'addedAt'],
              properties: {
                did: {
                  type: 'string',
                  format: 'did',
                  description: 'Friend DID'
                },
                nickname: {
                  type: 'string',
                  description: 'Optional nickname for friend'
                },
                addedAt: {
                  type: 'string',
                  format: 'datetime',
                  description: 'When friend was added'
                },
                trustLevel: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 100,
                  default: 50,
                  description: 'Trust level for this friend'
                }
              }
            },
            description: 'List of friends'
          },
          blocked: {
            type: 'array',
            items: {
              type: 'object',
              required: ['did', 'blockedAt'],
              properties: {
                did: {
                  type: 'string',
                  format: 'did',
                  description: 'Blocked user DID'
                },
                blockedAt: {
                  type: 'string',
                  format: 'datetime',
                  description: 'When user was blocked'
                },
                reason: {
                  type: 'string',
                  description: 'Optional reason for blocking'
                }
              }
            },
            description: 'List of blocked users'
          },
          updatedAt: {
            type: 'string',
            format: 'datetime',
            description: 'Last update timestamp'
          }
        }
      }
    }
  }
}