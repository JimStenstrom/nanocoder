/**
 * Git Workflow Utilities
 *
 * Shared utilities for git operations including command execution,
 * diff parsing, and analysis functions.
 */

import {spawn} from 'node:child_process';
import type {
	CommitType,
	FileChange,
	FileChangeStatus,
	DiffAnalysis,
	EnhancedStatus,
} from './types';

/**
 * Execute a git command and return the output
 */
export async function execGit(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn('git', args);
		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		proc.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on('close', (code: number | null) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				// Some git commands use stderr for non-error output
				// Only reject if we have actual error indicators
				if (stderr.includes('fatal:') || stderr.includes('error:')) {
					reject(new Error(stderr.trim() || `Git command failed with code ${code}`));
				} else {
					resolve(stdout.trim());
				}
			}
		});

		proc.on('error', error => {
			reject(new Error(`Failed to execute git: ${error.message}`));
		});
	});
}

/**
 * Check if current directory is a git repository
 */
export async function isGitRepository(): Promise<boolean> {
	try {
		await execGit(['rev-parse', '--is-inside-work-tree']);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(): Promise<string> {
	return execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
}

/**
 * Get the default branch (main or master)
 */
export async function getDefaultBranch(): Promise<string> {
	try {
		// Try to get from remote origin
		const remoteBranch = await execGit([
			'symbolic-ref',
			'refs/remotes/origin/HEAD',
			'--short',
		]);
		return remoteBranch.replace('origin/', '');
	} catch {
		// Fall back to checking if main or master exists
		try {
			await execGit(['rev-parse', '--verify', 'main']);
			return 'main';
		} catch {
			try {
				await execGit(['rev-parse', '--verify', 'master']);
				return 'master';
			} catch {
				return 'main'; // Default to main
			}
		}
	}
}

/**
 * Parse git diff --stat output to extract file changes
 */
export function parseDiffStat(diffStat: string): FileChange[] {
	const files: FileChange[] = [];
	const lines = diffStat.split('\n').filter(line => line.trim());

	for (const line of lines) {
		// Skip summary line (e.g., "3 files changed, 10 insertions(+), 5 deletions(-)")
		if (line.includes('files changed') || line.includes('file changed')) {
			continue;
		}

		// Parse line format: " path/to/file.ts | 10 ++++---"
		const match = line.match(/^\s*(.+?)\s+\|\s+(\d+|Bin)/);
		if (match) {
			const path = match[1].trim();
			const isBinary = match[2] === 'Bin';

			// Count + and - signs for additions/deletions
			const changesMatch = line.match(/\|.*?(\d+)?\s*([+-]+)?/);
			let additions = 0;
			let deletions = 0;

			if (changesMatch && changesMatch[2]) {
				additions = (changesMatch[2].match(/\+/g) || []).length;
				deletions = (changesMatch[2].match(/-/g) || []).length;
			}

			// Detect renames (format: old => new)
			const renameMatch = path.match(/(.+)\s*=>\s*(.+)/);
			let finalPath = path;
			let oldPath: string | undefined;
			let status: FileChangeStatus = 'modified';

			if (renameMatch) {
				// Handle various rename formats
				const prefix = path.match(/^{?([^{}]*)\s*=>/)?.[1] || '';
				const suffix = path.match(/=>\s*([^{}]*)}/)?.[1] || '';
				oldPath = renameMatch[1].trim();
				finalPath = renameMatch[2].trim();
				status = 'renamed';
			}

			files.push({
				path: finalPath,
				status,
				oldPath,
				additions,
				deletions,
				isBinary,
			});
		}
	}

	return files;
}

/**
 * Parse git status --porcelain output
 */
export function parseGitStatus(statusOutput: string): {
	staged: FileChange[];
	unstaged: FileChange[];
	untracked: string[];
	conflicts: string[];
} {
	const staged: FileChange[] = [];
	const unstaged: FileChange[] = [];
	const untracked: string[] = [];
	const conflicts: string[] = [];

	const lines = statusOutput.split('\n').filter(line => line.trim());

	for (const line of lines) {
		if (line.length < 3) continue;

		const indexStatus = line[0];
		const workTreeStatus = line[1];
		const path = line.slice(3).trim();

		// Detect conflicts (both modified)
		if (indexStatus === 'U' || workTreeStatus === 'U') {
			conflicts.push(path);
			continue;
		}

		// Untracked files
		if (indexStatus === '?' && workTreeStatus === '?') {
			untracked.push(path);
			continue;
		}

		// Staged changes (index status)
		if (indexStatus !== ' ' && indexStatus !== '?') {
			staged.push({
				path,
				status: mapStatusChar(indexStatus),
				additions: 0,
				deletions: 0,
				isBinary: false,
			});
		}

		// Unstaged changes (work tree status)
		if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
			unstaged.push({
				path,
				status: mapStatusChar(workTreeStatus),
				additions: 0,
				deletions: 0,
				isBinary: false,
			});
		}
	}

	return {staged, unstaged, untracked, conflicts};
}

/**
 * Map git status character to FileChangeStatus
 */
function mapStatusChar(char: string): FileChangeStatus {
	switch (char) {
		case 'A':
			return 'added';
		case 'D':
			return 'deleted';
		case 'R':
			return 'renamed';
		case 'C':
			return 'copied';
		case 'M':
		default:
			return 'modified';
	}
}

/**
 * Analyze staged changes to suggest commit type
 */
export function analyzeChangesForCommitType(files: FileChange[]): CommitType {
	// Check file patterns to determine commit type
	const paths = files.map(f => f.path.toLowerCase());

	// Test files
	if (
		paths.every(
			p =>
				p.includes('test') ||
				p.includes('spec') ||
				p.includes('__tests__') ||
				p.endsWith('.test.ts') ||
				p.endsWith('.test.tsx') ||
				p.endsWith('.spec.ts') ||
				p.endsWith('.spec.tsx'),
		)
	) {
		return 'test';
	}

	// Documentation
	if (
		paths.every(
			p =>
				p.endsWith('.md') ||
				p.includes('readme') ||
				p.includes('docs/') ||
				p.includes('documentation'),
		)
	) {
		return 'docs';
	}

	// CI/CD
	if (
		paths.every(
			p =>
				p.includes('.github/') ||
				p.includes('.gitlab-ci') ||
				p.includes('jenkinsfile') ||
				p.includes('.circleci') ||
				p.includes('.travis'),
		)
	) {
		return 'ci';
	}

	// Build configuration
	if (
		paths.every(
			p =>
				p.includes('package.json') ||
				p.includes('webpack') ||
				p.includes('vite') ||
				p.includes('rollup') ||
				p.includes('tsconfig') ||
				p.includes('babel') ||
				p.includes('eslint') ||
				p.includes('prettier'),
		)
	) {
		return 'build';
	}

	// Style changes (CSS, formatting)
	if (
		paths.every(
			p =>
				p.endsWith('.css') ||
				p.endsWith('.scss') ||
				p.endsWith('.less') ||
				p.endsWith('.styled.ts') ||
				p.endsWith('.styled.tsx'),
		)
	) {
		return 'style';
	}

	// All new files = likely a feature
	if (files.every(f => f.status === 'added')) {
		return 'feat';
	}

	// All deletions = likely chore/cleanup
	if (files.every(f => f.status === 'deleted')) {
		return 'chore';
	}

	// If files contain "fix" in path or small changes in specific files
	if (
		paths.some(p => p.includes('fix')) ||
		(files.length <= 3 &&
			files.every(f => f.additions + f.deletions < 20))
	) {
		return 'fix';
	}

	// Default to feat for larger changes
	return 'feat';
}

/**
 * Suggest a scope based on file paths
 */
export function suggestScope(files: FileChange[]): string | undefined {
	if (files.length === 0) return undefined;

	const paths = files.map(f => f.path);

	// Extract common directory patterns
	const directories = paths.map(p => {
		const parts = p.split('/');
		// Return second level for src/components/Button.tsx -> components
		if (parts[0] === 'source' || parts[0] === 'src') {
			return parts[1];
		}
		return parts[0];
	});

	// Find most common directory
	const counts = new Map<string, number>();
	for (const dir of directories) {
		if (dir) {
			counts.set(dir, (counts.get(dir) || 0) + 1);
		}
	}

	// If all files are in same directory, use it as scope
	if (counts.size === 1) {
		const scope = directories[0];
		// Don't use generic names as scope
		if (scope && !['lib', 'utils', 'helpers', 'common'].includes(scope)) {
			return scope;
		}
	}

	return undefined;
}

/**
 * Detect potential breaking changes in the diff
 */
export async function detectBreakingChanges(
	files: FileChange[],
): Promise<{isBreaking: boolean; reason?: string}> {
	// Check for common breaking change indicators
	const breakingPatterns = [
		// API changes
		{pattern: /export\s+interface\s+\w+\s*{/, type: 'interface change'},
		{pattern: /export\s+type\s+\w+\s*=/, type: 'type change'},
		{pattern: /export\s+function\s+\w+/, type: 'function signature change'},
		// Configuration changes
		{pattern: /BREAKING|DEPRECATED/, type: 'explicit breaking marker'},
	];

	// For now, we'll check file patterns that commonly indicate breaking changes
	const riskyPaths = files.filter(
		f =>
			f.path.includes('types') ||
			f.path.includes('interfaces') ||
			f.path.includes('api') ||
			f.path.includes('schema') ||
			f.path.includes('public'),
	);

	// If modifying public API files with deletions
	if (riskyPaths.length > 0 && riskyPaths.some(f => f.deletions > 0)) {
		return {
			isBreaking: true,
			reason: `Modifying public API files: ${riskyPaths.map(f => f.path).join(', ')}`,
		};
	}

	return {isBreaking: false};
}

/**
 * Analyze staged changes comprehensively
 */
export async function analyzeStagedChanges(): Promise<DiffAnalysis> {
	// Get diff stat
	const diffStat = await execGit(['diff', '--staged', '--stat']);
	const files = parseDiffStat(diffStat);

	// Get numstat for accurate counts
	const numstat = await execGit(['diff', '--staged', '--numstat']);
	const numstatLines = numstat.split('\n').filter(line => line.trim());

	for (const line of numstatLines) {
		const parts = line.split('\t');
		if (parts.length >= 3) {
			const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
			const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
			const path = parts[2];

			const file = files.find(f => f.path === path || f.path.includes(path));
			if (file) {
				file.additions = additions;
				file.deletions = deletions;
			}
		}
	}

	const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
	const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

	const suggestedType = analyzeChangesForCommitType(files);
	const suggestedScope = suggestScope(files);
	const {isBreaking, reason} = await detectBreakingChanges(files);

	return {
		files,
		totalAdditions,
		totalDeletions,
		totalFiles: files.length,
		suggestedType,
		suggestedScope,
		isBreakingChange: isBreaking,
		breakingChangeReason: reason,
	};
}

/**
 * Get enhanced git status
 */
export async function getEnhancedStatus(): Promise<EnhancedStatus> {
	// Get porcelain status
	const statusOutput = await execGit(['status', '--porcelain']);
	const {staged, unstaged, untracked, conflicts} = parseGitStatus(statusOutput);

	// Get branch info
	const branch = await getCurrentBranch();

	// Get upstream info
	let upstream: string | undefined;
	let ahead = 0;
	let behind = 0;

	try {
		upstream = await execGit(['rev-parse', '--abbrev-ref', '@{upstream}']);
		const aheadBehind = await execGit([
			'rev-list',
			'--left-right',
			'--count',
			`${upstream}...HEAD`,
		]);
		const [behindCount, aheadCount] = aheadBehind.split('\t').map(n => parseInt(n, 10));
		ahead = aheadCount || 0;
		behind = behindCount || 0;
	} catch {
		// No upstream configured
	}

	// Build summary
	const summaryParts: string[] = [];
	if (staged.length > 0) summaryParts.push(`${staged.length} staged`);
	if (unstaged.length > 0) summaryParts.push(`${unstaged.length} modified`);
	if (untracked.length > 0) summaryParts.push(`${untracked.length} untracked`);
	if (conflicts.length > 0) summaryParts.push(`${conflicts.length} conflicts`);
	if (ahead > 0) summaryParts.push(`${ahead} ahead`);
	if (behind > 0) summaryParts.push(`${behind} behind`);

	const summary =
		summaryParts.length > 0 ? summaryParts.join(', ') : 'Working tree clean';

	return {
		branch,
		upstream,
		ahead,
		behind,
		staged,
		unstaged,
		untracked,
		hasConflicts: conflicts.length > 0,
		conflicts,
		summary,
	};
}

/**
 * Get commits between current branch and target
 */
export async function getCommitsBetween(
	targetBranch: string,
): Promise<Array<{hash: string; subject: string; body: string}>> {
	try {
		const log = await execGit([
			'log',
			`${targetBranch}..HEAD`,
			'--format=%H%n%s%n%b%n---COMMIT_SEPARATOR---',
		]);

		if (!log.trim()) {
			return [];
		}

		const commitBlocks = log.split('---COMMIT_SEPARATOR---').filter(b => b.trim());

		return commitBlocks.map(block => {
			const lines = block.trim().split('\n');
			return {
				hash: lines[0] || '',
				subject: lines[1] || '',
				body: lines.slice(2).join('\n').trim(),
			};
		});
	} catch {
		return [];
	}
}

/**
 * Get list of contributors who have modified the changed files
 */
export async function getSuggestedReviewers(
	files: FileChange[],
): Promise<string[]> {
	const reviewers = new Set<string>();

	for (const file of files.slice(0, 5)) {
		// Limit to avoid too many git commands
		try {
			const log = await execGit([
				'log',
				'--format=%ae',
				'-n',
				'5',
				'--',
				file.path,
			]);
			for (const email of log.split('\n').filter(e => e.trim())) {
				reviewers.add(email.trim());
			}
		} catch {
			// File might be new
		}
	}

	// Remove current user
	try {
		const currentUser = await execGit(['config', 'user.email']);
		reviewers.delete(currentUser.trim());
	} catch {
		// Config might not be set
	}

	return Array.from(reviewers).slice(0, 5);
}
