# Hyperwave Relay Network

A secure messaging application built on the AT Protocol (BlueSky) with post-quantum encryption, allowing users to own their data while maintaining end-to-end encryption.

## Features

- **AT Protocol Integration**: Built on top of AT Protocol for decentralized data storage
- **Post-Quantum Encryption**: Uses Kyber-1024 for quantum-resistant key exchange
- **End-to-End Encryption**: Hybrid encryption combining post-quantum and classical cryptography
- **Friend/Block List Management**: Control who can message you
- **Data Ownership**: Users own and control their message data
- **Text Messaging**: Full text messaging support with threading
- **Media Support**: Prepared infrastructure for image/video attachments

## Architecture

### Security Model

The application uses a hybrid cryptographic approach:
- **Kyber-1024**: Post-quantum key encapsulation mechanism
- **X25519**: Classical elliptic curve Diffie-Hellman
- **Ed25519**: Digital signatures for authentication
- **XChaCha20-Poly1305**: Symmetric encryption for message content

### Components

1. **AT Protocol Client** (`src/atproto/client.ts`)
   - Handles authentication and communication with AT Protocol network
   - Manages DIDs and handle resolution
   - Creates and retrieves records from the decentralized network

2. **Post-Quantum Cryptography** (`src/crypto/postQuantum.ts`)
   - Implements hybrid encryption using Kyber and X25519
   - Provides secure key generation and management
   - Ensures forward secrecy and post-quantum resistance

3. **E2EE Manager** (`src/crypto/e2ee.ts`)
   - Manages end-to-end encryption for messages
   - Handles key bundle creation and exchange
   - Implements the Double Ratchet-like protocol

4. **Friend Manager** (`src/social/friendManager.ts`)
   - Manages friend lists and trust levels
   - Handles user blocking and unblocking
   - Controls message permissions

5. **Message Store** (`src/storage/messageStore.ts`)
   - Local encrypted message storage using LevelDB
   - Message synchronization with AT Protocol
   - Search and filtering capabilities

6. **Message Service** (`src/messaging/messageService.ts`)
   - High-level messaging API
   - Coordinates between all components
   - Event-driven architecture for real-time updates

## Installation

```bash
npm install
npm run build
```

## Usage

### CLI Application

```bash
npm run dev
```

### Programmatic API

```typescript
import { MessageService } from 'hyperwave-relay-network';

const service = new MessageService({
  atProtoService: 'https://bsky.social'
});

// Initialize with credentials
await service.initialize('user.bsky.social', 'password');

// Add a friend
await service.addFriend('friend.bsky.social');

// Send a message
await service.sendMessage('friend.bsky.social', 'Hello, secure world!');

// Listen for messages
service.on('messageReceived', (message) => {
  console.log('New message:', message);
});
```

## Lexicon Schemas

The application defines custom AT Protocol lexicons:

- `com.hyperwave.message`: Encrypted message records
- `com.hyperwave.conversation`: Conversation metadata
- `com.hyperwave.keyBundle`: Public key bundles for E2EE
- `com.hyperwave.friendList`: Friend and block lists

## Security Considerations

1. **Key Rotation**: Keys should be rotated periodically using `rotateKeys()`
2. **Trust Levels**: Implement trust levels for friends to control message permissions
3. **Message Expiry**: Consider implementing ephemeral messages
4. **Metadata Protection**: Conversation metadata is encrypted
5. **Perfect Forward Secrecy**: Each message uses ephemeral keys

## Development

### Running Tests

```bash
npm test
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Future Enhancements

- [ ] Group messaging support
- [ ] Voice and video calls
- [ ] File sharing with chunking
- [ ] Message reactions and receipts
- [ ] Disappearing messages
- [ ] Multi-device support
- [ ] Offline message queue
- [ ] Message search with encrypted indexes

## License

This project is released into the public domain under the Unlicense.