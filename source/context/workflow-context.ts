/**
 * Global Workflow Context
 *
 * Provides global state for the workflow mode.
 * Used by components and handlers to access current workflow state.
 */

import type {
	ExecutionPlan,
	TaskDefinition,
	WorkflowConfig,
	WorkflowPhase,
	WorkflowUIState,
} from '@/types/workflow';

/**
 * Current workflow state
 */
interface WorkflowContextState {
	isActive: boolean;
	phase: WorkflowPhase;
	plan: ExecutionPlan | null;
	config: WorkflowConfig | null;
	currentTask: TaskDefinition | null;
}

/**
 * Global workflow state
 */
let workflowState: WorkflowContextState = {
	isActive: false,
	phase: 'idle',
	plan: null,
	config: null,
	currentTask: null,
};

/**
 * Check if workflow mode is active
 */
export function isWorkflowActive(): boolean {
	return workflowState.isActive;
}

/**
 * Get the current workflow phase
 */
export function getWorkflowPhase(): WorkflowPhase {
	return workflowState.phase;
}

/**
 * Get the current execution plan
 */
export function getCurrentPlan(): ExecutionPlan | null {
	return workflowState.plan;
}

/**
 * Get the workflow configuration
 */
export function getWorkflowConfig(): WorkflowConfig | null {
	return workflowState.config;
}

/**
 * Get the current task being executed
 */
export function getCurrentTask(): TaskDefinition | null {
	return workflowState.currentTask;
}

/**
 * Set workflow as active with initial config
 */
export function activateWorkflow(config: WorkflowConfig): void {
	workflowState = {
		isActive: true,
		phase: 'planning',
		plan: null,
		config,
		currentTask: null,
	};
}

/**
 * Deactivate workflow mode
 */
export function deactivateWorkflow(): void {
	workflowState = {
		isActive: false,
		phase: 'idle',
		plan: null,
		config: null,
		currentTask: null,
	};
}

/**
 * Set the current workflow phase
 */
export function setWorkflowPhase(phase: WorkflowPhase): void {
	workflowState.phase = phase;
}

/**
 * Set the current execution plan
 */
export function setCurrentPlan(plan: ExecutionPlan | null): void {
	workflowState.plan = plan;
	if (plan) {
		workflowState.phase = plan.phase;
	}
}

/**
 * Set the current task
 */
export function setCurrentTask(task: TaskDefinition | null): void {
	workflowState.currentTask = task;
}

/**
 * Get a snapshot of the current workflow state for UI
 */
export function getWorkflowUIState(): WorkflowUIState {
	const plan = workflowState.plan;

	if (!plan) {
		return {
			phase: workflowState.phase,
			planId: null,
			tasks: {
				total: 0,
				completed: 0,
				failed: 0,
				pending: 0,
			},
			currentTask: null,
			lastReview: null,
			revisionCount: 0,
			isTransitioning: false,
		};
	}

	const completed = plan.tasks.filter(t => t.status === 'completed').length;
	const failed = plan.tasks.filter(t => t.status === 'failed').length;
	const total = plan.tasks.length;

	return {
		phase: plan.phase,
		planId: plan.id,
		tasks: {
			total,
			completed,
			failed,
			pending: total - completed - failed,
		},
		currentTask: workflowState.currentTask,
		lastReview: null,
		revisionCount: plan.metadata.totalRevisions,
		isTransitioning: false,
	};
}

/**
 * Get full workflow state (for debugging/logging)
 */
export function getFullWorkflowState(): WorkflowContextState {
	return {...workflowState};
}

/**
 * Reset workflow context (for testing)
 */
export function resetWorkflowContext(): void {
	workflowState = {
		isActive: false,
		phase: 'idle',
		plan: null,
		config: null,
		currentTask: null,
	};
}
