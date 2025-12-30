/**
 * Workflow Handler Hook
 *
 * Manages the workflow mode integration with the chat handler.
 * Handles phase transitions and client switching for the
 * Claude Planning & Review workflow.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
	createMultiClientManager,
	MultiClientManager,
} from '@/ai-sdk-client/multi-client-manager';
import {
	InfoMessage,
	SuccessMessage,
	WarningMessage,
} from '@/components/message-box';
import {
	PhaseTransition,
	ReviewDisplay,
	TaskList,
	WorkflowStatus,
} from '@/components/workflow';
import {appConfig} from '@/config/index';
import {
	activateWorkflow,
	deactivateWorkflow,
	getWorkflowPhase,
	getWorkflowUIState,
	isWorkflowActive,
	setCurrentPlan,
	setCurrentTask,
	setWorkflowPhase,
} from '@/context/workflow-context';
import {getWorkflowManager, WorkflowManager} from '@/services/workflow-manager';
import type {AIProviderConfig, LLMClient} from '@/types/index';
import type {
	ExecutionPlan,
	ReviewResult,
	WorkflowEvent,
	WorkflowPhase,
} from '@/types/workflow';
import {getLogger} from '@/utils/logging';

interface UseWorkflowHandlerProps {
	/** Current LLM client (used when workflow is not active) */
	client: LLMClient | null;
	/** Provider configurations */
	providers: AIProviderConfig[];
	/** Add component to chat queue */
	addToChatQueue: (component: React.ReactNode) => void;
	/** Get next component key */
	getNextComponentKey: () => number;
	/** Callback when workflow phase changes */
	onPhaseChange?: (phase: WorkflowPhase) => void;
	/** Callback when workflow completes */
	onWorkflowComplete?: (plan: ExecutionPlan) => void;
}

interface WorkflowHandlerReturn {
	/** Whether workflow mode is active */
	isActive: boolean;
	/** Current workflow phase */
	phase: WorkflowPhase;
	/** Current execution plan */
	plan: ExecutionPlan | null;
	/** Get the appropriate client for current phase */
	getActiveClient: () => LLMClient | null;
	/** Start a new workflow */
	startWorkflow: (request: string) => Promise<void>;
	/** Abort the current workflow */
	abortWorkflow: () => Promise<void>;
	/** Get the system prompt for current phase */
	getSystemPrompt: () => Promise<string>;
	/** Handle completion of a task */
	handleTaskComplete: (
		taskId: string,
		filesModified: string[],
		summary: string,
	) => Promise<void>;
	/** Handle phase transition confirmation */
	handlePhaseTransition: (proceed: boolean) => Promise<void>;
	/** Process LLM response for planning phase */
	processPlanningResponse: (content: string) => Promise<boolean>;
	/** Process LLM response for review phase */
	processReviewResponse: (content: string) => Promise<ReviewResult | null>;
}

/**
 * Load prompt template from file
 */
async function loadPromptTemplate(
	templateName: 'planning' | 'coding' | 'review',
): Promise<string> {
	const promptPath = path.join(
		__dirname,
		'..',
		'app',
		'prompts',
		`${templateName}-prompt.md`,
	);

	try {
		return await fs.readFile(promptPath, 'utf-8');
	} catch (error) {
		const logger = getLogger();
		logger.warn(`Failed to load ${templateName} prompt template`, {
			error: error instanceof Error ? error.message : 'Unknown error',
		});
		// Return a basic fallback
		return `You are in ${templateName} mode. Follow the instructions provided.`;
	}
}

/**
 * Hook for managing workflow mode
 */
export function useWorkflowHandler({
	client,
	providers,
	addToChatQueue,
	getNextComponentKey,
	onPhaseChange,
	onWorkflowComplete,
}: UseWorkflowHandlerProps): WorkflowHandlerReturn {
	const [isActive, setIsActive] = useState(false);
	const [phase, setPhase] = useState<WorkflowPhase>('idle');
	const [plan, setPlan] = useState<ExecutionPlan | null>(null);

	const multiClientRef = useRef<MultiClientManager | null>(null);
	const workflowManagerRef = useRef<WorkflowManager>(getWorkflowManager());
	const pendingTransitionRef = useRef<{
		from: WorkflowPhase;
		to: WorkflowPhase;
	} | null>(null);

	const config = appConfig.workflow;

	/**
	 * Initialize multi-client manager
	 */
	const initializeMultiClient = useCallback(async () => {
		if (!config || providers.length === 0) return;

		try {
			const manager = await createMultiClientManager(config, providers);
			multiClientRef.current = manager;

			// Initialize the workflow manager with the client manager
			await workflowManagerRef.current.initialize(config, manager);
		} catch (error) {
			const logger = getLogger();
			logger.error('Failed to initialize multi-client manager', {
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}, [config, providers]);

	/**
	 * Get the active client for the current phase
	 */
	const getActiveClient = useCallback((): LLMClient | null => {
		if (!isActive || !multiClientRef.current) {
			return client;
		}

		return workflowManagerRef.current.getClientForPhase(phase);
	}, [isActive, phase, client]);

	/**
	 * Start a new workflow
	 */
	const startWorkflow = useCallback(
		async (request: string) => {
			if (!config) {
				addToChatQueue(
					<WarningMessage
						key={`warning-${getNextComponentKey()}`}
						message="Workflow not configured. Add workflow config to agents.config.json."
						hideBox={true}
					/>,
				);
				return;
			}

			// Initialize multi-client if not done
			if (!multiClientRef.current) {
				await initializeMultiClient();
			}

			// Activate workflow
			activateWorkflow(config);
			setIsActive(true);

			// Start workflow in manager
			const newPlan = await workflowManagerRef.current.startWorkflow({
				request,
				config,
			});

			setPlan(newPlan);
			setPhase('planning');
			setCurrentPlan(newPlan);
			setWorkflowPhase('planning');

			// Show workflow started message
			addToChatQueue(
				<WorkflowStatus
					key={`workflow-status-${getNextComponentKey()}`}
					state={getWorkflowUIState()}
					width={70}
				/>,
			);

			onPhaseChange?.('planning');
		},
		[
			config,
			addToChatQueue,
			getNextComponentKey,
			initializeMultiClient,
			onPhaseChange,
		],
	);

	/**
	 * Abort the current workflow
	 */
	const abortWorkflow = useCallback(async () => {
		if (!isActive) return;

		await workflowManagerRef.current.abortWorkflow('User requested abort');
		deactivateWorkflow();
		setIsActive(false);
		setPhase('idle');
		setPlan(null);

		addToChatQueue(
			<InfoMessage
				key={`abort-${getNextComponentKey()}`}
				message="Workflow aborted. State saved for potential resume."
				hideBox={true}
			/>,
		);
	}, [isActive, addToChatQueue, getNextComponentKey]);

	/**
	 * Get the system prompt for the current phase
	 */
	const getSystemPrompt = useCallback(async (): Promise<string> => {
		if (!isActive || !plan) {
			return '';
		}

		switch (phase) {
			case 'planning': {
				const template = await loadPromptTemplate('planning');
				return template;
			}

			case 'implementing':
			case 'revision': {
				const template = await loadPromptTemplate('coding');
				const currentTask = workflowManagerRef.current.getNextTask();

				if (!currentTask) {
					return template;
				}

				return template
					.replace('{{TASK_JSON}}', JSON.stringify(currentTask, null, 2))
					.replace('{{CODEBASE_NOTES}}', plan.context.codebaseNotes || '');
			}

			case 'reviewing': {
				const template = await loadPromptTemplate('review');

				// TODO: Get actual git diff
				const gitDiff = '[Git diff would be inserted here]';

				return template
					.replace('{{ORIGINAL_REQUEST}}', plan.originalRequest)
					.replace('{{PLAN_JSON}}', JSON.stringify(plan, null, 2))
					.replace('{{GIT_DIFF}}', gitDiff);
			}

			default:
				return '';
		}
	}, [isActive, plan, phase]);

	/**
	 * Handle phase transition confirmation
	 */
	const handlePhaseTransition = useCallback(
		async (proceed: boolean) => {
			if (!proceed) {
				// User cancelled - abort workflow
				await abortWorkflow();
				return;
			}

			const pending = pendingTransitionRef.current;
			if (pending) {
				await workflowManagerRef.current.transitionToPhase(pending.to);
				setPhase(pending.to);
				setWorkflowPhase(pending.to);
				onPhaseChange?.(pending.to);
				pendingTransitionRef.current = null;
			}
		},
		[abortWorkflow, onPhaseChange],
	);

	/**
	 * Handle task completion
	 */
	const handleTaskComplete = useCallback(
		async (taskId: string, filesModified: string[], summary: string) => {
			if (!plan) return;

			await workflowManagerRef.current.completeTask(taskId, {
				filesModified,
				filesCreated: [],
				filesDeleted: [],
				summary,
			});

			// Update local state
			const updatedPlan = workflowManagerRef.current.getCurrentPlan();
			if (updatedPlan) {
				setPlan({...updatedPlan});
				setCurrentPlan(updatedPlan);
			}

			// Check if all tasks are complete
			if (workflowManagerRef.current.areAllTasksComplete()) {
				// Transition to review
				await workflowManagerRef.current.transitionToPhase('reviewing');
				setPhase('reviewing');
				setWorkflowPhase('reviewing');
				onPhaseChange?.('reviewing');

				addToChatQueue(
					<PhaseTransition
						key={`transition-${getNextComponentKey()}`}
						fromPhase="implementing"
						toPhase="reviewing"
						summary={`Completed ${plan.tasks.length} tasks. Ready for code review.`}
						onProceed={() => handlePhaseTransition(true)}
						onCancel={() => handlePhaseTransition(false)}
						width={70}
					/>,
				);
			} else {
				// Start next task
				const nextTask = workflowManagerRef.current.getNextTask();
				if (nextTask) {
					await workflowManagerRef.current.startTask(nextTask.id);
					setCurrentTask(nextTask);
				}
			}
		},
		[
			plan,
			addToChatQueue,
			getNextComponentKey,
			onPhaseChange,
			handlePhaseTransition,
		],
	);

	/**
	 * Process planning response from Claude
	 */
	const processPlanningResponse = useCallback(
		async (content: string): Promise<boolean> => {
			const parsed = WorkflowManager.parsePlanningResponse(content);

			if (!parsed.success) {
				addToChatQueue(
					<WarningMessage
						key={`parse-error-${getNextComponentKey()}`}
						message={`Failed to parse planning response: ${parsed.error}`}
						hideBox={true}
					/>,
				);
				return false;
			}

			await workflowManagerRef.current.setTasksFromPlanningResponse(parsed);

			const updatedPlan = workflowManagerRef.current.getCurrentPlan();
			if (updatedPlan) {
				setPlan({...updatedPlan});
				setCurrentPlan(updatedPlan);

				// Show the task list
				addToChatQueue(
					<TaskList
						key={`tasks-${getNextComponentKey()}`}
						plan={updatedPlan}
						showDetails={true}
						width={70}
					/>,
				);

				// Prompt for transition to implementation
				pendingTransitionRef.current = {
					from: 'planning',
					to: 'implementing',
				};

				addToChatQueue(
					<PhaseTransition
						key={`transition-${getNextComponentKey()}`}
						fromPhase="planning"
						toPhase="implementing"
						summary={`Created ${updatedPlan.tasks.length} tasks. Ready to start implementation.`}
						onProceed={() => handlePhaseTransition(true)}
						onCancel={() => handlePhaseTransition(false)}
						width={70}
					/>,
				);
			}

			return true;
		},
		[addToChatQueue, getNextComponentKey, handlePhaseTransition],
	);

	/**
	 * Process review response from Claude
	 */
	const processReviewResponse = useCallback(
		async (content: string): Promise<ReviewResult | null> => {
			const parsed = WorkflowManager.parseReviewResponse(content);

			if (!parsed.success || !parsed.review) {
				addToChatQueue(
					<WarningMessage
						key={`parse-error-${getNextComponentKey()}`}
						message={`Failed to parse review response: ${parsed.error}`}
						hideBox={true}
					/>,
				);
				return null;
			}

			// Show review results
			addToChatQueue(
				<ReviewDisplay
					key={`review-${getNextComponentKey()}`}
					review={parsed.review}
					width={70}
				/>,
			);

			// Process the review result
			await workflowManagerRef.current.processReviewResult(parsed);

			const updatedPlan = workflowManagerRef.current.getCurrentPlan();
			if (updatedPlan) {
				setPlan({...updatedPlan});
				setCurrentPlan(updatedPlan);
				setPhase(updatedPlan.phase);
				setWorkflowPhase(updatedPlan.phase);
			}

			if (parsed.review.approved) {
				// Workflow complete!
				setIsActive(false);
				deactivateWorkflow();

				addToChatQueue(
					<SuccessMessage
						key={`complete-${getNextComponentKey()}`}
						message="Workflow completed successfully! All changes have been approved."
						hideBox={true}
					/>,
				);

				if (updatedPlan) {
					onWorkflowComplete?.(updatedPlan);
				}
			} else {
				// Needs revision
				onPhaseChange?.('revision');
			}

			return parsed.review;
		},
		[addToChatQueue, getNextComponentKey, onPhaseChange, onWorkflowComplete],
	);

	/**
	 * Subscribe to workflow events
	 */
	useEffect(() => {
		const handleEvent = (event: WorkflowEvent) => {
			const logger = getLogger();
			logger.debug('Workflow event received', {type: event.type});

			switch (event.type) {
				case 'phase_changed':
					setPhase(event.to);
					onPhaseChange?.(event.to);
					break;
				case 'workflow_completed':
					setIsActive(false);
					onWorkflowComplete?.(event.plan);
					break;
			}
		};

		const unsubscribe =
			workflowManagerRef.current.addEventListener(handleEvent);
		return unsubscribe;
	}, [onPhaseChange, onWorkflowComplete]);

	/**
	 * Sync with global workflow context
	 */
	useEffect(() => {
		if (isWorkflowActive()) {
			setIsActive(true);
			setPhase(getWorkflowPhase());
		}
	}, []);

	return {
		isActive,
		phase,
		plan,
		getActiveClient,
		startWorkflow,
		abortWorkflow,
		getSystemPrompt,
		handleTaskComplete,
		handlePhaseTransition,
		processPlanningResponse,
		processReviewResponse,
	};
}
