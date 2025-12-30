/**
 * Workflow Manager Service
 *
 * Orchestrates the Claude Planning & Review workflow:
 * 1. Planning Phase (Claude) - Creates structured tasks
 * 2. Implementation Phase (Local LLM) - Executes tasks
 * 3. Review Phase (Claude) - Reviews changes
 */

import type {
	ClientRole,
	MultiClientManager,
} from '@/ai-sdk-client/multi-client-manager';
import type {LLMClient} from '@/types/index';
import type {
	CreateWorkflowOptions,
	ExecutionPlan,
	ReviewResult,
	TaskDefinition,
	TaskResult,
	WorkflowConfig,
	WorkflowEvent,
	WorkflowEventCallback,
	WorkflowPhase,
	WorkflowUIState,
} from '@/types/workflow';
import {calculateProgress, createPlan, getNextTask} from '@/types/workflow';
import {getLogger} from '@/utils/logging';
import {
	getWorkflowPersistence,
	WorkflowPersistence,
} from './workflow-persistence';

/**
 * Result of parsing a planning response
 */
interface ParsedPlanResult {
	success: boolean;
	tasks?: TaskDefinition[];
	context?: ExecutionPlan['context'];
	error?: string;
}

/**
 * Result of parsing a review response
 */
interface ParsedReviewResult {
	success: boolean;
	review?: ReviewResult;
	error?: string;
}

/**
 * Workflow Manager - Core orchestration for planning/coding/review workflow
 */
export class WorkflowManager {
	private currentPlan: ExecutionPlan | null = null;
	private clientManager: MultiClientManager | null = null;
	private persistence: WorkflowPersistence;
	private eventListeners: Set<WorkflowEventCallback> = new Set();
	private config: WorkflowConfig | null = null;

	constructor(workspaceRoot?: string) {
		this.persistence = getWorkflowPersistence(workspaceRoot);
	}

	/**
	 * Initialize the workflow manager with clients
	 */
	async initialize(
		config: WorkflowConfig,
		clientManager: MultiClientManager,
	): Promise<void> {
		this.config = config;
		this.clientManager = clientManager;

		const logger = getLogger();
		logger.info('Workflow manager initialized', {
			hasConfig: !!config,
			hasClients: !!clientManager,
		});
	}

	/**
	 * Start a new workflow from a user request
	 */
	async startWorkflow(options: CreateWorkflowOptions): Promise<ExecutionPlan> {
		const logger = getLogger();

		if (!this.config) {
			throw new Error(
				'Workflow manager not initialized. Call initialize() first.',
			);
		}

		// Create new plan or use existing
		if (options.existingPlan) {
			this.currentPlan = options.existingPlan;
		} else {
			this.currentPlan = createPlan(options.request, options.config);
		}

		logger.info('Workflow started', {
			planId: this.currentPlan.id,
			request: options.request.substring(0, 100),
		});

		// Save initial plan
		await this.persistence.saveWorkflow(this.currentPlan);

		// Emit event
		this.emit({
			type: 'phase_changed',
			from: 'idle',
			to: 'planning',
		});

		return this.currentPlan;
	}

	/**
	 * Resume an existing workflow
	 */
	async resumeWorkflow(planId: string): Promise<ExecutionPlan | null> {
		const logger = getLogger();

		const plan = await this.persistence.loadWorkflow(planId);
		if (!plan) {
			logger.warn('Workflow not found for resume', {planId});
			return null;
		}

		this.currentPlan = plan;

		logger.info('Workflow resumed', {
			planId: plan.id,
			phase: plan.phase,
			taskProgress: calculateProgress(plan),
		});

		return plan;
	}

	/**
	 * Get the current execution plan
	 */
	getCurrentPlan(): ExecutionPlan | null {
		return this.currentPlan;
	}

	/**
	 * Get the current workflow phase
	 */
	getCurrentPhase(): WorkflowPhase {
		return this.currentPlan?.phase ?? 'idle';
	}

	/**
	 * Get the appropriate client for the current phase
	 */
	getClientForPhase(phase?: WorkflowPhase): LLMClient | null {
		if (!this.clientManager) return null;

		const targetPhase = phase ?? this.getCurrentPhase();
		const roleMap: Record<WorkflowPhase, ClientRole | null> = {
			idle: null,
			planning: 'planner',
			plan_review: 'planner',
			implementing: 'coder',
			reviewing: 'reviewer',
			revision: 'coder',
			complete: null,
		};

		const role = roleMap[targetPhase];
		if (!role) return null;

		return this.clientManager.switchTo(role);
	}

	/**
	 * Transition to a new phase
	 */
	async transitionToPhase(newPhase: WorkflowPhase): Promise<void> {
		if (!this.currentPlan) {
			throw new Error('No active workflow');
		}

		const oldPhase = this.currentPlan.phase;
		this.currentPlan.phase = newPhase;
		this.currentPlan.updatedAt = Date.now();

		await this.persistence.saveWorkflow(this.currentPlan);

		this.emit({
			type: 'phase_changed',
			from: oldPhase,
			to: newPhase,
		});

		const logger = getLogger();
		logger.info('Workflow phase transition', {
			planId: this.currentPlan.id,
			from: oldPhase,
			to: newPhase,
		});
	}

	/**
	 * Set tasks from planning phase response
	 */
	async setTasksFromPlanningResponse(
		parsedPlan: ParsedPlanResult,
	): Promise<void> {
		if (!this.currentPlan) {
			throw new Error('No active workflow');
		}

		if (!parsedPlan.success || !parsedPlan.tasks) {
			throw new Error(parsedPlan.error || 'Failed to parse planning response');
		}

		this.currentPlan.tasks = parsedPlan.tasks;
		if (parsedPlan.context) {
			this.currentPlan.context = parsedPlan.context;
		}

		await this.persistence.saveWorkflow(this.currentPlan);
	}

	/**
	 * Get the next task to execute
	 */
	getNextTask(): TaskDefinition | null {
		if (!this.currentPlan) return null;
		return getNextTask(this.currentPlan);
	}

	/**
	 * Mark a task as in progress
	 */
	async startTask(taskId: string): Promise<TaskDefinition | null> {
		if (!this.currentPlan) return null;

		const task = this.currentPlan.tasks.find(t => t.id === taskId);
		if (!task) return null;

		task.status = 'in_progress';
		task.attempts++;
		this.currentPlan.currentTaskIndex = this.currentPlan.tasks.indexOf(task);

		await this.persistence.saveWorkflow(this.currentPlan);

		this.emit({
			type: 'task_started',
			task,
		});

		return task;
	}

	/**
	 * Mark a task as completed
	 */
	async completeTask(taskId: string, result: TaskResult): Promise<void> {
		if (!this.currentPlan) {
			throw new Error('No active workflow');
		}

		const task = this.currentPlan.tasks.find(t => t.id === taskId);
		if (!task) {
			throw new Error(`Task '${taskId}' not found`);
		}

		task.status = 'completed';
		task.result = result;

		await this.persistence.saveWorkflow(this.currentPlan);

		this.emit({
			type: 'task_completed',
			task,
			result,
		});

		const logger = getLogger();
		logger.info('Task completed', {
			planId: this.currentPlan.id,
			taskId,
			filesModified: result.filesModified.length,
		});
	}

	/**
	 * Mark a task as failed
	 */
	async failTask(taskId: string, error: string): Promise<void> {
		if (!this.currentPlan) {
			throw new Error('No active workflow');
		}

		const task = this.currentPlan.tasks.find(t => t.id === taskId);
		if (!task) {
			throw new Error(`Task '${taskId}' not found`);
		}

		task.status = 'failed';
		task.result = {
			filesModified: [],
			filesCreated: [],
			filesDeleted: [],
			summary: `Failed: ${error}`,
			issues: [error],
		};

		await this.persistence.saveWorkflow(this.currentPlan);

		this.emit({
			type: 'task_failed',
			task,
			error,
		});
	}

	/**
	 * Check if all tasks are complete
	 */
	areAllTasksComplete(): boolean {
		if (!this.currentPlan) return false;

		return this.currentPlan.tasks.every(
			t => t.status === 'completed' || t.status === 'skipped',
		);
	}

	/**
	 * Process review result and handle revisions
	 */
	async processReviewResult(parsedReview: ParsedReviewResult): Promise<void> {
		if (!this.currentPlan || !this.config) {
			throw new Error('No active workflow or config');
		}

		if (!parsedReview.success || !parsedReview.review) {
			throw new Error(parsedReview.error || 'Failed to parse review response');
		}

		const review = parsedReview.review;

		this.emit({
			type: 'review_completed',
			result: review,
		});

		if (review.approved) {
			// Workflow complete!
			await this.transitionToPhase('complete');

			this.emit({
				type: 'workflow_completed',
				plan: this.currentPlan,
			});
		} else {
			// Handle revision
			this.currentPlan.metadata.totalRevisions++;

			if (
				this.currentPlan.metadata.totalRevisions >=
				this.currentPlan.metadata.maxRevisions
			) {
				// Max revisions reached - require human intervention
				const logger = getLogger();
				logger.warn('Max revisions reached', {
					planId: this.currentPlan.id,
					revisions: this.currentPlan.metadata.totalRevisions,
				});
			}

			// Add revision entry
			const revisionEntry = {
				id: `rev-${Date.now()}`,
				timestamp: Date.now(),
				phase: 'implementation' as const,
				reviewFeedback: review.overallFeedback,
				tasksAffected: review.taskFeedback
					.filter(tf => !tf.passed)
					.map(tf => tf.taskId),
				changes: [],
				resolved: false,
			};

			this.currentPlan.revisionHistory.push(revisionEntry);

			// Mark failed tasks for revision
			for (const feedback of review.taskFeedback) {
				if (!feedback.passed) {
					const task = this.currentPlan.tasks.find(
						t => t.id === feedback.taskId,
					);
					if (task) {
						task.status = 'needs_revision';
						task.revisionNotes = feedback.issues.join('\n');
					}
				}
			}

			// Add new revision tasks if provided
			if (review.revisionTasks && review.revisionTasks.length > 0) {
				for (const partial of review.revisionTasks) {
					if (partial.id && partial.title) {
						const newTask: TaskDefinition = {
							id: partial.id,
							title: partial.title,
							description: partial.description || '',
							acceptanceCriteria: partial.acceptanceCriteria || [],
							targetFiles: partial.targetFiles || [],
							approach: partial.approach || '',
							dependencies: partial.dependencies || [],
							priority: partial.priority || 'high',
							status: 'pending',
							attempts: 0,
						};
						this.currentPlan.tasks.push(newTask);
					}
				}
			}

			await this.persistence.saveWorkflow(this.currentPlan);

			this.emit({
				type: 'revision_requested',
				revision: revisionEntry,
			});

			// Transition back to implementing
			await this.transitionToPhase('revision');
		}
	}

	/**
	 * Abort the current workflow
	 */
	async abortWorkflow(reason: string): Promise<void> {
		if (!this.currentPlan) return;

		const logger = getLogger();
		logger.info('Workflow aborted', {
			planId: this.currentPlan.id,
			reason,
		});

		this.emit({
			type: 'workflow_aborted',
			reason,
		});

		// Keep the plan for potential resume, but mark phase
		this.currentPlan.phase = 'idle';
		await this.persistence.saveWorkflow(this.currentPlan);

		this.currentPlan = null;
	}

	/**
	 * Get UI state for rendering
	 */
	getUIState(): WorkflowUIState {
		if (!this.currentPlan) {
			return {
				phase: 'idle',
				planId: null,
				tasks: {total: 0, completed: 0, failed: 0, pending: 0},
				currentTask: null,
				lastReview: null,
				revisionCount: 0,
				isTransitioning: false,
			};
		}

		const progress = calculateProgress(this.currentPlan);
		const currentTask =
			this.currentPlan.tasks.find(t => t.status === 'in_progress') || null;

		return {
			phase: this.currentPlan.phase,
			planId: this.currentPlan.id,
			tasks: {
				total: progress.total,
				completed: progress.completed,
				failed: progress.failed,
				pending: progress.total - progress.completed - progress.failed,
			},
			currentTask,
			lastReview: null, // Would need to track this separately
			revisionCount: this.currentPlan.metadata.totalRevisions,
			isTransitioning: false,
		};
	}

	/**
	 * Subscribe to workflow events
	 */
	addEventListener(callback: WorkflowEventCallback): () => void {
		this.eventListeners.add(callback);
		return () => this.eventListeners.delete(callback);
	}

	/**
	 * Emit a workflow event
	 */
	private emit(event: WorkflowEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				const logger = getLogger();
				logger.error('Error in workflow event listener', {
					eventType: event.type,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}
	}

	/**
	 * Parse planning response from Claude
	 */
	static parsePlanningResponse(content: string): ParsedPlanResult {
		try {
			// Try to extract JSON from the response
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				return {
					success: false,
					error: 'No JSON found in planning response',
				};
			}

			const parsed = JSON.parse(jsonMatch[0]);

			if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
				return {
					success: false,
					error: 'Invalid plan format: missing tasks array',
				};
			}

			// Validate and normalize tasks
			const tasks: TaskDefinition[] = parsed.tasks.map(
				(t: Record<string, unknown>, index: number) => ({
					id: (t.id as string) || `task-${index + 1}`,
					title: (t.title as string) || `Task ${index + 1}`,
					description: (t.description as string) || '',
					acceptanceCriteria: Array.isArray(t.acceptanceCriteria)
						? (t.acceptanceCriteria as string[])
						: [],
					targetFiles: Array.isArray(t.targetFiles)
						? (t.targetFiles as string[])
						: [],
					approach: (t.approach as string) || '',
					dependencies: Array.isArray(t.dependencies)
						? (t.dependencies as string[])
						: [],
					priority: (['critical', 'high', 'medium', 'low'].includes(
						t.priority as string,
					)
						? t.priority
						: 'medium') as TaskDefinition['priority'],
					status: 'pending' as const,
					attempts: 0,
				}),
			);

			const context = parsed.context
				? {
						relevantFiles: Array.isArray(parsed.context.relevantFiles)
							? (parsed.context.relevantFiles as string[])
							: [],
						codebaseNotes: (parsed.context.codebaseNotes as string) || '',
						existingPatterns: Array.isArray(parsed.context.existingPatterns)
							? (parsed.context.existingPatterns as string[])
							: [],
						potentialRisks: Array.isArray(parsed.context.potentialRisks)
							? (parsed.context.potentialRisks as string[])
							: [],
					}
				: undefined;

			return {
				success: true,
				tasks,
				context,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to parse planning response: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			};
		}
	}

	/**
	 * Parse review response from Claude
	 */
	static parseReviewResponse(content: string): ParsedReviewResult {
		try {
			// Try to extract JSON from the response
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				return {
					success: false,
					error: 'No JSON found in review response',
				};
			}

			const parsed = JSON.parse(jsonMatch[0]);

			if (typeof parsed.approved !== 'boolean') {
				return {
					success: false,
					error: 'Invalid review format: missing approved field',
				};
			}

			const review: ReviewResult = {
				approved: parsed.approved,
				overallFeedback: (parsed.overallFeedback as string) || '',
				taskFeedback: Array.isArray(parsed.taskFeedback)
					? parsed.taskFeedback.map((tf: Record<string, unknown>) => ({
							taskId: (tf.taskId as string) || '',
							passed: Boolean(tf.passed),
							criteriaResults: Array.isArray(tf.criteriaResults)
								? (tf.criteriaResults as ReviewResult['taskFeedback'][0]['criteriaResults'])
								: [],
							issues: Array.isArray(tf.issues) ? (tf.issues as string[]) : [],
							suggestions: Array.isArray(tf.suggestions)
								? (tf.suggestions as string[])
								: [],
							severity: (['blocking', 'warning', 'info'].includes(
								tf.severity as string,
							)
								? tf.severity
								: 'info') as 'blocking' | 'warning' | 'info',
						}))
					: [],
				criticalIssues: Array.isArray(parsed.criticalIssues)
					? (parsed.criticalIssues as string[])
					: [],
				revisionTasks: Array.isArray(parsed.revisionTasks)
					? (parsed.revisionTasks as Partial<TaskDefinition>[])
					: [],
				qualityScore:
					typeof parsed.qualityScore === 'number'
						? parsed.qualityScore
						: undefined,
			};

			return {
				success: true,
				review,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to parse review response: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			};
		}
	}
}

/**
 * Singleton instance
 */
let workflowManagerInstance: WorkflowManager | null = null;

/**
 * Get the workflow manager instance
 */
export function getWorkflowManager(workspaceRoot?: string): WorkflowManager {
	if (!workflowManagerInstance) {
		workflowManagerInstance = new WorkflowManager(workspaceRoot);
	}
	return workflowManagerInstance;
}

/**
 * Reset the workflow manager (for testing)
 */
export function resetWorkflowManager(): void {
	workflowManagerInstance = null;
}
