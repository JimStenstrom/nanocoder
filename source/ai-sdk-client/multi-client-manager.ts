/**
 * Multi-Client Manager for Workflow Mode
 *
 * Manages multiple LLM clients for the planning/coding/review workflow.
 * Each phase can use a different provider and model.
 */

import type {AIProviderConfig, LLMClient} from '@/types/index';
import type {WorkflowConfig} from '@/types/workflow';
import {getLogger} from '@/utils/logging';
import {AISDKClient} from './ai-sdk-client';

export type ClientRole = 'planner' | 'coder' | 'reviewer';

interface ClientEntry {
	client: LLMClient;
	provider: string;
	model: string;
	role: ClientRole;
}

/**
 * Manages multiple LLM clients for different workflow phases
 */
export class MultiClientManager {
	private clients: Map<ClientRole, ClientEntry> = new Map();
	private activeRole: ClientRole | null = null;
	private allProviders: Map<string, AIProviderConfig> = new Map();

	constructor() {
		// Clients are initialized lazily via initializeFromConfig
	}

	/**
	 * Initialize clients from workflow configuration
	 */
	async initializeFromConfig(
		workflowConfig: WorkflowConfig,
		providers: AIProviderConfig[],
	): Promise<void> {
		const logger = getLogger();

		// Store all available providers
		for (const provider of providers) {
			this.allProviders.set(provider.name, provider);
		}

		// Initialize planner client
		await this.initializeClient(
			'planner',
			workflowConfig.planningModel.provider,
			workflowConfig.planningModel.model,
		);

		// Initialize coder client
		await this.initializeClient(
			'coder',
			workflowConfig.codingModel.provider,
			workflowConfig.codingModel.model,
		);

		// Initialize reviewer client
		await this.initializeClient(
			'reviewer',
			workflowConfig.reviewModel.provider,
			workflowConfig.reviewModel.model,
		);

		logger.info('Multi-client manager initialized', {
			planner: `${workflowConfig.planningModel.provider}/${workflowConfig.planningModel.model}`,
			coder: `${workflowConfig.codingModel.provider}/${workflowConfig.codingModel.model}`,
			reviewer: `${workflowConfig.reviewModel.provider}/${workflowConfig.reviewModel.model}`,
		});
	}

	/**
	 * Initialize a single client for a role
	 */
	private async initializeClient(
		role: ClientRole,
		providerName: string,
		model: string,
	): Promise<void> {
		const logger = getLogger();

		const providerConfig = this.allProviders.get(providerName);
		if (!providerConfig) {
			throw new Error(
				`Provider '${providerName}' not found for workflow role '${role}'. ` +
					`Available providers: ${Array.from(this.allProviders.keys()).join(', ')}`,
			);
		}

		// Check if the model is available for this provider
		if (!providerConfig.models.includes(model)) {
			logger.warn(
				`Model '${model}' not in configured models for provider '${providerName}'. ` +
					`Adding it dynamically. Configured models: ${providerConfig.models.join(', ')}`,
			);
			// Add the model to the provider config (some providers allow any model)
			providerConfig.models.push(model);
		}

		const client = await AISDKClient.create(providerConfig);
		client.setModel(model);

		this.clients.set(role, {
			client,
			provider: providerName,
			model,
			role,
		});

		logger.debug(`Initialized ${role} client`, {
			provider: providerName,
			model,
		});
	}

	/**
	 * Switch to a specific role's client
	 */
	switchTo(role: ClientRole): LLMClient {
		const entry = this.clients.get(role);
		if (!entry) {
			throw new Error(
				`Client for role '${role}' not initialized. Call initializeFromConfig first.`,
			);
		}

		this.activeRole = role;
		const logger = getLogger();
		logger.info('Switched active client', {
			role,
			provider: entry.provider,
			model: entry.model,
		});

		return entry.client;
	}

	/**
	 * Get the currently active client
	 */
	getActive(): LLMClient | null {
		if (!this.activeRole) return null;
		return this.clients.get(this.activeRole)?.client || null;
	}

	/**
	 * Get the active role
	 */
	getActiveRole(): ClientRole | null {
		return this.activeRole;
	}

	/**
	 * Get a specific client by role
	 */
	getClient(role: ClientRole): LLMClient | null {
		return this.clients.get(role)?.client || null;
	}

	/**
	 * Get client info for a role
	 */
	getClientInfo(role: ClientRole): {provider: string; model: string} | null {
		const entry = this.clients.get(role);
		if (!entry) return null;
		return {provider: entry.provider, model: entry.model};
	}

	/**
	 * Check if all clients are initialized
	 */
	isInitialized(): boolean {
		return (
			this.clients.has('planner') &&
			this.clients.has('coder') &&
			this.clients.has('reviewer')
		);
	}

	/**
	 * Get status of all clients
	 */
	getStatus(): Record<
		ClientRole,
		{provider: string; model: string; active: boolean} | null
	> {
		const roles: ClientRole[] = ['planner', 'coder', 'reviewer'];
		const status: Record<
			ClientRole,
			{provider: string; model: string; active: boolean} | null
		> = {
			planner: null,
			coder: null,
			reviewer: null,
		};

		for (const role of roles) {
			const entry = this.clients.get(role);
			if (entry) {
				status[role] = {
					provider: entry.provider,
					model: entry.model,
					active: this.activeRole === role,
				};
			}
		}

		return status;
	}

	/**
	 * Clear all contexts
	 */
	async clearAllContexts(): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const entry of this.clients.values()) {
			promises.push(entry.client.clearContext());
		}
		await Promise.all(promises);
	}

	/**
	 * Dispose all clients
	 */
	dispose(): void {
		this.clients.clear();
		this.activeRole = null;
		this.allProviders.clear();
	}
}

/**
 * Create a multi-client manager from workflow config
 */
export async function createMultiClientManager(
	workflowConfig: WorkflowConfig,
	providers: AIProviderConfig[],
): Promise<MultiClientManager> {
	const manager = new MultiClientManager();
	await manager.initializeFromConfig(workflowConfig, providers);
	return manager;
}
