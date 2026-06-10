import {readFile, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename, extname, isAbsolute, resolve} from 'node:path';
import {
	MAX_IMAGE_ATTACHMENT_BYTES,
	MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/constants';
import type {ImageAttachment} from '@/types/core';
import type {InputState} from '@/types/hooks';
import {type ImagePlaceholderContent, PlaceholderType} from '@/types/hooks';

/**
 * Image attachment helpers for the chat input.
 *
 * Attached images live in the input as IMAGE placeholders ("[Image #1:
 * shot.png]") that hold only the file path and metadata — never base64 data,
 * because InputState is persisted verbatim to the prompt-history file and
 * duplicated across the undo/redo stacks. The bytes are read once at submit
 * time by collectImageAttachments().
 */

/** Supported image extensions mapped to their IANA media types. */
const IMAGE_MEDIA_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
};

/** Media type for a path based on its extension, or null if unsupported. */
export function getImageMediaType(filePath: string): string | null {
	return IMAGE_MEDIA_TYPES[extname(filePath).toLowerCase()] ?? null;
}

/** True when the path's extension is a supported image type. */
export function hasImageExtension(filePath: string): boolean {
	return getImageMediaType(filePath) !== null;
}

/**
 * Find an image file path at the END of the input text. This is how both
 * drag-and-drop (the terminal inserts the file's path, often quoted or with
 * backslash-escaped spaces, usually followed by a space) and a pasted/typed
 * path appear to us. Returns the raw token (exactly as it occurs in the
 * input, including quotes but excluding trailing whitespace) and the cleaned
 * path, or null when the input does not end with an image-path token.
 *
 * Only syntax is checked here — existence/size validation is separate.
 */
export function detectTrailingImagePathToken(
	input: string,
): {raw: string; filePath: string} | null {
	const withoutTrailingWs = input.replace(/\s+$/, '');
	if (!withoutTrailingWs) {
		return null;
	}

	let raw: string;
	let token: string;

	const lastChar = withoutTrailingWs[withoutTrailingWs.length - 1];
	if (lastChar === "'" || lastChar === '"') {
		// Quoted path: scan back to the matching opening quote.
		const openIndex = withoutTrailingWs.lastIndexOf(
			lastChar,
			withoutTrailingWs.length - 2,
		);
		if (openIndex === -1) {
			return null;
		}
		raw = withoutTrailingWs.slice(openIndex);
		token = raw.slice(1, -1);
	} else {
		// Unquoted: token starts after the last whitespace that is not
		// backslash-escaped (drag-and-drop escapes spaces as "\ ").
		let start = 0;
		for (let i = withoutTrailingWs.length - 1; i >= 0; i--) {
			const ch = withoutTrailingWs[i];
			if ((ch === ' ' || ch === '\t') && withoutTrailingWs[i - 1] !== '\\') {
				start = i + 1;
				break;
			}
		}
		raw = withoutTrailingWs.slice(start);
		// Unescape the characters shells escape in dropped paths.
		token = raw.replace(/\\([ ()&'"!])/g, '$1');
	}

	if (!token || !hasImageExtension(token)) {
		return null;
	}

	// Expand ~ and resolve relative paths against the working directory.
	let filePath = token;
	if (filePath === '~' || filePath.startsWith('~/')) {
		filePath = resolve(homedir(), filePath.slice(2));
	}
	if (!isAbsolute(filePath)) {
		filePath = resolve(process.cwd(), filePath);
	}

	return {raw, filePath};
}

export type ImageValidationResult =
	| {ok: true; absolutePath: string; mediaType: string; fileSize: number}
	| {
			ok: false;
			reason:
				| 'not-found'
				| 'not-a-file'
				| 'unsupported-extension'
				| 'too-large';
			message: string;
	  };

/** Validate that a path points at a supported, readable, size-capped image. */
export async function validateImageFile(
	filePath: string,
): Promise<ImageValidationResult> {
	const mediaType = getImageMediaType(filePath);
	if (!mediaType) {
		return {
			ok: false,
			reason: 'unsupported-extension',
			message: `Unsupported image type: ${basename(filePath)} (supported: ${Object.keys(IMAGE_MEDIA_TYPES).join(', ')})`,
		};
	}

	let stats: Awaited<ReturnType<typeof stat>>;
	try {
		stats = await stat(filePath);
	} catch {
		return {
			ok: false,
			reason: 'not-found',
			message: `Image not found: ${filePath}`,
		};
	}

	if (!stats.isFile()) {
		return {
			ok: false,
			reason: 'not-a-file',
			message: `Not a file: ${filePath}`,
		};
	}

	if (stats.size > MAX_IMAGE_ATTACHMENT_BYTES) {
		const maxMb = Math.round(MAX_IMAGE_ATTACHMENT_BYTES / (1024 * 1024));
		const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
		return {
			ok: false,
			reason: 'too-large',
			message: `Image too large: ${basename(filePath)} is ${sizeMb} MB (max ${maxMb} MB)`,
		};
	}

	return {ok: true, absolutePath: filePath, mediaType, fileSize: stats.size};
}

/** Count the IMAGE placeholders currently present in an input state. */
export function countImagePlaceholders(state: InputState): number {
	return Object.values(state.placeholderContent).filter(
		content => content.type === PlaceholderType.IMAGE,
	).length;
}

/**
 * Add an IMAGE placeholder for a validated image file.
 *
 * `rawToken` is the path text to replace with the indicator; pass null to
 * append the indicator at the end instead (clipboard captures). Returns null
 * when the per-message attachment cap is already reached.
 */
export function addImagePlaceholder(
	state: InputState,
	validated: {absolutePath: string; mediaType: string; fileSize: number},
	rawToken: string | null,
): InputState | null {
	if (countImagePlaceholders(state) >= MAX_IMAGE_ATTACHMENTS_PER_MESSAGE) {
		return null;
	}

	// Number from the highest existing index so removing "[Image #1]" never
	// makes a later attachment reuse its label within the same draft.
	let maxIndex = 0;
	for (const [id, content] of Object.entries(state.placeholderContent)) {
		if (content.type !== PlaceholderType.IMAGE) continue;
		const match = id.match(/^image_(\d+)$/);
		if (match) {
			maxIndex = Math.max(maxIndex, Number.parseInt(match[1], 10));
		}
	}
	const index = maxIndex + 1;
	const id = `image_${index}`;
	const displayText = `[Image #${index}: ${basename(validated.absolutePath)}]`;

	const placeholder: ImagePlaceholderContent = {
		type: PlaceholderType.IMAGE,
		displayText,
		filePath: validated.absolutePath,
		mediaType: validated.mediaType,
		fileSize: validated.fileSize,
	};

	let displayValue: string;
	if (rawToken !== null && state.displayValue.includes(rawToken)) {
		// Replace the LAST occurrence (the trailing token we just detected).
		const at = state.displayValue.lastIndexOf(rawToken);
		displayValue =
			state.displayValue.slice(0, at) +
			displayText +
			state.displayValue.slice(at + rawToken.length);
	} else {
		const needsSpace =
			state.displayValue.length > 0 && !/\s$/.test(state.displayValue);
		displayValue = state.displayValue + (needsSpace ? ' ' : '') + displayText;
	}

	return {
		displayValue,
		placeholderContent: {
			...state.placeholderContent,
			[id]: placeholder,
		},
	};
}

export interface CollectedImages {
	attachments: ImageAttachment[];
	/** Human-readable problems (file vanished/grew); attachments are skipped. */
	warnings: string[];
}

/**
 * Read the image files referenced by the IMAGE placeholders that are still
 * present in the display value, in display order, and return them base64
 * encoded for the outgoing message. Placeholders whose indicator text was
 * deleted from the input are not sent — deleting "[Image #1: x.png]" is the
 * "remove before send" gesture.
 */
export async function collectImageAttachments(
	state: InputState,
): Promise<CollectedImages> {
	const attachments: ImageAttachment[] = [];
	const warnings: string[] = [];

	const present = Object.values(state.placeholderContent)
		.filter(
			(content): content is ImagePlaceholderContent =>
				content.type === PlaceholderType.IMAGE,
		)
		.map(content => ({
			content,
			at: state.displayValue.indexOf(content.displayText),
		}))
		.filter(entry => entry.at !== -1)
		.sort((a, b) => a.at - b.at);

	for (const {content} of present) {
		const validated = await validateImageFile(content.filePath);
		if (!validated.ok) {
			warnings.push(`${validated.message} — attachment skipped`);
			continue;
		}
		try {
			const data = await readFile(validated.absolutePath);
			attachments.push({
				data: data.toString('base64'),
				mediaType: validated.mediaType,
				filename: basename(validated.absolutePath),
			});
		} catch {
			// stat passed but the read failed (permissions, races) — skip with
			// a warning instead of rejecting the whole submit.
			warnings.push(
				`Could not read image: ${content.filePath} — attachment skipped`,
			);
		}
	}

	return {attachments, warnings};
}
