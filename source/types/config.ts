import type {ThemePreset} from '@/types/ui';

// Provider type discriminator
export type ProviderType = 'openai-compatible' | 'azure';

// AI provider configurations (supports OpenAI-compatible and Azure)
export interface AIProviderConfig {
	name: string;
	type: string;
	providerType?: ProviderType; // Defaults to 'openai-compatible' if not specified
	models: string[];
	requestTimeout?: number;
	socketTimeout?: number;
	maxRetries?: number; // Maximum number of retries for failed requests (default: 2)
	connectionPool?: {
		idleTimeout?: number;
		cumulativeMaxIdleTimeout?: number;
	};
	config: {
		baseURL?: string;
		apiKey?: string;
		// Azure-specific fields
		resourceName?: string;
		apiVersion?: string;
		[key: string]: unknown;
	};
}

// Provider configuration type for wizard and config building
export interface ProviderConfig {
	name: string;
	providerType?: ProviderType; // Defaults to 'openai-compatible' if not specified
	baseUrl?: string;
	apiKey?: string;
	models: string[];
	requestTimeout?: number;
	socketTimeout?: number;
	maxRetries?: number; // Maximum number of retries for failed requests (default: 2)
	organizationId?: string;
	timeout?: number;
	connectionPool?: {
		idleTimeout?: number;
		cumulativeMaxIdleTimeout?: number;
	};
	// Azure-specific fields
	resourceName?: string; // Azure resource name (e.g., 'my-openai-resource')
	apiVersion?: string; // Azure API version (e.g., '2024-02-15-preview')
	[key: string]: unknown; // Allow additional provider-specific config
}

export interface AppConfig {
	// Providers array structure - supports OpenAI-compatible and Azure providers
	providers?: {
		name: string;
		providerType?: ProviderType; // Defaults to 'openai-compatible' if not specified
		baseUrl?: string;
		apiKey?: string;
		models: string[];
		requestTimeout?: number;
		socketTimeout?: number;
		maxRetries?: number; // Maximum number of retries for failed requests (default: 2)
		connectionPool?: {
			idleTimeout?: number;
			cumulativeMaxIdleTimeout?: number;
		};
		// Azure-specific fields
		resourceName?: string;
		apiVersion?: string;
		[key: string]: unknown; // Allow additional provider-specific config
	}[];

	mcpServers?: {
		name: string;
		transport: 'stdio' | 'websocket' | 'http';
		command?: string;
		args?: string[];
		env?: Record<string, string>;
		url?: string;
		headers?: Record<string, string>;
		auth?: {
			type: 'bearer' | 'basic' | 'api-key' | 'custom';
			token?: string;
			username?: string;
			password?: string;
			apiKey?: string;
			customHeaders?: Record<string, string>;
		};
		timeout?: number;
		reconnect?: {
			enabled: boolean;
			maxAttempts: number;
			backoffMs: number;
		};
		description?: string;
		tags?: string[];
		enabled?: boolean;
	}[];

	// LSP server configurations (optional - auto-discovery enabled by default)
	lspServers?: {
		name: string;
		command: string;
		args?: string[];
		languages: string[]; // File extensions this server handles
		env?: Record<string, string>;
	}[];
}

export interface UserPreferences {
	lastProvider?: string;
	lastModel?: string;
	providerModels?: {
		[key in string]?: string;
	};
	lastUpdateCheck?: number;
	selectedTheme?: ThemePreset;
	trustedDirectories?: string[];
}
