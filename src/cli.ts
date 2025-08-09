#!/usr/bin/env node

import readline from 'readline';
import { MessageService } from './messaging/messageService.js';
import { TrustLevel } from './social/friendManager.js';

class HyperwaveCLI {
  private messageService: MessageService;
  private rl: readline.Interface;
  private isLoggedIn: boolean = false;

  constructor() {
    this.messageService = new MessageService({
      atProtoService: process.env.ATPROTO_SERVICE || 'https://bsky.social'
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.messageService.on('messageReceived', (message) => {
      console.log(`\n📨 New message from ${message.sender}:`);
      console.log(`   ${message.content}`);
      console.log(`   Time: ${new Date(message.timestamp).toLocaleString()}\n`);
      this.showPrompt();
    });

    this.messageService.on('messageSent', (message) => {
      console.log(`✅ Message sent to ${message.recipient}`);
    });

    this.messageService.on('initialized', () => {
      console.log('✅ Service initialized successfully');
      this.isLoggedIn = true;
    });
  }

  private showPrompt(): void {
    this.rl.setPrompt('hyperwave> ');
    this.rl.prompt();
  }

  private async handleCommand(line: string): Promise<void> {
    const [command, ...args] = line.trim().split(' ');

    try {
      switch (command) {
        case 'login':
          await this.handleLogin();
          break;

        case 'send':
          await this.handleSend(args);
          break;

        case 'list':
          await this.handleList(args[0]);
          break;

        case 'add':
          await this.handleAddFriend(args);
          break;

        case 'remove':
          await this.handleRemoveFriend(args[0]);
          break;

        case 'block':
          await this.handleBlock(args);
          break;

        case 'unblock':
          await this.handleUnblock(args[0]);
          break;

        case 'conversations':
          await this.handleConversations();
          break;

        case 'messages':
          await this.handleMessages(args[0]);
          break;

        case 'search':
          await this.handleSearch(args.join(' '));
          break;

        case 'stats':
          await this.handleStats();
          break;

        case 'export':
          await this.handleExport();
          break;

        case 'rotate':
          await this.handleRotateKeys();
          break;

        case 'help':
          this.showHelp();
          break;

        case 'exit':
        case 'quit':
          await this.handleExit();
          break;

        default:
          console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
    }

    this.showPrompt();
  }

  private async handleLogin(): Promise<void> {
    const identifier = await this.question('Identifier (handle or email): ');
    const password = await this.question('Password: ', true);

    console.log('Logging in...');
    await this.messageService.initialize(identifier, password);
  }

  private async handleSend(args: string[]): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (args.length < 2) {
      console.log('Usage: send <recipient> <message>');
      return;
    }

    const recipient = args[0];
    const message = args.slice(1).join(' ');

    await this.messageService.sendMessage(recipient, message);
  }

  private async handleList(type?: string): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (type === 'blocked') {
      const blocked = this.messageService.getBlockedUsers();
      console.log('\nBlocked Users:');
      blocked.forEach(b => {
        console.log(`  - ${b.handle || b.did} (blocked: ${new Date(b.blockedAt).toLocaleDateString()})`);
      });
    } else {
      const friends = this.messageService.getFriends();
      console.log('\nFriends:');
      friends.forEach(f => {
        console.log(`  - ${f.handle || f.did} ${f.nickname ? `(${f.nickname})` : ''} [Trust: ${f.trustLevel}]`);
      });
    }
  }

  private async handleAddFriend(args: string[]): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (args.length === 0) {
      console.log('Usage: add <handle/did> [nickname]');
      return;
    }

    const [handle, ...nicknameParts] = args;
    const nickname = nicknameParts.join(' ') || undefined;

    await this.messageService.addFriend(handle, nickname);
    console.log(`✅ Added ${handle} as friend`);
  }

  private async handleRemoveFriend(handle?: string): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (!handle) {
      console.log('Usage: remove <handle/did>');
      return;
    }

    await this.messageService.removeFriend(handle);
    console.log(`✅ Removed ${handle} from friends`);
  }

  private async handleBlock(args: string[]): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (args.length === 0) {
      console.log('Usage: block <handle/did> [reason]');
      return;
    }

    const [handle, ...reasonParts] = args;
    const reason = reasonParts.join(' ') || undefined;

    await this.messageService.blockUser(handle, reason);
    console.log(`🚫 Blocked ${handle}`);
  }

  private async handleUnblock(handle?: string): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (!handle) {
      console.log('Usage: unblock <handle/did>');
      return;
    }

    await this.messageService.unblockUser(handle);
    console.log(`✅ Unblocked ${handle}`);
  }

  private async handleConversations(): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    const conversations = await this.messageService.getConversations();
    console.log('\nConversations:');
    conversations.forEach(c => {
      console.log(`  - ${c.participants.join(', ')}`);
      console.log(`    Last message: ${new Date(c.lastMessageAt).toLocaleString()}`);
      console.log(`    Unread: ${c.unreadCount}`);
    });
  }

  private async handleMessages(participant?: string): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (!participant) {
      console.log('Usage: messages <participant>');
      return;
    }

    const messages = await this.messageService.getMessages(participant);
    console.log(`\nMessages with ${participant}:`);
    messages.forEach(m => {
      const prefix = m.isSent ? '→' : '←';
      console.log(`${prefix} [${new Date(m.timestamp).toLocaleTimeString()}] ${m.content}`);
    });
  }

  private async handleSearch(query: string): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    if (!query) {
      console.log('Usage: search <query>');
      return;
    }

    const messages = await this.messageService.searchMessages(query);
    console.log(`\nSearch results for "${query}":`);
    messages.forEach(m => {
      console.log(`  [${new Date(m.timestamp).toLocaleString()}] ${m.sender}: ${m.content}`);
    });
  }

  private async handleStats(): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    const stats = await this.messageService.getStats();
    console.log('\nStatistics:');
    console.log(`  Friends: ${stats.friends}`);
    console.log(`  Blocked: ${stats.blocked}`);
    console.log(`  Total messages: ${stats.totalMessages}`);
    console.log(`  Unread messages: ${stats.unreadMessages}`);
    console.log(`  Conversations: ${stats.conversations}`);
  }

  private async handleExport(): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    const data = await this.messageService.exportData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    console.log(`\nData exported to:`);
    console.log(`  friends-${timestamp}.json`);
    console.log(`  messages-${timestamp}.json`);
  }

  private async handleRotateKeys(): Promise<void> {
    if (!this.isLoggedIn) {
      console.log('Please login first');
      return;
    }

    console.log('Rotating encryption keys...');
    await this.messageService.rotateKeys();
    console.log('✅ Keys rotated successfully');
  }

  private showHelp(): void {
    console.log(`
Hyperwave Relay Network - Secure Messaging CLI

Commands:
  login                     - Login to AT Protocol
  send <recipient> <msg>    - Send a message
  list [blocked]           - List friends or blocked users
  add <handle> [nickname]  - Add a friend
  remove <handle>          - Remove a friend
  block <handle> [reason]  - Block a user
  unblock <handle>         - Unblock a user
  conversations            - List all conversations
  messages <participant>   - Show messages with participant
  search <query>          - Search messages
  stats                   - Show statistics
  export                  - Export data
  rotate                  - Rotate encryption keys
  help                    - Show this help
  exit/quit              - Exit the application
    `);
  }

  private async handleExit(): Promise<void> {
    console.log('Shutting down...');
    await this.messageService.shutdown();
    this.rl.close();
    process.exit(0);
  }

  private question(prompt: string, hidden: boolean = false): Promise<string> {
    return new Promise((resolve) => {
      if (hidden) {
        const stdin = process.stdin;
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let password = '';
        process.stdout.write(prompt);

        stdin.on('data', (char) => {
          const c = char.toString();
          if (c === '\n' || c === '\r') {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeAllListeners('data');
            console.log();
            resolve(password);
          } else if (c === '\u0003') {
            process.exit();
          } else if (c === '\u007f') {
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else {
            password += c;
            process.stdout.write('*');
          }
        });
      } else {
        this.rl.question(prompt, resolve);
      }
    });
  }

  async start(): Promise<void> {
    console.log('Welcome to Hyperwave Relay Network');
    console.log('Type "help" for available commands\n');

    this.showPrompt();

    this.rl.on('line', async (line) => {
      await this.handleCommand(line);
    });

    this.rl.on('close', async () => {
      await this.handleExit();
    });
  }
}

const cli = new HyperwaveCLI();
cli.start().catch(console.error);