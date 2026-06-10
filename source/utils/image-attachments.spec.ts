import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'ava';
import {
	MAX_IMAGE_ATTACHMENT_BYTES,
	MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '../constants.js';
import type {InputState} from '../types/hooks';
import {type ImagePlaceholderContent, PlaceholderType} from '../types/hooks';
import {
	addImagePlaceholder,
	collectImageAttachments,
	countImagePlaceholders,
	detectTrailingImagePathToken,
	getImageMediaType,
	hasImageExtension,
	validateImageFile,
} from './image-attachments.js';

console.log('\nimage-attachments.spec.ts');

// 1x1 transparent PNG
const PNG_BYTES = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64',
);

let tempDir: string;

test.before(async () => {
	tempDir = await mkdtemp(join(tmpdir(), 'nanocoder-img-spec-'));
});

test.after.always(async () => {
	await rm(tempDir, {recursive: true, force: true});
});

function emptyState(): InputState {
	return {displayValue: '', placeholderContent: {}};
}

function imagePlaceholder(
	overrides: Partial<ImagePlaceholderContent>,
): ImagePlaceholderContent {
	return {
		type: PlaceholderType.IMAGE,
		displayText: '[Image #1: shot.png]',
		filePath: '/nonexistent/shot.png',
		mediaType: 'image/png',
		fileSize: PNG_BYTES.length,
		...overrides,
	};
}

// --- getImageMediaType / hasImageExtension ---

test('getImageMediaType maps supported extensions case-insensitively', t => {
	t.is(getImageMediaType('/a/b.png'), 'image/png');
	t.is(getImageMediaType('/a/b.PNG'), 'image/png');
	t.is(getImageMediaType('/a/b.jpg'), 'image/jpeg');
	t.is(getImageMediaType('/a/b.jpeg'), 'image/jpeg');
	t.is(getImageMediaType('/a/b.gif'), 'image/gif');
	t.is(getImageMediaType('/a/b.webp'), 'image/webp');
});

test('getImageMediaType returns null for unsupported extensions', t => {
	t.is(getImageMediaType('/a/b.txt'), null);
	t.is(getImageMediaType('/a/b.pdf'), null);
	t.is(getImageMediaType('/a/b'), null);
	t.false(hasImageExtension('/a/b.svg'));
});

// --- detectTrailingImagePathToken ---

test('detectTrailingImagePathToken finds a plain absolute path', t => {
	const result = detectTrailingImagePathToken('look at /tmp/shot.png');
	t.truthy(result);
	t.is(result!.raw, '/tmp/shot.png');
	t.is(result!.filePath, '/tmp/shot.png');
});

test('detectTrailingImagePathToken tolerates trailing whitespace (drag-and-drop)', t => {
	const result = detectTrailingImagePathToken('/tmp/shot.png ');
	t.truthy(result);
	t.is(result!.raw, '/tmp/shot.png');
});

test('detectTrailingImagePathToken handles single-quoted paths with spaces', t => {
	const result = detectTrailingImagePathToken(
		"see '/tmp/my shots/screen 1.png'",
	);
	t.truthy(result);
	t.is(result!.raw, "'/tmp/my shots/screen 1.png'");
	t.is(result!.filePath, '/tmp/my shots/screen 1.png');
});

test('detectTrailingImagePathToken handles double-quoted paths', t => {
	const result = detectTrailingImagePathToken('"/tmp/a b.jpg"');
	t.truthy(result);
	t.is(result!.filePath, '/tmp/a b.jpg');
});

test('detectTrailingImagePathToken unescapes backslash-escaped spaces', t => {
	const result = detectTrailingImagePathToken(
		'check /tmp/my\\ shots/screen\\ 1.png',
	);
	t.truthy(result);
	t.is(result!.raw, '/tmp/my\\ shots/screen\\ 1.png');
	t.is(result!.filePath, '/tmp/my shots/screen 1.png');
});

test('detectTrailingImagePathToken resolves relative paths against cwd', t => {
	const result = detectTrailingImagePathToken('shots/a.png');
	t.truthy(result);
	t.is(result!.filePath, join(process.cwd(), 'shots/a.png'));
});

test('detectTrailingImagePathToken returns null for non-image tails', t => {
	t.is(detectTrailingImagePathToken('hello world'), null);
	t.is(detectTrailingImagePathToken('see /tmp/file.txt'), null);
	t.is(detectTrailingImagePathToken('/tmp/shot.png is nice'), null);
	t.is(detectTrailingImagePathToken(''), null);
	t.is(detectTrailingImagePathToken('   '), null);
});

// --- validateImageFile ---

test('validateImageFile accepts a real png within the size cap', async t => {
	const filePath = join(tempDir, 'ok.png');
	await writeFile(filePath, PNG_BYTES);

	const result = await validateImageFile(filePath);
	t.true(result.ok);
	if (result.ok) {
		t.is(result.absolutePath, filePath);
		t.is(result.mediaType, 'image/png');
		t.is(result.fileSize, PNG_BYTES.length);
	}
});

test('validateImageFile rejects missing files', async t => {
	const result = await validateImageFile(join(tempDir, 'missing.png'));
	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'not-found');
	}
});

test('validateImageFile rejects unsupported extensions', async t => {
	const filePath = join(tempDir, 'doc.txt');
	await writeFile(filePath, 'not an image');

	const result = await validateImageFile(filePath);
	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'unsupported-extension');
	}
});

test('validateImageFile rejects directories', async t => {
	// A directory whose name ends in .png
	const dirPath = join(tempDir, 'dir.png');
	await mkdir(dirPath, {recursive: true});

	const result = await validateImageFile(dirPath);
	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'not-a-file');
	}
});

test('validateImageFile rejects files over the size cap', async t => {
	const filePath = join(tempDir, 'big.png');
	await writeFile(filePath, Buffer.alloc(MAX_IMAGE_ATTACHMENT_BYTES + 1));

	const result = await validateImageFile(filePath);
	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'too-large');
		t.true(result.message.includes('big.png'));
	}
});

// --- addImagePlaceholder ---

test('addImagePlaceholder replaces the path token with an indicator', t => {
	const state: InputState = {
		displayValue: 'broken layout: /tmp/shot.png ',
		placeholderContent: {},
	};

	const next = addImagePlaceholder(
		state,
		{absolutePath: '/tmp/shot.png', mediaType: 'image/png', fileSize: 10},
		'/tmp/shot.png',
	);

	t.truthy(next);
	t.is(next!.displayValue, 'broken layout: [Image #1: shot.png] ');
	const entry = next!.placeholderContent.image_1;
	t.is(entry.type, PlaceholderType.IMAGE);
	t.is(entry.displayText, '[Image #1: shot.png]');
	if (entry.type === PlaceholderType.IMAGE) {
		t.is(entry.filePath, '/tmp/shot.png');
		t.is(entry.mediaType, 'image/png');
		t.is(entry.fileSize, 10);
	}
});

test('addImagePlaceholder appends the indicator when no token given (clipboard)', t => {
	const state: InputState = {
		displayValue: 'see this',
		placeholderContent: {},
	};

	const next = addImagePlaceholder(
		state,
		{absolutePath: '/tmp/clip.png', mediaType: 'image/png', fileSize: 5},
		null,
	);

	t.truthy(next);
	t.is(next!.displayValue, 'see this [Image #1: clip.png]');
});

test('addImagePlaceholder numbers from the highest existing index', t => {
	const state: InputState = {
		displayValue: 'a [Image #2: b.png] c',
		placeholderContent: {
			image_2: imagePlaceholder({displayText: '[Image #2: b.png]'}),
		},
	};

	const next = addImagePlaceholder(
		state,
		{absolutePath: '/tmp/c.png', mediaType: 'image/png', fileSize: 5},
		null,
	);

	t.truthy(next);
	t.truthy(next!.placeholderContent.image_3);
	t.true(next!.displayValue.includes('[Image #3: c.png]'));
});

test('addImagePlaceholder enforces the per-message cap', t => {
	const placeholderContent: InputState['placeholderContent'] = {};
	for (let i = 1; i <= MAX_IMAGE_ATTACHMENTS_PER_MESSAGE; i++) {
		placeholderContent[`image_${i}`] = imagePlaceholder({
			displayText: `[Image #${i}: shot.png]`,
		});
	}
	const state: InputState = {displayValue: 'x', placeholderContent};
	t.is(countImagePlaceholders(state), MAX_IMAGE_ATTACHMENTS_PER_MESSAGE);

	const next = addImagePlaceholder(
		state,
		{absolutePath: '/tmp/extra.png', mediaType: 'image/png', fileSize: 5},
		null,
	);

	t.is(next, null);
});

// --- collectImageAttachments ---

test('collectImageAttachments reads attached files as base64', async t => {
	const filePath = join(tempDir, 'collect.png');
	await writeFile(filePath, PNG_BYTES);

	const state: InputState = {
		displayValue: 'look [Image #1: collect.png]',
		placeholderContent: {
			image_1: imagePlaceholder({
				displayText: '[Image #1: collect.png]',
				filePath,
			}),
		},
	};

	const {attachments, warnings} = await collectImageAttachments(state);
	t.is(warnings.length, 0);
	t.is(attachments.length, 1);
	t.is(attachments[0].data, PNG_BYTES.toString('base64'));
	t.is(attachments[0].mediaType, 'image/png');
	t.is(attachments[0].filename, 'collect.png');
});

test('collectImageAttachments skips placeholders deleted from the display value', async t => {
	const filePath = join(tempDir, 'deleted.png');
	await writeFile(filePath, PNG_BYTES);

	// The indicator text is gone from displayValue (user removed it), but the
	// placeholderContent entry is stale — it must NOT be sent.
	const state: InputState = {
		displayValue: 'no images here',
		placeholderContent: {
			image_1: imagePlaceholder({
				displayText: '[Image #1: deleted.png]',
				filePath,
			}),
		},
	};

	const {attachments, warnings} = await collectImageAttachments(state);
	t.is(attachments.length, 0);
	t.is(warnings.length, 0);
});

test('collectImageAttachments warns and skips when the file vanished', async t => {
	const state: InputState = {
		displayValue: '[Image #1: gone.png]',
		placeholderContent: {
			image_1: imagePlaceholder({
				displayText: '[Image #1: gone.png]',
				filePath: join(tempDir, 'gone.png'),
			}),
		},
	};

	const {attachments, warnings} = await collectImageAttachments(state);
	t.is(attachments.length, 0);
	t.is(warnings.length, 1);
	t.true(warnings[0].includes('gone.png'));
});

test('collectImageAttachments preserves display order', async t => {
	const firstPath = join(tempDir, 'first.png');
	const secondPath = join(tempDir, 'second.png');
	await writeFile(firstPath, PNG_BYTES);
	await writeFile(secondPath, Buffer.concat([PNG_BYTES, Buffer.from([0])]));

	const state: InputState = {
		displayValue: '[Image #2: first.png] then [Image #1: second.png]',
		placeholderContent: {
			// Registered out of order on purpose; display order must win.
			image_1: imagePlaceholder({
				displayText: '[Image #1: second.png]',
				filePath: secondPath,
			}),
			image_2: imagePlaceholder({
				displayText: '[Image #2: first.png]',
				filePath: firstPath,
			}),
		},
	};

	const {attachments} = await collectImageAttachments(state);
	t.is(attachments.length, 2);
	t.is(attachments[0].filename, 'first.png');
	t.is(attachments[1].filename, 'second.png');
});
