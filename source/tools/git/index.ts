/**
 * Git Workflow Tools
 *
 * Advanced git workflow integration for nanocoder.
 * Provides intelligent version control operations including:
 * - Smart commit message generation
 * - PR template creation
 * - Branch naming suggestions
 * - Enhanced status reporting
 */

export {gitSmartCommitTool} from './git-smart-commit';
export {gitCreatePRTool} from './git-create-pr';
export {gitBranchSuggestTool} from './git-branch-suggest';
export {gitStatusEnhancedTool} from './git-status-enhanced';

// Re-export types for external use
export type {
	CommitType,
	FileChange,
	FileChangeStatus,
	DiffAnalysis,
	GeneratedCommit,
	WorkflowStrategy,
	BranchSuggestion,
	PRTemplate,
	EnhancedStatus,
	SmartCommitInput,
	CreatePRInput,
	BranchSuggestInput,
	EnhancedStatusInput,
} from './types';

// Re-export utilities for potential use by other tools
export {
	execGit,
	isGitRepository,
	getCurrentBranch,
	getDefaultBranch,
	analyzeStagedChanges,
	getEnhancedStatus,
} from './utils';
