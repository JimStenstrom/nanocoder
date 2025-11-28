import {spawn} from 'node:child_process';
import {highlight} from 'cli-highlight';
import React from 'react';
import {Text, Box} from 'ink';
import type {ToolDefinition} from '@/types/index';
import {tool, jsonSchema} from '@/types/core';
import {ThemeContext} from '@/hooks/useTheme';
import ToolMessage from '@/components/tool-message';

const executeExecuteBash = async (args: {command: string}): Promise<string> => {
	return new Promise((resolve, reject) => {
		const proc = spawn('sh', ['-c', args.command]);
		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		proc.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on('close', (code: number | null) => {
			let fullOutput = '';

			// Include exit code information
			const exitCodeInfo = code !== null ? `EXIT_CODE: ${code}\n` : '';

			if (stderr) {
				fullOutput = `${exitCodeInfo}STDERR:
${stderr}
STDOUT:
${stdout}`;
			} else {
				fullOutput = `${exitCodeInfo}${stdout}`;
			}

			// Limit the context for LLM to first 2000 characters to prevent overwhelming the model
			const llmContext =
				fullOutput.length > 2000
					? fullOutput.substring(0, 2000) +
					  '\n... [Output truncated. Use more specific commands to see full output]'
					: fullOutput;

			// Return ONLY the llmContext to avoid sending massive outputs to the model
			// The formatter will need to be updated to handle plain strings
			resolve(llmContext);
		});

		proc.on('error', error => {
			reject(new Error(`Error executing command: ${error.message}`));
		});
	});
};

// AI SDK tool definition
const executeBashCoreTool = tool({
	description:
		'Execute a bash command and return the output (use for running commands)',
	inputSchema: jsonSchema<{command: string}>({
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description: 'The bash command to execute.',
			},
		},
		required: ['command'],
	}),
	// NO execute function - prevents AI SDK auto-execution
});

// Create a component that will re-render when theme changes
const ExecuteBashFormatter = React.memo(
	({args, result}: {args: {command: string}; result?: string}) => {
		const themeContext = React.useContext(ThemeContext);
		if (!themeContext) {
			throw new Error('ThemeContext is required');
		}
		const {colors} = themeContext;
		const command = args.command || 'unknown';

		try {
			highlight(command, {
				language: 'bash',
				theme: 'default',
			});
		} catch {
			// Syntax highlighting failed, will use plain command
		}

		// Result is now a plain string (truncated output)
		let outputSize = 0;
		let estimatedTokens = 0;
		if (result) {
			outputSize = result.length;
			estimatedTokens = Math.ceil(outputSize / 4); // ~4 characters per token
		}

		const messageContent = (
			<Box flexDirection="column">
				<Text color={colors.tool}>⚒ execute_bash</Text>

				<Box>
					<Text color={colors.secondary}>Command: </Text>
					<Text color={colors.primary}>{command}</Text>
				</Box>

				{result && (
					<Box>
						<Text color={colors.secondary}>Output: </Text>
						<Text color={colors.white}>
							{outputSize} characters (~{estimatedTokens} tokens sent to LLM)
						</Text>
					</Box>
				)}
			</Box>
		);

		return <ToolMessage message={messageContent} hideBox={true} />;
	},
);

const formatter = (
	args: {command: string},
	result?: string,
): React.ReactElement => {
	return <ExecuteBashFormatter args={args} result={result} />;
};

// ============================================================================
// Security Validation Types and Helpers
// ============================================================================

interface DangerousPattern {
	pattern: RegExp;
	reason: string;
	category: 'destructive' | 'system' | 'exfiltration' | 'config' | 'device';
}

/**
 * Extract the base command name from a command string.
 * Handles paths like /usr/bin/rm, ./rm, etc.
 * Note: Reserved for future allowlist implementation.
 */
const _extractCommandName = (cmd: string): string => {
	const trimmed = cmd.trim();
	// Get the first word (command name)
	const firstWord = trimmed.split(/\s+/)[0] || '';
	// Extract just the command name from path
	const baseName = firstWord.split('/').pop() || firstWord;
	return baseName.toLowerCase();
};

/**
 * Split a command string into individual commands, handling:
 * - Command chaining with ;, &&, ||
 * - Pipes |
 * - Subshells $(...) and backticks
 * Returns flattened array of command segments to check
 */
const splitCommands = (command: string): string[] => {
	const commands: string[] = [];

	// First, extract content from subshells
	const subshellPattern = /\$\(([^)]+)\)/g;
	const backtickPattern = /`([^`]+)`/g;

	let match;
	while ((match = subshellPattern.exec(command)) !== null) {
		commands.push(...splitCommands(match[1]));
	}
	while ((match = backtickPattern.exec(command)) !== null) {
		commands.push(...splitCommands(match[1]));
	}

	// Split by chain operators: ;, &&, ||, |
	// Note: This is a simplified approach - real shell parsing is much more complex
	const chainSplit = command.split(/\s*(?:;|&&|\|\||(?<![>])\|(?![|]))\s*/);

	for (const segment of chainSplit) {
		const trimmed = segment.trim();
		if (trimmed) {
			commands.push(trimmed);
		}
	}

	return commands;
};

/**
 * Check if a command targets the root filesystem or critical system paths
 */
const targetsRootOrSystemPath = (command: string): boolean => {
	// Check for rm targeting root
	const rmRootPatterns = [
		/\brm\b.*\s+\/\s*$/i, // rm ... /
		/\brm\b.*\s+\/\s+/i, // rm ... / (followed by more)
		/\brm\b.*--no-preserve-root/i, // rm with --no-preserve-root
		/\brm\b.*\s+\/\*\s*/i, // rm ... /*
	];

	for (const pattern of rmRootPatterns) {
		if (pattern.test(command)) {
			return true;
		}
	}

	return false;
};

// ============================================================================
// Dangerous Pattern Definitions
// ============================================================================

const dangerousPatterns: DangerousPattern[] = [
	// === DESTRUCTIVE OPERATIONS ===
	{
		pattern: /(?:^|\/)\brm\b.*-[a-z]*r[a-z]*f[a-z]*\s+\/(?:\s|$|\*)/i,
		reason: 'Recursive forced deletion of root filesystem',
		category: 'destructive',
	},
	{
		pattern: /(?:^|\/)\brm\b.*-[a-z]*f[a-z]*r[a-z]*\s+\/(?:\s|$|\*)/i,
		reason: 'Recursive forced deletion of root filesystem',
		category: 'destructive',
	},
	{
		pattern: /\brm\b.*--no-preserve-root/i,
		reason: 'Dangerous rm with --no-preserve-root flag',
		category: 'destructive',
	},
	{
		pattern: /(?:^|\/)\bmkfs\b/i,
		reason: 'Filesystem formatting command',
		category: 'destructive',
	},
	{
		pattern: /(?:^|\/)\bshred\b.*\s+\/dev\//i,
		reason: 'Secure deletion of device',
		category: 'destructive',
	},
	{
		pattern: /(?:^|\/)\bwipefs\b/i,
		reason: 'Wiping filesystem signatures',
		category: 'destructive',
	},

	// === DISK/DEVICE OPERATIONS ===
	{
		pattern: /(?:^|\/)\bdd\b\s+.*\bof=\/dev\//i,
		reason: 'Direct disk write operation',
		category: 'device',
	},
	{
		pattern:
			/(?:^|\/)\bdd\b\s+.*\bif=\/dev\/(?:zero|random|urandom)\b.*\bof=\/dev\//i,
		reason: 'Overwriting device with zeros or random data',
		category: 'device',
	},
	{
		pattern: />\s*\/dev\/(?:sd[a-z]|nvme\d+n\d+|vd[a-z]|hd[a-z]|xvd[a-z])/i,
		reason: 'Redirecting output to raw disk device',
		category: 'device',
	},
	{
		pattern: /(?:^|\/)\bhdparm\b.*--security-erase/i,
		reason: 'Hard drive security erase',
		category: 'device',
	},

	// === FORK BOMBS AND SYSTEM RESOURCE ATTACKS ===
	{
		pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
		reason: 'Fork bomb detected',
		category: 'destructive',
	},
	{
		pattern: /\bfork\b.*\bwhile\b.*\btrue\b/i,
		reason: 'Potential fork bomb pattern',
		category: 'destructive',
	},

	// === PERMISSION ATTACKS ===
	{
		pattern: /(?:^|\/)\bchmod\b\s+.*-[a-z]*R[a-z]*\s+0{3,4}\s+\//i,
		reason: 'Recursively removing all permissions from root',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\bchown\b\s+.*-[a-z]*R[a-z]*\s+.*\s+\/(?:\s|$)/i,
		reason: 'Recursively changing ownership of root filesystem',
		category: 'system',
	},

	// === NETWORK EXFILTRATION / REMOTE CODE EXECUTION ===
	{
		pattern: /(?:curl|wget)\b.*\|\s*(?:ba)?sh\b/i,
		reason:
			'Piping downloaded content directly to shell (remote code execution risk)',
		category: 'exfiltration',
	},
	{
		pattern: /(?:curl|wget)\b.*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i,
		reason: 'Piping downloaded content to shell with elevated privileges',
		category: 'exfiltration',
	},
	{
		pattern: /\bbash\b\s+-c\s+.*\$\((?:curl|wget)\b/i,
		reason: 'Executing downloaded content via bash -c',
		category: 'exfiltration',
	},
	{
		pattern: /\beval\b.*\$\((?:curl|wget)\b/i,
		reason: 'Evaluating downloaded content',
		category: 'exfiltration',
	},
	{
		pattern: /\bsource\b.*<\((?:curl|wget)\b/i,
		reason: 'Sourcing downloaded content',
		category: 'exfiltration',
	},

	// === SYSTEM CONFIGURATION MODIFICATION ===
	{
		pattern: />\s*\/etc\/(?:passwd|shadow|sudoers|hosts)\b/i,
		reason: 'Writing to critical system file',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\bvisudo\b/i,
		reason: 'Modifying sudoers configuration',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\busermod\b.*-[a-z]*G[a-z]*\s+(?:sudo|wheel|root)/i,
		reason: 'Adding user to privileged group',
		category: 'system',
	},

	// === SHELL CONFIG MODIFICATION (with destructive patterns) ===
	// Note: We only block single > (overwrite), not >> (append) which is safe
	{
		pattern: /(?<!>)>\s*~?\/?\.\b(?:bash_profile|bashrc|zshrc|profile)\b/i,
		reason: 'Overwriting shell configuration file (use >> to append instead)',
		category: 'config',
	},
	{
		pattern:
			/echo\b.*(?<!>)>\s*~?\/?\.\b(?:bash_profile|bashrc|zshrc|profile|zprofile)\b/i,
		reason: 'Overwriting shell configuration file',
		category: 'config',
	},

	// === BOOT AND KERNEL ===
	{
		pattern: /(?:^|\/)\brm\b.*\/boot\//i,
		reason: 'Deleting boot files',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\brm\b.*\/lib\/modules\//i,
		reason: 'Deleting kernel modules',
		category: 'system',
	},
	{
		pattern: />\s*\/boot\//i,
		reason: 'Writing to boot directory',
		category: 'system',
	},

	// === INIT SYSTEM ATTACKS ===
	{
		pattern: /(?:^|\/)\binit\s+0\b/i,
		reason: 'Shutting down the system',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\btelinit\s+0\b/i,
		reason: 'Shutting down the system',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\bhalt\b(?:\s|$)/i,
		reason: 'Halting the system',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\bpoweroff\b(?:\s|$)/i,
		reason: 'Powering off the system',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\bshutdown\b/i,
		reason: 'Shutting down the system',
		category: 'system',
	},
	{
		pattern: /(?:^|\/)\breboot\b(?:\s|$)/i,
		reason: 'Rebooting the system',
		category: 'system',
	},
];

// ============================================================================
// Main Validator Function
// ============================================================================

const validator = (args: {
	command: string;
}): Promise<{valid: true} | {valid: false; error: string}> => {
	const command = args.command?.trim();

	// Check if command is empty
	if (!command) {
		return Promise.resolve({
			valid: false,
			error: '⚒ Command cannot be empty',
		});
	}

	// Split command into segments (handles chaining and subshells)
	const commandSegments = splitCommands(command);

	// Also check the full command for patterns that span across segments
	const allToCheck = [command, ...commandSegments];

	for (const segment of allToCheck) {
		// Check for root filesystem targeting
		if (targetsRootOrSystemPath(segment)) {
			return Promise.resolve({
				valid: false,
				error:
					'⚒ Command blocked: Targets root filesystem or critical system paths.\n' +
					'   This operation could destroy the entire system.',
			});
		}

		// Check against all dangerous patterns
		for (const {pattern, reason, category} of dangerousPatterns) {
			if (pattern.test(segment)) {
				const categoryLabels: Record<string, string> = {
					destructive: 'Destructive Operation',
					system: 'System Modification',
					exfiltration: 'Security Risk',
					config: 'Configuration Risk',
					device: 'Device Operation',
				};

				return Promise.resolve({
					valid: false,
					error:
						`⚒ Command blocked [${categoryLabels[category]}]: ${reason}\n` +
						`   Matched: "${segment.substring(0, 100)}${
							segment.length > 100 ? '...' : ''
						}"`,
				});
			}
		}
	}

	return Promise.resolve({valid: true});
};

// Nanocoder tool definition with AI SDK core tool + custom extensions
export const executeBashTool: ToolDefinition = {
	name: 'execute_bash',
	tool: executeBashCoreTool, // Native AI SDK tool (no execute)
	handler: executeExecuteBash,
	formatter,
	validator,
};
