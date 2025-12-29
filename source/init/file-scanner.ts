import {existsSync, readdirSync, readFileSync, statSync} from 'fs';
import {basename, join, relative} from 'path';
import {MAX_DIRECTORY_DEPTH, MAX_FILES_TO_SCAN} from '@/constants';

interface ScanResult {
	files: string[];
	directories: string[];
	totalFiles: number;
	scannedFiles: number;
}

export class FileScanner {
	private gitignorePatterns: string[] = [];
	private maxFiles = MAX_FILES_TO_SCAN; // Prevent scanning massive codebases
	private maxDepth = MAX_DIRECTORY_DEPTH; // Prevent infinite recursion

	constructor(private rootPath: string) {
		this.loadGitignore();
	}

	/**
	 * Load and parse .gitignore patterns
	 */
	private loadGitignore(): void {
		const gitignorePath = join(this.rootPath, '.gitignore');

		if (!existsSync(gitignorePath)) {
			return;
		}

		try {
			const content = readFileSync(gitignorePath, 'utf-8');
			this.gitignorePatterns = content
				.split('\n')
				.map(line => line.trim())
				.filter(line => line && !line.startsWith('#'))
				.map(pattern => {
					// Convert gitignore patterns to simple regex patterns
					return pattern
						.replace(/\*/g, '.*') // * -> .*
						.replace(/\?/g, '.') // ? -> .
						.replace(/\/$/, ''); // Remove trailing slash
				});
		} catch {
			// Ignore gitignore parsing errors
		}
	}

	/**
	 * Check if a file/directory should be ignored based on .gitignore
	 */
	private shouldIgnore(filePath: string): boolean {
		const relativePath = relative(this.rootPath, filePath);
		const fileName = basename(filePath);

		// Always ignore these directories
		const alwaysIgnore = [
			'node_modules',
			'.git',
			'.svn',
			'.hg',
			'dist',
			'build',
			'.next',
			'.nuxt',
			'__pycache__',
			'.pytest_cache',
			'target',
			'coverage',
		];

		if (
			alwaysIgnore.some(
				ignored => relativePath.includes(ignored) || fileName === ignored,
			)
		) {
			return true;
		}

		// Check gitignore patterns
		return this.gitignorePatterns.some(pattern => {
			// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
			// pattern comes from .gitignore file, not user input
			const regex = new RegExp(`^${pattern}$`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
			return regex.test(relativePath) || regex.test(fileName);
		});
	}

	/**
	 * Recursively scan directory for files
	 */
	public scan(): ScanResult {
		const result: ScanResult = {
			files: [],
			directories: [],
			totalFiles: 0,
			scannedFiles: 0,
		};

		this.scanDirectory(this.rootPath, result, 0);
		return result;
	}

	/**
	 * Recursively scan a directory
	 */
	private scanDirectory(
		dirPath: string,
		result: ScanResult,
		depth: number,
	): void {
		if (depth > this.maxDepth || result.scannedFiles >= this.maxFiles) {
			return;
		}

		if (this.shouldIgnore(dirPath)) {
			return;
		}

		try {
			const entries = readdirSync(dirPath);

			for (const entry of entries) {
				if (result.scannedFiles >= this.maxFiles) {
					break;
				}

				// nosemgrep
				const fullPath = join(dirPath, entry); // nosemgrep
				const relativePath = relative(this.rootPath, fullPath);

				if (this.shouldIgnore(fullPath)) {
					continue;
				}

				try {
					const stats = statSync(fullPath);

					if (stats.isDirectory()) {
						result.directories.push(relativePath);
						this.scanDirectory(fullPath, result, depth + 1);
					} else if (stats.isFile()) {
						result.files.push(relativePath);
						result.scannedFiles++;
					}

					result.totalFiles++;
				} catch {
					// Skip files we can't stat (permission issues, etc.)
					continue;
				}
			}
		} catch {
			// Skip directories we can't read
			return;
		}
	}

	/**
	 * Convert a simple glob-like pattern (using '*' as wildcard) to a RegExp.
	 * Escapes regex metacharacters before expanding '*' to '.*'.
	 */
	private globToRegExp(pattern: string): RegExp {
		// Validate pattern to prevent ReDoS - only allow safe glob patterns
		if (pattern.length > 1000) {
			throw new Error('Pattern too long');
		}

		// Only allow safe characters in glob patterns
		if (/[^a-zA-Z0-9_\-./\\*?+[\]{}^$|()]/.test(pattern)) {
			throw new Error('Pattern contains unsafe characters');
		}

		// Escape all regex metacharacters, then replace escaped '*' with '.*'
		const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regexSource = escaped.replace(/\\\*/g, '.*');
		return new RegExp(regexSource, 'i'); /* nosemgrep */
	}

	/**
	 * Get files matching specific patterns
	 */
	public getFilesByPattern(patterns: string[]): string[] {
		const scanResult = this.scan();
		return scanResult.files.filter(file =>
			patterns.some(pattern => {
				const regex = this.globToRegExp(pattern);
				return regex.test(file) || regex.test(basename(file));
			}),
		);
	}

	/**
	 * Get key project files
	 */
	public getProjectFiles(): {[key: string]: string[]} {
		return {
			config: this.getFilesByPattern([
				'package.json',
				'requirements.txt',
				'Cargo.toml',
				'go.mod',
				'composer.json',
				'Gemfile',
				'setup.py',
				'pyproject.toml',
				'yarn.lock',
				'pnpm-lock.yaml',
			]),
			documentation: this.getFilesByPattern([
				'README*',
				'CHANGELOG*',
				'LICENSE*',
				'CONTRIBUTING*',
				'*.md',
				'docs/*',
			]),
			build: this.getFilesByPattern([
				'Makefile',
				'CMakeLists.txt',
				'build.gradle',
				'webpack.config.*',
				'vite.config.*',
				'rollup.config.*',
				'tsconfig.json',
				'jsconfig.json',
			]),
			test: this.getFilesByPattern([
				'*test*',
				'*spec*',
				'__tests__/*',
				'test/*',
				'tests/*',
				'spec/*',
			]),
		};
	}
}
