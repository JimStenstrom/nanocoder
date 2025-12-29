import {createAzure} from '@ai-sdk/azure';
import {type Agent, fetch as undiciFetch} from 'undici';
import type {AIProviderConfig} from '@/types/index';

/**
 * Creates an Azure OpenAI provider with custom fetch using undici
 */
export function createAzureProvider(
	providerConfig: AIProviderConfig,
	undiciAgent: Agent,
): ReturnType<typeof createAzure> {
	const {config} = providerConfig;

	// Custom fetch using undici
	const customFetch = (
		url: string | URL | Request,
		options?: RequestInit,
	): Promise<Response> => {
		// Type cast to string | URL since undici's fetch accepts these types
		// Request objects are converted to URL internally by the fetch spec
		return undiciFetch(url as string | URL, {
			...options,
			dispatcher: undiciAgent,
		}) as Promise<Response>;
	};

	return createAzure({
		resourceName: config.resourceName as string,
		apiKey: config.apiKey ?? '',
		apiVersion: (config.apiVersion as string) || '2024-02-15-preview',
		fetch: customFetch,
	});
}
