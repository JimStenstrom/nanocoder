import test from 'ava';

// Note: parseAPIError is an internal function in ai-sdk-client.ts that is not exported.
// For testing purposes, we replicate the logic here to verify it works correctly.

/**
 * Parses API errors into user-friendly messages
 * This is a copy of the internal parseAPIError function for testing
 */
function parseAPIErrorForTest(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'An unknown error occurred while communicating with the model';
	}

	const errorMessage = error.message;

	// Handle Ollama-specific unmarshal/JSON parsing errors
	if (
		errorMessage.includes('unmarshal') ||
		(errorMessage.includes('invalid character') &&
			errorMessage.includes('after top-level value'))
	) {
		return (
			'Ollama server error: The model returned malformed JSON. ' +
			'This usually indicates an issue with the Ollama server or model. ' +
			'Try:\n' +
			'  1. Restart Ollama: systemctl restart ollama (Linux) or restart the Ollama app\n' +
			'  2. Re-pull the model: ollama pull <model-name>\n' +
			'  3. Check Ollama logs for more details\n' +
			'  4. Try a different model to see if the issue is model-specific\n' +
			`Original error: ${errorMessage}`
		);
	}

	// Extract status code and clean message from common error patterns
	const statusMatch = errorMessage.match(
		/(?:Error: )?(\d{3})\s+(?:\d{3}\s+)?(?:Bad Request|[^:]+):\s*(.+)/i,
	);
	if (statusMatch) {
		const [, statusCode, message] = statusMatch;
		const cleanMessage = message.trim();

		switch (statusCode) {
			case '400':
				return `Bad request: ${cleanMessage}`;
			case '401':
				return 'Authentication failed: Invalid API key or credentials';
			case '403':
				return 'Access forbidden: Check your API permissions';
			case '404':
				return 'Model not found: The requested model may not exist or is unavailable';
			case '429':
				return 'Rate limit exceeded: Too many requests. Please wait and try again';
			case '500':
			case '502':
			case '503':
				return `Server error: ${cleanMessage}`;
			default:
				return `Request failed (${statusCode}): ${cleanMessage}`;
		}
	}

	// Handle timeout errors
	if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
		return 'Request timed out: The model took too long to respond';
	}

	// Handle network errors
	if (
		errorMessage.includes('ECONNREFUSED') ||
		errorMessage.includes('connect')
	) {
		return 'Connection failed: Unable to reach the model server';
	}

	// Handle context length errors
	if (
		errorMessage.includes('context length') ||
		errorMessage.includes('too many tokens')
	) {
		return 'Context too large: Please reduce the conversation length or message size';
	}

	// Handle token limit errors
	if (errorMessage.includes('reduce the number of tokens')) {
		return 'Too many tokens: Please shorten your message or clear conversation history';
	}

	// If we can't parse it, return a cleaned up version
	return errorMessage.replace(/^Error:\s*/i, '').split('\n')[0];
}

test('parseAPIError - handles Ollama unmarshal error from issue #87', t => {
	const error = new Error(
		"RetryError [AI_RetryError]: Failed after 3 attempts. Last error: unmarshal: invalid character '{' after top-level value",
	);

	const result = parseAPIErrorForTest(error);

	t.true(result.includes('Ollama server error'));
	t.true(result.includes('malformed JSON'));
	t.true(result.includes('Restart Ollama'));
	t.true(result.includes('Re-pull the model'));
	t.true(result.includes('Check Ollama logs'));
	t.true(result.includes('Try a different model'));
	t.true(result.includes('Original error:'));
});

test('parseAPIError - handles unmarshal error without retry wrapper', t => {
	const error = new Error("unmarshal: invalid character '{' after top-level value");

	const result = parseAPIErrorForTest(error);

	t.true(result.includes('Ollama server error'));
	t.true(result.includes('malformed JSON'));
});

test('parseAPIError - handles invalid character error', t => {
	const error = new Error(
		"500 Internal Server Error: invalid character 'x' after top-level value",
	);

	const result = parseAPIErrorForTest(error);

	t.true(result.includes('Ollama server error'));
	t.true(result.includes('malformed JSON'));
});

test('parseAPIError - handles 500 error without JSON parsing issue', t => {
	const error = new Error('500 Internal Server Error: database connection failed');

	const result = parseAPIErrorForTest(error);

	t.is(result, 'Server error: database connection failed');
});

test('parseAPIError - handles 404 error', t => {
	const error = new Error('404 Not Found: model not available');

	const result = parseAPIErrorForTest(error);

	t.is(
		result,
		'Model not found: The requested model may not exist or is unavailable',
	);
});

test('parseAPIError - handles connection refused', t => {
	const error = new Error('ECONNREFUSED: Connection refused');

	const result = parseAPIErrorForTest(error);

	t.is(result, 'Connection failed: Unable to reach the model server');
});

test('parseAPIError - handles timeout error', t => {
	const error = new Error('Request timeout: ETIMEDOUT');

	const result = parseAPIErrorForTest(error);

	t.is(result, 'Request timed out: The model took too long to respond');
});

test('parseAPIError - handles non-Error objects', t => {
	const result = parseAPIErrorForTest('string error');

	t.is(result, 'An unknown error occurred while communicating with the model');
});

test('parseAPIError - handles context length errors', t => {
	const error = new Error(
		'context length exceeded, please reduce the number of tokens',
	);

	const result = parseAPIErrorForTest(error);

	t.true(
		result.includes('Context too large') ||
			result.includes('Too many tokens'),
	);
});

test('parseAPIError - handles 400 with context length in message', t => {
	const error = new Error(
		'400 Bad Request: context length exceeded',
	);

	const result = parseAPIErrorForTest(error);

	// The 400 status code pattern matches first, so we get the full message
	t.is(result, 'Bad request: context length exceeded');
});
