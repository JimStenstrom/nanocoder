/**
 * Workflow Persistence Service
 *
 * Manages saving and loading workflow execution plans.
 * Workflows are stored in .nanocoder/workflows/ within the workspace root.
 */

import {existsSync} from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {ExecutionPlan, WorkflowPhase} from '@/types/workflow';
import {getLogger} from '@/utils/logging';

/**
 * Summary of a saved workflow for listing
 */
export interface WorkflowSummary {
	id: string;
	originalRequest: string;
	phase: WorkflowPhase;
	createdAt: number;
	updatedAt: number;
	taskCount: number;
	completedTasks: number;
	sizeBytes: number;
}

/**
 * Service for persisting workflow execution plans
 */
export class WorkflowPersistence {
	private readonly workflowsDir: string;

	constructor(workspaceRoot: string = process.cwd()) {
		// nosemgrep
		this.workflowsDir = path.join(workspaceRoot, '.nanocoder', 'workflows');
	}

	/**
	 * Ensure the workflows directory exists
	 */
	private async ensureWorkflowsDir(): Promise<void> {
		if (!existsSync(this.workflowsDir)) {
			await fs.mkdir(this.workflowsDir, {recursive: true});
		}
	}

	/**
	 * Get the file path for a workflow
	 */
	private getWorkflowPath(planId: string): string {
		// nosemgrep
		return path.join(this.workflowsDir, `${planId}.json`);
	}

	/**
	 * Save a workflow execution plan
	 */
	async saveWorkflow(plan: ExecutionPlan): Promise<void> {
		const logger = getLogger();

		await this.ensureWorkflowsDir();

		const workflowPath = this.getWorkflowPath(plan.id);

		// Update the updatedAt timestamp
		const updatedPlan: ExecutionPlan = {
			...plan,
			updatedAt: Date.now(),
		};

		await fs.writeFile(
			workflowPath,
			JSON.stringify(updatedPlan, null, 2),
			'utf-8',
		);

		logger.debug('Workflow saved', {
			planId: plan.id,
			phase: plan.phase,
			taskCount: plan.tasks.length,
		});
	}

	/**
	 * Load a workflow execution plan by ID
	 */
	async loadWorkflow(planId: string): Promise<ExecutionPlan | null> {
		const logger = getLogger();

		const workflowPath = this.getWorkflowPath(planId);

		if (!existsSync(workflowPath)) {
			logger.debug('Workflow not found', {planId});
			return null;
		}

		try {
			const content = await fs.readFile(workflowPath, 'utf-8');
			const plan = JSON.parse(content) as ExecutionPlan;

			logger.debug('Workflow loaded', {
				planId: plan.id,
				phase: plan.phase,
				taskCount: plan.tasks.length,
			});

			return plan;
		} catch (error) {
			logger.error('Failed to load workflow', {
				planId,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			return null;
		}
	}

	/**
	 * Delete a workflow
	 */
	async deleteWorkflow(planId: string): Promise<boolean> {
		const logger = getLogger();

		const workflowPath = this.getWorkflowPath(planId);

		if (!existsSync(workflowPath)) {
			return false;
		}

		try {
			await fs.unlink(workflowPath);
			logger.info('Workflow deleted', {planId});
			return true;
		} catch (error) {
			logger.error('Failed to delete workflow', {
				planId,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			return false;
		}
	}

	/**
	 * List all saved workflows
	 */
	async listWorkflows(): Promise<WorkflowSummary[]> {
		const logger = getLogger();

		await this.ensureWorkflowsDir();

		try {
			const entries = await fs.readdir(this.workflowsDir);
			const summaries: WorkflowSummary[] = [];

			for (const entry of entries) {
				if (!entry.endsWith('.json')) continue;

				try {
					// nosemgrep
					const workflowPath = path.join(this.workflowsDir, entry);
					const stat = await fs.stat(workflowPath);
					const content = await fs.readFile(workflowPath, 'utf-8');
					const plan = JSON.parse(content) as ExecutionPlan;

					const completedTasks = plan.tasks.filter(
						t => t.status === 'completed',
					).length;

					summaries.push({
						id: plan.id,
						originalRequest: plan.originalRequest.substring(0, 100),
						phase: plan.phase,
						createdAt: plan.createdAt,
						updatedAt: plan.updatedAt,
						taskCount: plan.tasks.length,
						completedTasks,
						sizeBytes: stat.size,
					});
				} catch (error) {
					logger.warn('Could not read workflow file', {
						entry,
						error: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			}

			// Sort by updatedAt (newest first)
			summaries.sort((a, b) => b.updatedAt - a.updatedAt);

			return summaries;
		} catch (error) {
			logger.error('Failed to list workflows', {
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			return [];
		}
	}

	/**
	 * List active (incomplete) workflows
	 */
	async listActiveWorkflows(): Promise<WorkflowSummary[]> {
		const all = await this.listWorkflows();
		return all.filter(w => w.phase !== 'complete' && w.phase !== 'idle');
	}

	/**
	 * Get the most recent active workflow
	 */
	async getMostRecentActiveWorkflow(): Promise<ExecutionPlan | null> {
		const active = await this.listActiveWorkflows();
		if (active.length === 0) return null;

		// List is already sorted by updatedAt desc
		return this.loadWorkflow(active[0].id);
	}

	/**
	 * Check if a workflow exists
	 */
	workflowExists(planId: string): boolean {
		const workflowPath = this.getWorkflowPath(planId);
		return existsSync(workflowPath);
	}

	/**
	 * Clean up old completed workflows (older than specified days)
	 */
	async cleanupOldWorkflows(maxAgeDays: number = 30): Promise<number> {
		const logger = getLogger();

		const summaries = await this.listWorkflows();
		const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
		let deletedCount = 0;

		for (const summary of summaries) {
			if (summary.phase === 'complete' && summary.updatedAt < cutoffTime) {
				const deleted = await this.deleteWorkflow(summary.id);
				if (deleted) deletedCount++;
			}
		}

		if (deletedCount > 0) {
			logger.info('Cleaned up old workflows', {
				deletedCount,
				maxAgeDays,
			});
		}

		return deletedCount;
	}

	/**
	 * Export a workflow to a standalone JSON file
	 */
	async exportWorkflow(planId: string, exportPath: string): Promise<void> {
		const plan = await this.loadWorkflow(planId);
		if (!plan) {
			throw new Error(`Workflow '${planId}' not found`);
		}

		await fs.writeFile(exportPath, JSON.stringify(plan, null, 2), 'utf-8');
	}

	/**
	 * Import a workflow from an external JSON file
	 */
	async importWorkflow(importPath: string): Promise<ExecutionPlan> {
		const content = await fs.readFile(importPath, 'utf-8');
		const plan = JSON.parse(content) as ExecutionPlan;

		// Validate basic structure
		if (!plan.id || !plan.tasks || !Array.isArray(plan.tasks)) {
			throw new Error('Invalid workflow file format');
		}

		// Save to workflows directory
		await this.saveWorkflow(plan);

		return plan;
	}
}

/**
 * Singleton instance for workflow persistence
 */
let workflowPersistenceInstance: WorkflowPersistence | null = null;

/**
 * Get the workflow persistence service instance
 */
export function getWorkflowPersistence(
	workspaceRoot?: string,
): WorkflowPersistence {
	if (!workflowPersistenceInstance) {
		workflowPersistenceInstance = new WorkflowPersistence(workspaceRoot);
	}
	return workflowPersistenceInstance;
}

/**
 * Reset the workflow persistence instance (for testing)
 */
export function resetWorkflowPersistence(): void {
	workflowPersistenceInstance = null;
}
