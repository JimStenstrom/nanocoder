/**
 * Workflow types for Claude Planning & Review workflow
 *
 * This module defines types for a three-phase workflow:
 * 1. Planning (Claude) - Analyzes request and creates structured tasks
 * 2. Implementation (Local LLM) - Executes the tasks
 * 3. Review (Claude) - Reviews changes and provides feedback
 */

/**
 * The current phase of the workflow
 */
export type WorkflowPhase =
	| 'idle'
	| 'planning'
	| 'plan_review'
	| 'implementing'
	| 'reviewing'
	| 'revision'
	| 'complete';

/**
 * Status of an individual task
 */
export type TaskStatus =
	| 'pending'
	| 'in_progress'
	| 'completed'
	| 'failed'
	| 'needs_revision'
	| 'skipped';

/**
 * Priority level for tasks
 */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Result of a task execution
 */
export interface TaskResult {
	filesModified: string[];
	filesCreated: string[];
	filesDeleted: string[];
	summary: string;
	issues?: string[];
	checkpointId?: string;
}

/**
 * A single task within an execution plan
 */
export interface TaskDefinition {
	id: string;
	title: string;
	description: string;
	acceptanceCriteria: string[];
	targetFiles: string[];
	approach: string;
	dependencies: string[]; // IDs of tasks that must complete first
	priority: TaskPriority;
	status: TaskStatus;
	estimatedComplexity?: 'trivial' | 'simple' | 'moderate' | 'complex';
	result?: TaskResult;
	revisionNotes?: string;
	attempts: number;
}

/**
 * Context gathered during planning phase
 */
export interface PlanContext {
	relevantFiles: string[];
	codebaseNotes: string;
	existingPatterns: string[];
	potentialRisks: string[];
}

/**
 * A revision entry tracking feedback and changes
 */
export interface RevisionEntry {
	id: string;
	timestamp: number;
	phase: 'planning' | 'implementation';
	reviewFeedback: string;
	tasksAffected: string[];
	changes: string[];
	resolved: boolean;
}

/**
 * Review feedback for a specific task
 */
export interface TaskReviewFeedback {
	taskId: string;
	passed: boolean;
	criteriaResults: {
		criterion: string;
		met: boolean;
		notes?: string;
	}[];
	issues: string[];
	suggestions: string[];
	severity: 'blocking' | 'warning' | 'info';
}

/**
 * Result of a review phase
 */
export interface ReviewResult {
	approved: boolean;
	overallFeedback: string;
	taskFeedback: TaskReviewFeedback[];
	criticalIssues: string[];
	revisionTasks: Partial<TaskDefinition>[];
	qualityScore?: number; // 0-100
}

/**
 * The complete execution plan
 */
export interface ExecutionPlan {
	id: string;
	version: number;
	originalRequest: string;
	createdAt: number;
	updatedAt: number;
	phase: WorkflowPhase;
	tasks: TaskDefinition[];
	context: PlanContext;
	revisionHistory: RevisionEntry[];
	currentTaskIndex: number;
	metadata: {
		planningModel: string;
		codingModel: string;
		reviewModel: string;
		totalRevisions: number;
		maxRevisions: number;
	};
}

/**
 * Workflow configuration from agents.config.json
 */
export interface WorkflowConfig {
	planningModel: {
		provider: string;
		model: string;
	};
	codingModel: {
		provider: string;
		model: string;
	};
	reviewModel: {
		provider: string;
		model: string;
	};
	/** Whether to auto-proceed between phases without user confirmation */
	autoAdvance?: boolean;
	/** Maximum revision cycles before requiring human intervention */
	maxRevisions?: number;
	/** Whether to review after each task (true) or after all tasks (false) */
	reviewPerTask?: boolean;
	/** Create checkpoints after each task */
	checkpointPerTask?: boolean;
	/** Allow parallel execution of independent tasks */
	parallelTasks?: boolean;
}

/**
 * Events emitted during workflow execution
 */
export type WorkflowEvent =
	| {type: 'phase_changed'; from: WorkflowPhase; to: WorkflowPhase}
	| {type: 'task_started'; task: TaskDefinition}
	| {type: 'task_completed'; task: TaskDefinition; result: TaskResult}
	| {type: 'task_failed'; task: TaskDefinition; error: string}
	| {type: 'review_started'}
	| {type: 'review_completed'; result: ReviewResult}
	| {type: 'revision_requested'; revision: RevisionEntry}
	| {type: 'workflow_completed'; plan: ExecutionPlan}
	| {type: 'workflow_aborted'; reason: string};

/**
 * Callback type for workflow events
 */
export type WorkflowEventCallback = (event: WorkflowEvent) => void;

/**
 * State snapshot for workflow UI
 */
export interface WorkflowUIState {
	phase: WorkflowPhase;
	planId: string | null;
	tasks: {
		total: number;
		completed: number;
		failed: number;
		pending: number;
	};
	currentTask: TaskDefinition | null;
	lastReview: ReviewResult | null;
	revisionCount: number;
	isTransitioning: boolean;
}

/**
 * Options for creating a new workflow
 */
export interface CreateWorkflowOptions {
	request: string;
	config: WorkflowConfig;
	skipPlanning?: boolean;
	existingPlan?: ExecutionPlan;
}

/**
 * Helper to create a new task definition
 */
export function createTask(
	partial: Partial<TaskDefinition> & Pick<TaskDefinition, 'id' | 'title'>,
): TaskDefinition {
	return {
		description: '',
		acceptanceCriteria: [],
		targetFiles: [],
		approach: '',
		dependencies: [],
		priority: 'medium',
		status: 'pending',
		attempts: 0,
		...partial,
	};
}

/**
 * Helper to create a new execution plan
 */
export function createPlan(
	request: string,
	config: WorkflowConfig,
): ExecutionPlan {
	return {
		id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
		version: 1,
		originalRequest: request,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		phase: 'planning',
		tasks: [],
		context: {
			relevantFiles: [],
			codebaseNotes: '',
			existingPatterns: [],
			potentialRisks: [],
		},
		revisionHistory: [],
		currentTaskIndex: 0,
		metadata: {
			planningModel: `${config.planningModel.provider}/${config.planningModel.model}`,
			codingModel: `${config.codingModel.provider}/${config.codingModel.model}`,
			reviewModel: `${config.reviewModel.provider}/${config.reviewModel.model}`,
			totalRevisions: 0,
			maxRevisions: config.maxRevisions ?? 3,
		},
	};
}

/**
 * Check if a task can be executed (all dependencies met)
 */
export function canExecuteTask(
	task: TaskDefinition,
	allTasks: TaskDefinition[],
): boolean {
	if (task.status !== 'pending') return false;

	for (const depId of task.dependencies) {
		const dep = allTasks.find(t => t.id === depId);
		if (!dep || dep.status !== 'completed') {
			return false;
		}
	}

	return true;
}

/**
 * Get the next executable task from a plan
 */
export function getNextTask(plan: ExecutionPlan): TaskDefinition | null {
	for (const task of plan.tasks) {
		if (canExecuteTask(task, plan.tasks)) {
			return task;
		}
	}
	return null;
}

/**
 * Calculate workflow progress
 */
export function calculateProgress(plan: ExecutionPlan): {
	percentage: number;
	completed: number;
	total: number;
	failed: number;
} {
	const total = plan.tasks.length;
	const completed = plan.tasks.filter(t => t.status === 'completed').length;
	const failed = plan.tasks.filter(t => t.status === 'failed').length;

	return {
		percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
		completed,
		total,
		failed,
	};
}
