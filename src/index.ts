export { MessageService, MessageServiceConfig } from './messaging/messageService.js';
export { ATProtoClient, ATProtoConfig } from './atproto/client.js';
export { PostQuantumCrypto, KeyPair, KyberKeyPair, HybridCiphertext } from './crypto/postQuantum.js';
export { 
  E2EEManager, 
  KeyBundle, 
  PublicKeyBundle, 
  EncryptedMessage, 
  DecryptedMessage,
  MessageAttachment 
} from './crypto/e2ee.js';
export { 
  FriendManager, 
  Friend, 
  BlockedUser, 
  FriendList, 
  TrustLevel 
} from './social/friendManager.js';
export { 
  MessageStore, 
  StoredMessage, 
  Conversation, 
  MessageFilter 
} from './storage/messageStore.js';
export { 
  MediaHandler, 
  MediaMetadata, 
  EncryptedMedia 
} from './media/mediaHandler.js';

export { messageLexicon } from './lexicons/message.js';
export { conversationLexicon } from './lexicons/conversation.js';
export { keyBundleLexicon } from './lexicons/keyBundle.js';
export { friendListLexicon } from './lexicons/friendList.js';