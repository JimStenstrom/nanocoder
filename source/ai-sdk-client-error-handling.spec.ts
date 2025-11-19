import test from 'ava';
import {parseAPIError} from './ai-sdk-client.js';

test('parseAPIError - handles Ollama unmarshal error from issue #87', t => {
	const error = new Error(
		"RetryError [AI_RetryError]: Failed after 3 attempts. Last error: unmarshal: invalid character '{' after top-level value",
	);

	const result = parseAPIError(error);

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

	const result = parseAPIError(error);

	t.true(result.includes('Ollama server error'));
	t.true(result.includes('malformed JSON'));
});

test('parseAPIError - handles invalid character error', t => {
	const error = new Error(
		"500 Internal Server Error: invalid character 'x' after top-level value",
	);

	const result = parseAPIError(error);

	t.true(result.includes('Ollama server error'));
	t.true(result.includes('malformed JSON'));
});

test('parseAPIError - handles 500 error without JSON parsing issue', t => {
	const error = new Error('500 Internal Server Error: database connection failed');

	const result = parseAPIError(error);

	t.is(result, 'Server error: database connection failed');
});

test('parseAPIError - handles 404 error', t => {
	const error = new Error('404 Not Found: model not available');

	const result = parseAPIError(error);

	t.is(
		result,
		'Model not found: The requested model may not exist or is unavailable',
	);
});

test('parseAPIError - handles connection refused', t => {
	const error = new Error('ECONNREFUSED: Connection refused');

	const result = parseAPIError(error);

	t.is(result, 'Connection failed: Unable to reach the model server');
});

test('parseAPIError - handles timeout error', t => {
	const error = new Error('Request timeout: ETIMEDOUT');

	const result = parseAPIError(error);

	t.is(result, 'Request timed out: The model took too long to respond');
});

test('parseAPIError - handles non-Error objects', t => {
	const result = parseAPIError('string error');

	t.is(result, 'An unknown error occurred while communicating with the model');
});

test('parseAPIError - handles context length errors', t => {
	const error = new Error(
		'context length exceeded, please reduce the number of tokens',
	);

	const result = parseAPIError(error);

	t.true(
		result.includes('Context too large') ||
			result.includes('Too many tokens'),
	);
});

test('parseAPIError - handles 400 with context length in message', t => {
	const error = new Error(
		'400 Bad Request: context length exceeded',
	);

	const result = parseAPIError(error);

	// The 400 status code pattern matches first, so we get the full message
	t.is(result, 'Bad request: context length exceeded');
});
