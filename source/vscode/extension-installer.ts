/**
 * VS Code extension installation utilities
 */

import {execSync, spawn} from 'child_process';
import {existsSync} from 'fs';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the path to the bundled VSIX file
 */
export function getVsixPath(): string {
	// In development: assets folder is at project root
	// In production (npm install): assets folder is in package root
	const possiblePaths = [
		join(__dirname, '../../assets/nanocoder-vscode.vsix'), // development
		join(__dirname, '../../../assets/nanocoder-vscode.vsix'), // npm installed
	];

	for (const path of possiblePaths) {
		if (existsSync(path)) {
			return path;
		}
	}

	throw new Error('VS Code extension VSIX not found in package');
}

/**
 * Check if the VS Code CLI is available
 */
export function isVSCodeCliAvailable(): boolean {
	try {
		execSync('code --version', {stdio: 'ignore'});
		return true;
	} catch {
		// Expected: VS Code CLI not installed
		return false;
	}
}

/**
 * Check if the nanocoder VS Code extension is installed
 */
export function isExtensionInstalled(): boolean {
	try {
		const output = execSync('code --list-extensions', {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'ignore'],
		});
		return output.toLowerCase().includes('nanocollective.nanocoder-vscode');
	} catch {
		// Expected: VS Code CLI not installed or extension check failed
		return false;
	}
}

/**
 * Install the VS Code extension from the bundled VSIX
 * Returns a promise that resolves when installation is complete
 */
export async function installExtension(): Promise<{
	success: boolean;
	message: string;
}> {
	if (!isVSCodeCliAvailable()) {
		return {
			success: false,
			message:
				'VS Code CLI not found. Please install the "code" command:\n' +
				'  1. Open VS Code\n' +
				'  2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)\n' +
				'  3. Type "Shell Command: Install \'code\' command in PATH"',
		};
	}

	try {
		const vsixPath = getVsixPath();

		return new Promise(resolve => {
			const child = spawn('code', ['--install-extension', vsixPath], {
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';

			child.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			child.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			child.on('close', code => {
				if (code === 0) {
					resolve({
						success: true,
						message:
							'VS Code extension installed successfully! Please reload VS Code to activate it.',
					});
				} else {
					resolve({
						success: false,
						message: `Failed to install extension: ${stderr || stdout}`,
					});
				}
			});

			child.on('error', error => {
				resolve({
					success: false,
					message: `Failed to install extension: ${error.message}`,
				});
			});
		});
	} catch (error) {
		return {
			success: false,
			message: `Failed to install extension: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}
