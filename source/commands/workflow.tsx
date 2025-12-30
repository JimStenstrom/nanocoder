import React from 'react';
import {
	ErrorMessage,
	InfoMessage,
	SuccessMessage,
	WarningMessage,
} from '@/components/message-box';
import {TaskList, WorkflowStatus} from '@/components/workflow';
import {appConfig} from '@/config/index';
import {
	activateWorkflow,
	deactivateWorkflow,
	getWorkflowUIState,
	isWorkflowActive,
	setCurrentPlan,
} from '@/context/workflow-context';
import {getWorkflowManager} from '@/services/workflow-manager';
import {getWorkflowPersistence} from '@/services/workflow-persistence';
import type {Command, Message} from '@/types/index';
import type {WorkflowConfig} from '@/types/workflow';

/**
 * Show workflow command help
 */
function WorkflowHelp() {
	return (
		<InfoMessage
			message={`Workflow Commands - Claude Planning & Review Mode

/workflow start <request> - Start a new workflow
  • Claude creates a structured plan with tasks
  • Local LLM implements each task
  • Claude reviews the changes
  • Example: /workflow start Add user authentication to the app

/workflow status - Show current workflow status
  • Displays current phase, progress, and active task

/workflow list - List all saved workflows
  • Shows active and completed workflows
  • Can resume incomplete workflows

/workflow resume [id] - Resume an incomplete workflow
  • Continues from where the workflow left off
  • If no ID provided, resumes most recent

/workflow abort - Abort the current workflow
  • Stops execution and saves current state
  • Can be resumed later

/workflow config - Show workflow configuration
  • Displays planning, coding, and review models

/workflow help - Show this help message

Configuration:
Add to your agents.config.json:
{
  "workflow": {
    "planningModel": { "provider": "OpenRouter", "model": "anthropic/claude-sonnet-4" },
    "codingModel": { "provider": "LocalLLM", "model": "qwen2.5-coder:32b" },
    "reviewModel": { "provider": "OpenRouter", "model": "anthropic/claude-sonnet-4" }
  }
}`}
			hideBox={false}
		/>
	);
}

/**
 * Show workflow configuration
 */
function WorkflowConfigDisplay({config}: {config: WorkflowConfig | undefined}) {
	if (!config) {
		return (
			<WarningMessage
				message={`Workflow not configured.

Add to your agents.config.json:
{
  "nanocoder": {
    "workflow": {
      "planningModel": { "provider": "OpenRouter", "model": "anthropic/claude-sonnet-4" },
      "codingModel": { "provider": "LocalLLM", "model": "qwen2.5-coder:32b" },
      "reviewModel": { "provider": "OpenRouter", "model": "anthropic/claude-sonnet-4" }
    }
  }
}`}
				hideBox={false}
			/>
		);
	}

	return (
		<InfoMessage
			message={`Workflow Configuration:

Planning Model (Claude for architecture & planning):
  • Provider: ${config.planningModel.provider}
  • Model: ${config.planningModel.model}

Coding Model (Local LLM for implementation):
  • Provider: ${config.codingModel.provider}
  • Model: ${config.codingModel.model}

Review Model (Claude for code review):
  • Provider: ${config.reviewModel.provider}
  • Model: ${config.reviewModel.model}

Settings:
  • Auto-advance: ${config.autoAdvance ?? false}
  • Max revisions: ${config.maxRevisions ?? 3}
  • Review per task: ${config.reviewPerTask ?? false}
  • Checkpoint per task: ${config.checkpointPerTask ?? true}`}
			hideBox={false}
		/>
	);
}

/**
 * Start a new workflow
 */
async function startWorkflow(
	args: string[],
	_messages: Message[],
	metadata: {provider: string; model: string},
): Promise<React.ReactElement> {
	try {
		const config = appConfig.workflow;

		if (!config) {
			return React.createElement(WarningMessage, {
				key: `warning-${Date.now()}`,
				message:
					'Workflow not configured. Add workflow config to agents.config.json. Use /workflow help for details.',
				hideBox: true,
			});
		}

		if (args.length === 0) {
			return React.createElement(ErrorMessage, {
				key: `error-${Date.now()}`,
				message:
					'Please provide a request. Usage: /workflow start <your request>',
				hideBox: true,
			});
		}

		if (isWorkflowActive()) {
			return React.createElement(WarningMessage, {
				key: `warning-${Date.now()}`,
				message:
					'A workflow is already active. Use /workflow abort to stop it first.',
				hideBox: true,
			});
		}

		const request = args.join(' ');
		const manager = getWorkflowManager();

		// Activate workflow context
		activateWorkflow(config);

		// Start the workflow
		const plan = await manager.startWorkflow({
			request,
			config,
		});

		setCurrentPlan(plan);

		return React.createElement(SuccessMessage, {
			key: `success-${Date.now()}`,
			message: `Workflow started successfully!

Plan ID: ${plan.id}
Phase: Planning
Request: ${request.substring(0, 100)}${request.length > 100 ? '...' : ''}

The planning model will now analyze your request and create tasks.
Use /workflow status to check progress.`,
			hideBox: true,
		});
	} catch (error) {
		return React.createElement(ErrorMessage, {
			key: `error-${Date.now()}`,
			message: `Failed to start workflow: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
			hideBox: true,
		});
	}
}

/**
 * Show workflow status
 */
async function showStatus(): Promise<React.ReactElement> {
	const manager = getWorkflowManager();
	const plan = manager.getCurrentPlan();

	if (!plan) {
		return React.createElement(InfoMessage, {
			key: `info-${Date.now()}`,
			message:
				'No active workflow. Use /workflow start <request> to begin one.',
			hideBox: true,
		});
	}

	const uiState = getWorkflowUIState();

	return React.createElement(
		React.Fragment,
		{key: `status-${Date.now()}`},
		React.createElement(WorkflowStatus, {
			key: 'status',
			state: uiState,
			width: 70,
		}),
		React.createElement(TaskList, {
			key: 'tasks',
			plan,
			showDetails: true,
			maxTasks: 10,
			width: 70,
		}),
	);
}

/**
 * List all workflows
 */
async function listWorkflows(): Promise<React.ReactElement> {
	try {
		const persistence = getWorkflowPersistence();
		const workflows = await persistence.listWorkflows();

		if (workflows.length === 0) {
			return React.createElement(InfoMessage, {
				key: `info-${Date.now()}`,
				message:
					'No saved workflows. Use /workflow start <request> to create one.',
				hideBox: true,
			});
		}

		const workflowList = workflows
			.map(w => {
				const date = new Date(w.updatedAt).toLocaleString();
				const progress =
					w.taskCount > 0
						? `${w.completedTasks}/${w.taskCount} tasks`
						: 'No tasks';
				return `• ${w.id.substring(0, 25)}...
    Phase: ${w.phase} | ${progress}
    Request: ${w.originalRequest.substring(0, 50)}...
    Updated: ${date}`;
			})
			.join('\n\n');

		return React.createElement(InfoMessage, {
			key: `list-${Date.now()}`,
			message: `Saved Workflows (${workflows.length}):\n\n${workflowList}`,
			hideBox: false,
		});
	} catch (error) {
		return React.createElement(ErrorMessage, {
			key: `error-${Date.now()}`,
			message: `Failed to list workflows: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
			hideBox: true,
		});
	}
}

/**
 * Resume a workflow
 */
async function resumeWorkflow(args: string[]): Promise<React.ReactElement> {
	try {
		const config = appConfig.workflow;

		if (!config) {
			return React.createElement(WarningMessage, {
				key: `warning-${Date.now()}`,
				message: 'Workflow not configured.',
				hideBox: true,
			});
		}

		if (isWorkflowActive()) {
			return React.createElement(WarningMessage, {
				key: `warning-${Date.now()}`,
				message:
					'A workflow is already active. Use /workflow abort to stop it first.',
				hideBox: true,
			});
		}

		const manager = getWorkflowManager();
		const persistence = getWorkflowPersistence();

		let plan;

		if (args.length > 0) {
			// Resume specific workflow
			const planId = args.join(' ');
			plan = await manager.resumeWorkflow(planId);

			if (!plan) {
				return React.createElement(ErrorMessage, {
					key: `error-${Date.now()}`,
					message: `Workflow '${planId}' not found. Use /workflow list to see available workflows.`,
					hideBox: true,
				});
			}
		} else {
			// Resume most recent active workflow
			plan = await persistence.getMostRecentActiveWorkflow();

			if (!plan) {
				return React.createElement(InfoMessage, {
					key: `info-${Date.now()}`,
					message:
						'No active workflows to resume. Use /workflow start <request> to begin one.',
					hideBox: true,
				});
			}

			await manager.resumeWorkflow(plan.id);
		}

		// Activate workflow context
		activateWorkflow(config);
		setCurrentPlan(plan);

		return React.createElement(SuccessMessage, {
			key: `success-${Date.now()}`,
			message: `Workflow resumed!

Plan ID: ${plan.id}
Phase: ${plan.phase}
Progress: ${plan.tasks.filter(t => t.status === 'completed').length}/${plan.tasks.length} tasks

Use /workflow status to see details.`,
			hideBox: true,
		});
	} catch (error) {
		return React.createElement(ErrorMessage, {
			key: `error-${Date.now()}`,
			message: `Failed to resume workflow: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
			hideBox: true,
		});
	}
}

/**
 * Abort the current workflow
 */
async function abortWorkflow(): Promise<React.ReactElement> {
	try {
		const manager = getWorkflowManager();
		const plan = manager.getCurrentPlan();

		if (!plan) {
			return React.createElement(InfoMessage, {
				key: `info-${Date.now()}`,
				message: 'No active workflow to abort.',
				hideBox: true,
			});
		}

		const planId = plan.id;
		await manager.abortWorkflow('User requested abort');
		deactivateWorkflow();

		return React.createElement(SuccessMessage, {
			key: `success-${Date.now()}`,
			message: `Workflow aborted.

Plan ID: ${planId}

The workflow state has been saved. You can resume it later with:
/workflow resume ${planId}`,
			hideBox: true,
		});
	} catch (error) {
		return React.createElement(ErrorMessage, {
			key: `error-${Date.now()}`,
			message: `Failed to abort workflow: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
			hideBox: true,
		});
	}
}

/**
 * Main workflow command handler
 */
export const workflowCommand: Command = {
	name: 'workflow',
	description:
		'Claude Planning & Review workflow - plan with Claude, code with local LLM, review with Claude',
	handler: async (args: string[], messages: Message[], metadata) => {
		if (args.length === 0) {
			return workflowCommand.handler(['help'], messages, metadata);
		}

		const subcommand = args[0].toLowerCase();
		const subArgs = args.slice(1);

		switch (subcommand) {
			case 'start':
			case 'new':
			case 'begin':
				return await startWorkflow(subArgs, messages, metadata);

			case 'status':
			case 'show':
				return await showStatus();

			case 'list':
			case 'ls':
				return await listWorkflows();

			case 'resume':
			case 'continue':
				return await resumeWorkflow(subArgs);

			case 'abort':
			case 'stop':
			case 'cancel':
				return await abortWorkflow();

			case 'config':
			case 'configuration':
				return React.createElement(WorkflowConfigDisplay, {
					key: `config-${Date.now()}`,
					config: appConfig.workflow,
				});

			case 'help':
			case '--help':
			case '-h':
				return React.createElement(WorkflowHelp, {
					key: `help-${Date.now()}`,
				});

			default:
				return React.createElement(ErrorMessage, {
					key: `error-${Date.now()}`,
					message: `Unknown workflow subcommand: ${subcommand}. Use /workflow help for available commands.`,
					hideBox: true,
				});
		}
	},
};
