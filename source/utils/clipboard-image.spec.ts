import test from 'ava';
import {
	captureClipboardImage,
	type ClipboardExec,
} from './clipboard-image.js';

console.log('\nclipboard-image.spec.ts');

interface ExecCall {
	file: string;
	args: string[];
}

function makeExec(
	impl: (file: string, args: string[]) => Promise<{stdout: Buffer | string}>,
	calls: ExecCall[] = [],
): {exec: ClipboardExec; calls: ExecCall[]} {
	const exec: ClipboardExec = (file, args, _options) => {
		calls.push({file, args});
		return impl(file, args);
	};
	return {exec, calls};
}

function execError(
	message: string,
	props: {code?: string | number; stderr?: string},
): Error {
	const error = new Error(message) as Error & {
		code?: string | number;
		stderr?: string;
	};
	error.code = props.code;
	error.stderr = props.stderr;
	return error;
}

const noopWrite = async () => {};

test('captureClipboardImage rejects unsupported platforms', async t => {
	const {exec} = makeExec(async () => ({stdout: ''}));
	const result = await captureClipboardImage({platform: 'freebsd', exec});

	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'unsupported-platform');
	}
});

test('captureClipboardImage darwin invokes osascript and returns temp path', async t => {
	const {exec, calls} = makeExec(async () => ({stdout: ''}));
	const result = await captureClipboardImage({
		platform: 'darwin',
		exec,
		tmpDir: '/tmp/spec',
		now: () => 1234,
	});

	t.true(result.ok);
	if (result.ok) {
		t.is(result.filePath, '/tmp/spec/nanocoder-clipboard-1234.png');
	}
	t.is(calls.length, 1);
	t.is(calls[0].file, 'osascript');
	t.true(calls[0].args.join(' ').includes('PNGf'));
});

test('captureClipboardImage darwin maps -1700 to no-image', async t => {
	const {exec} = makeExec(async () => {
		throw execError('exit 1', {
			code: 1,
			stderr:
				'execution error: Can’t make some data into the expected type. (-1700)',
		});
	});

	const result = await captureClipboardImage({platform: 'darwin', exec});
	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'no-image');
	}
});

test('captureClipboardImage darwin maps missing osascript to tool-missing', async t => {
	const {exec} = makeExec(async () => {
		throw execError('spawn osascript ENOENT', {code: 'ENOENT'});
	});

	const result = await captureClipboardImage({platform: 'darwin', exec});
	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'tool-missing');
	}
});

test('captureClipboardImage linux falls back across tools and writes the image', async t => {
	const written: Array<{path: string; bytes: number}> = [];
	const {exec} = makeExec(async file => {
		if (file === 'xclip') {
			throw execError('spawn xclip ENOENT', {code: 'ENOENT'});
		}
		return {stdout: Buffer.from([1, 2, 3])};
	});

	const result = await captureClipboardImage({
		platform: 'linux',
		exec,
		tmpDir: '/tmp/spec',
		now: () => 99,
		writeFileImpl: async (path, data) => {
			written.push({path, bytes: data.length});
		},
	});

	t.true(result.ok);
	if (result.ok) {
		t.is(result.filePath, '/tmp/spec/nanocoder-clipboard-99.png');
	}
	t.is(written.length, 1);
	t.is(written[0].bytes, 3);
});

test('captureClipboardImage linux reports no-image when tools have no image target', async t => {
	const {exec} = makeExec(async () => {
		throw execError('exit 1', {
			code: 1,
			stderr: 'Error: target image/png not available',
		});
	});

	const result = await captureClipboardImage({
		platform: 'linux',
		exec,
		writeFileImpl: noopWrite,
	});

	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'no-image');
	}
});

test('captureClipboardImage linux reports tool-missing when no tool exists', async t => {
	const {exec} = makeExec(async file => {
		throw execError(`spawn ${file} ENOENT`, {code: 'ENOENT'});
	});

	const result = await captureClipboardImage({
		platform: 'linux',
		exec,
		writeFileImpl: noopWrite,
	});

	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'tool-missing');
		t.true(result.message.includes('wl-clipboard'));
	}
});

test('captureClipboardImage linux treats empty clipboard output as no-image', async t => {
	const {exec} = makeExec(async () => ({stdout: Buffer.alloc(0)}));

	const result = await captureClipboardImage({
		platform: 'linux',
		exec,
		writeFileImpl: noopWrite,
	});

	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'no-image');
	}
});

test('captureClipboardImage win32 maps exit code 2 to no-image', async t => {
	const {exec} = makeExec(async () => {
		throw execError('exit 2', {code: 2});
	});

	const result = await captureClipboardImage({platform: 'win32', exec});
	t.false(result.ok);
	if (!result.ok) {
		t.is(result.reason, 'no-image');
	}
});

test('captureClipboardImage win32 success returns the temp path', async t => {
	const {exec, calls} = makeExec(async () => ({stdout: ''}));
	const result = await captureClipboardImage({
		platform: 'win32',
		exec,
		tmpDir: 'C:\\temp',
		now: () => 7,
	});

	t.true(result.ok);
	t.is(calls[0].file, 'powershell');
});
