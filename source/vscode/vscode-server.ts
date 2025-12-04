/**
 * WebSocket server for VS Code extension communication
 */

import {WebSocketServer, WebSocket} from 'ws';
import {randomUUID} from 'crypto';
import * as fs from 'fs';
import {formatError} from '@/utils/error-formatter';
import {
	ServerMessage,
	ClientMessage,
	FileChangeMessage,
	AssistantMessage,
	StatusMessage,
	ConnectionAckMessage,
	DiagnosticsRequestMessage,
	CloseDiffMessage,
	DiagnosticInfo,
	PROTOCOL_VERSION,
	DEFAULT_PORT,
	PendingChange,
} from './protocol';

// Get version from package.json
const packageJson = JSON.parse(
	fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as {version?: string};
const CLI_VERSION = packageJson.version ?? '0.0.0';

export type MessageHandler = (message: ClientMessage) => void;
export type PromptHandler = (
	prompt: string,
	context?: {
		filePath?: string;
		selection?: string;
		cursorPosition?: {line: number; character: number};
	},
) => void;

export interface VSCodeServerCallbacks {
	onPrompt?: PromptHandler;
	onChangeApplied?: (id: string) => void;
	onChangeRejected?: (id: string) => void;
	onContext?: (context: {
		workspaceFolder?: string;
		openFiles?: string[];
		activeFile?: string;
		diagnostics?: DiagnosticInfo[];
	}) => void;
	onDiagnosticsResponse?: (diagnostics: DiagnosticInfo[]) => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
}

export class VSCodeServer {
	private wss: WebSocketServer | null = null;
	private clients: Set<WebSocket> = new Set();
	private pendingChanges: Map<string, PendingChange> = new Map();
	private callbacks: VSCodeServerCallbacks = {};
	private currentModel?: string;
	private currentProvider?: string;

	constructor(private port: number = DEFAULT_PORT) {}

	/**
	 * Start the WebSocket server
	 */
	async start(): Promise<boolean> {
		return new Promise(resolve => {
			try {
				this.wss = new WebSocketServer({
					port: this.port,
					host: '127.0.0.1', // Only accept local connections
				});

				this.wss.on('listening', () => {
					resolve(true);
				});

				this.wss.on('connection', ws => {
					this.handleConnection(ws);
				});

				this.wss.on('error', _error => {
					resolve(false);
				});
			} catch (error) {
				console.debug(`[vscode-server] Failed to start WebSocket server: ${formatError(error)}`);
				resolve(false);
			}
		});
	}

	/**
	 * Stop the WebSocket server
	 */
	async stop(): Promise<void> {
		// Close all client connections
		for (const client of this.clients) {
			client.close();
		}
		this.clients.clear();

		// Close server
		return new Promise(resolve => {
			if (this.wss) {
				this.wss.close(() => {
					this.wss = null;
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	/**
	 * Register callbacks for client messages
	 */
	onCallbacks(callbacks: VSCodeServerCallbacks): void {
		this.callbacks = {...this.callbacks, ...callbacks};
	}

	/**
	 * Check if any clients are connected
	 */
	hasConnections(): boolean {
		return this.clients.size > 0;
	}

	/**
	 * Get number of connected clients
	 */
	getConnectionCount(): number {
		return this.clients.size;
	}

	/**
	 * Send a file change notification to VS Code
	 */
	sendFileChange(
		filePath: string,
		originalContent: string,
		newContent: string,
		toolName: string,
		toolArgs: Record<string, unknown>,
	): string {
		const id = randomUUID();

		// Store pending change
		this.pendingChanges.set(id, {
			id,
			filePath,
			originalContent,
			newContent,
			toolName,
			timestamp: Date.now(),
		});

		const message: FileChangeMessage = {
			type: 'file_change',
			id,
			filePath,
			originalContent,
			newContent,
			toolName,
			toolArgs,
		};

		this.broadcast(message);
		return id;
	}

	/**
	 * Send an assistant message to VS Code
	 */
	sendAssistantMessage(content: string, isStreaming: boolean = false): void {
		const message: AssistantMessage = {
			type: 'assistant_message',
			content,
			isStreaming,
		};
		this.broadcast(message);
	}

	/**
	 * Send status update to VS Code
	 */
	sendStatus(model?: string, provider?: string): void {
		this.currentModel = model;
		this.currentProvider = provider;

		const message: StatusMessage = {
			type: 'status',
			connected: true,
			model,
			provider,
			workingDirectory: process.cwd(),
		};
		this.broadcast(message);
	}

	/**
	 * Request diagnostics from VS Code
	 */
	requestDiagnostics(filePath?: string): void {
		const message: DiagnosticsRequestMessage = {
			type: 'diagnostics_request',
			filePath,
		};
		this.broadcast(message);
	}

	/**
	 * Close diff preview in VS Code (when tool is confirmed/rejected in CLI)
	 */
	closeDiff(id: string): void {
		const message: CloseDiffMessage = {
			type: 'close_diff',
			id,
		};
		this.broadcast(message);
		// Also remove from pending changes
		this.pendingChanges.delete(id);
	}

	/**
	 * Close all pending diff previews
	 */
	closeAllDiffs(): void {
		const pendingIds = Array.from(this.pendingChanges.keys());
		for (const id of pendingIds) {
			this.closeDiff(id);
		}
	}

	/**
	 * Get a pending change by ID
	 */
	getPendingChange(id: string): PendingChange | undefined {
		return this.pendingChanges.get(id);
	}

	/**
	 * Remove a pending change
	 */
	removePendingChange(id: string): void {
		this.pendingChanges.delete(id);
	}

	/**
	 * Get all pending changes
	 */
	getAllPendingChanges(): PendingChange[] {
		return Array.from(this.pendingChanges.values());
	}

	private handleConnection(ws: WebSocket): void {
		this.clients.add(ws);

		// Send connection acknowledgment
		const ack: ConnectionAckMessage = {
			type: 'connection_ack',
			protocolVersion: PROTOCOL_VERSION,
			cliVersion: CLI_VERSION,
		};
		ws.send(JSON.stringify(ack));

		// Send current status
		if (this.currentModel || this.currentProvider) {
			this.sendStatus(this.currentModel, this.currentProvider);
		}

		// Notify callback
		this.callbacks.onConnect?.();

		ws.on('message', (data: {toString(): string}) => {
			try {
				const message = JSON.parse(data.toString()) as ClientMessage;
				this.handleMessage(message);
			} catch (error) {
				console.error('Failed to parse message from VS Code:', error);
			}
		});

		ws.on('close', () => {
			this.clients.delete(ws);
			this.callbacks.onDisconnect?.();
		});

		ws.on('error', _error => {
			this.clients.delete(ws);
		});
	}

	private handleMessage(message: ClientMessage): void {
		switch (message.type) {
			case 'send_prompt':
				this.callbacks.onPrompt?.(message.prompt, message.context);
				break;

			case 'apply_change':
				this.pendingChanges.delete(message.id);
				this.callbacks.onChangeApplied?.(message.id);
				break;

			case 'reject_change':
				this.pendingChanges.delete(message.id);
				this.callbacks.onChangeRejected?.(message.id);
				break;

			case 'get_status':
				this.sendStatus(this.currentModel, this.currentProvider);
				break;

			case 'context':
				this.callbacks.onContext?.({
					workspaceFolder: message.workspaceFolder,
					openFiles: message.openFiles,
					activeFile: message.activeFile,
					diagnostics: message.diagnostics,
				});
				break;

			case 'diagnostics_response':
				this.callbacks.onDiagnosticsResponse?.(message.diagnostics);
				break;
		}
	}

	private broadcast(message: ServerMessage): void {
		const data = JSON.stringify(message);
		for (const client of this.clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		}
	}
}

// Singleton instance for global access
let serverInstance: VSCodeServer | null = null;

/**
 * Get or create the VS Code server singleton
 */
export function getVSCodeServer(port?: number): VSCodeServer {
	if (!serverInstance) {
		serverInstance = new VSCodeServer(port);
	}
	return serverInstance;
}

/**
 * Check if VS Code server is active and has connections
 */
export function isVSCodeConnected(): boolean {
	return serverInstance?.hasConnections() ?? false;
}

/**
 * Send a file change to VS Code for preview/approval
 * This is the main entry point for tools to integrate with VS Code
 */
export function sendFileChangeToVSCode(
	filePath: string,
	originalContent: string,
	newContent: string,
	toolName: string,
	toolArgs: Record<string, unknown>,
): string | null {
	if (!serverInstance?.hasConnections()) {
		return null;
	}

	return serverInstance.sendFileChange(
		filePath,
		originalContent,
		newContent,
		toolName,
		toolArgs,
	);
}

/**
 * Close a diff preview in VS Code (when tool confirmed/rejected in CLI)
 */
export function closeDiffInVSCode(id: string | null): void {
	if (!id || !serverInstance?.hasConnections()) {
		return;
	}

	serverInstance.closeDiff(id);
}

/**
 * Close all pending diff previews in VS Code
 */
export function closeAllDiffsInVSCode(): void {
	if (!serverInstance?.hasConnections()) {
		return;
	}

	serverInstance.closeAllDiffs();
}
