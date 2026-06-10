import {execFile} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {MAX_IMAGE_ATTACHMENT_BYTES} from '@/constants';

/**
 * Read an image off the OS clipboard by shelling out to the platform's
 * clipboard tool, and write it to a temp PNG file. No native dependency:
 * macOS uses osascript (always present), Linux uses wl-paste/xclip
 * (conventional on Wayland/X11), Windows uses PowerShell.
 *
 * The temp file is then attached exactly like a dragged-in image file, so
 * everything downstream of acquisition is one code path.
 */

const execFileAsync = promisify(execFile);

export type ClipboardImageResult =
	| {ok: true; filePath: string}
	| {
			ok: false;
			reason: 'no-image' | 'tool-missing' | 'unsupported-platform' | 'error';
			message: string;
	  };

/** Minimal exec shape, injectable for tests. */
export type ClipboardExec = (
	file: string,
	args: string[],
	options: {maxBuffer: number; encoding: 'buffer'},
) => Promise<{stdout: Buffer | string}>;

export interface ClipboardImageDeps {
	platform?: NodeJS.Platform;
	exec?: ClipboardExec;
	writeFileImpl?: (path: string, data: Buffer) => Promise<void>;
	tmpDir?: string;
	now?: () => number;
}

interface ExecError extends Error {
	code?: string | number;
	stderr?: Buffer | string;
}

function stderrText(error: ExecError): string {
	const raw = error.stderr;
	if (!raw) return error.message;
	return typeof raw === 'string' ? raw : raw.toString('utf8');
}

function isMissingTool(error: ExecError): boolean {
	return error.code === 'ENOENT';
}

// Allow a little headroom over the attachment cap; oversize clipboard images
// get a proper "too large" message from validateImageFile afterwards.
const CLIPBOARD_MAX_BUFFER = MAX_IMAGE_ATTACHMENT_BYTES * 2;

const EXEC_OPTIONS = {
	maxBuffer: CLIPBOARD_MAX_BUFFER,
	encoding: 'buffer',
} as const;

async function captureMacos(
	exec: ClipboardExec,
	targetPath: string,
): Promise<ClipboardImageResult> {
	// AppleScript writes the clipboard's PNG representation straight to the
	// target file. The path contains no user input but is escaped anyway.
	const escapedPath = targetPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	const script = [
		'set imgData to the clipboard as «class PNGf»',
		`set f to open for access POSIX file "${escapedPath}" with write permission`,
		'set eof of f to 0',
		'write imgData to f',
		'close access f',
	];
	try {
		await exec(
			'osascript',
			script.flatMap(line => ['-e', line]),
			EXEC_OPTIONS,
		);
		return {ok: true, filePath: targetPath};
	} catch (error) {
		const execError = error as ExecError;
		if (isMissingTool(execError)) {
			return {
				ok: false,
				reason: 'tool-missing',
				message: 'osascript not found',
			};
		}
		// Error -1700 = "can't make ... into type" → clipboard has no image.
		if (stderrText(execError).includes('-1700')) {
			return {
				ok: false,
				reason: 'no-image',
				message: 'No image in clipboard',
			};
		}
		return {
			ok: false,
			reason: 'error',
			message: `Clipboard read failed: ${stderrText(execError).trim()}`,
		};
	}
}

async function captureLinux(
	exec: ClipboardExec,
	writeFileImpl: (path: string, data: Buffer) => Promise<void>,
	targetPath: string,
): Promise<ClipboardImageResult> {
	// Try Wayland first when a Wayland session is detectable, then X11.
	const tools: Array<{file: string; args: string[]}> = process.env
		.WAYLAND_DISPLAY
		? [
				{file: 'wl-paste', args: ['--type', 'image/png']},
				{
					file: 'xclip',
					args: ['-selection', 'clipboard', '-t', 'image/png', '-o'],
				},
			]
		: [
				{
					file: 'xclip',
					args: ['-selection', 'clipboard', '-t', 'image/png', '-o'],
				},
				{file: 'wl-paste', args: ['--type', 'image/png']},
			];

	let sawTool = false;
	let lastFailure = '';
	for (const tool of tools) {
		try {
			const {stdout} = await exec(tool.file, tool.args, EXEC_OPTIONS);
			const data =
				typeof stdout === 'string' ? Buffer.from(stdout, 'binary') : stdout;
			if (data.length === 0) {
				sawTool = true;
				lastFailure = 'No image in clipboard';
				continue;
			}
			await writeFileImpl(targetPath, data);
			return {ok: true, filePath: targetPath};
		} catch (error) {
			const execError = error as ExecError;
			if (isMissingTool(execError)) {
				continue;
			}
			// Both tools exit non-zero when the clipboard has no image target.
			sawTool = true;
			lastFailure = stderrText(execError).trim() || 'No image in clipboard';
		}
	}

	if (sawTool) {
		return {ok: false, reason: 'no-image', message: lastFailure};
	}
	return {
		ok: false,
		reason: 'tool-missing',
		message:
			'No clipboard tool found — install wl-clipboard (Wayland) or xclip (X11)',
	};
}

async function captureWindows(
	exec: ClipboardExec,
	targetPath: string,
): Promise<ClipboardImageResult> {
	const script = `$img = Get-Clipboard -Format Image; if ($img -eq $null) { exit 2 }; $img.Save('${targetPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`;
	try {
		await exec(
			'powershell',
			['-NoProfile', '-NonInteractive', '-Command', script],
			EXEC_OPTIONS,
		);
		return {ok: true, filePath: targetPath};
	} catch (error) {
		const execError = error as ExecError;
		if (isMissingTool(execError)) {
			return {
				ok: false,
				reason: 'tool-missing',
				message: 'powershell not found',
			};
		}
		if (execError.code === 2) {
			return {
				ok: false,
				reason: 'no-image',
				message: 'No image in clipboard',
			};
		}
		return {
			ok: false,
			reason: 'error',
			message: `Clipboard read failed: ${stderrText(execError).trim()}`,
		};
	}
}

/**
 * Capture the clipboard image to a temp PNG file. Returns a discriminated
 * result; never throws. Callers surface `message` to the user on failure.
 */
export async function captureClipboardImage(
	deps: ClipboardImageDeps = {},
): Promise<ClipboardImageResult> {
	const platform = deps.platform ?? process.platform;
	const exec = deps.exec ?? (execFileAsync as unknown as ClipboardExec);
	const writeFileImpl =
		deps.writeFileImpl ??
		((path: string, data: Buffer) => writeFile(path, data));
	const dir = deps.tmpDir ?? tmpdir();
	const timestamp = deps.now?.() ?? Date.now();
	const targetPath = join(dir, `nanocoder-clipboard-${timestamp}.png`);

	switch (platform) {
		case 'darwin':
			return captureMacos(exec, targetPath);
		case 'linux':
			return captureLinux(exec, writeFileImpl, targetPath);
		case 'win32':
			return captureWindows(exec, targetPath);
		default:
			return {
				ok: false,
				reason: 'unsupported-platform',
				message: `Clipboard image capture is not supported on ${platform}`,
			};
	}
}
