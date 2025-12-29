import {createAzure} from '@ai-sdk/azure';
import {type Agent, fetch as undiciFetch} from 'undici';
import type {AIProviderConfig} from '@/types/index';
import {getLogger} from '@/utils/logging';

/**
 * Creates an Azure OpenAI provider with custom fetch using undici
 * Supports both Azure OpenAI (openai.azure.com) and Azure AI Services (services.ai.azure.com)
 */
export function createAzureProvider(
	providerConfig: AIProviderConfig,
	undiciAgent: Agent,
): ReturnType<typeof createAzure> {
	const {config} = providerConfig;
	const logger = getLogger();

	// Custom fetch using undici with debug logging
	const customFetch = (
		url: string | URL | Request,
		options?: RequestInit,
	): Promise<Response> => {
		// Log the URL being called at debug level
		const urlString = url instanceof Request ? url.url : url.toString();
		logger.debug('Azure fetch URL', {url: urlString});

		// Type cast to string | URL since undici's fetch accepts these types
		// Request objects are converted to URL internally by the fetch spec
		return undiciFetch(url as string | URL, {
			...options,
			dispatcher: undiciAgent,
		}) as Promise<Response>;
	};

	// baseURL contains the base endpoint URL from the wizard (without /openai path)
	// Azure SDK needs: {baseURL}/deployments/{modelId}/chat/completions
	// So we append /openai to the base and enable deployment-based URLs
	const rawBaseURL = config.baseURL?.replace(/\/$/, ''); // Remove trailing slash
	const baseURL = rawBaseURL ? `${rawBaseURL}/openai` : undefined;

	logger.debug('Azure provider config', {
		baseURL,
		apiVersion: '2025-01-01-preview',
		useDeploymentBasedUrls: true,
	});

	return createAzure({
		baseURL,
		apiKey: config.apiKey ?? '',
		apiVersion: '2025-01-01-preview',
		useDeploymentBasedUrls: true,
		fetch: customFetch,
	});
}
