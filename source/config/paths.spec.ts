import * as path from 'path';
import test from 'ava';
import {
	getAppDataPath,
	getBasePath,
	getCacheDir,
	getConfigDir,
	getConfigPath,
	getDataDir,
	getLogsDir,
	getProjectConfigDir,
	getProjectSessionsDir,
	getProjectCommandsDir,
	getSessionsDir,
	hasProjectConfig,
} from './paths';

// These tests intentionally lock in the public contract for Nanocoder's
// configuration and data directories. Do not change expected values
// without providing a migration strategy.

console.log(`\npaths.spec.ts`);

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ENV = {...process.env};

function setPlatform(platform: NodeJS.Platform) {
	Object.defineProperty(process, 'platform', {
		value: platform,
		configurable: true,
	});
}

function resetEnvironment() {
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) delete process.env[key];
	}
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		process.env[key] = value as string;
	}
	Object.defineProperty(process, 'platform', {
		value: ORIGINAL_PLATFORM,
		configurable: true,
	});
}

test.afterEach(() => {
	resetEnvironment();
});

function testPathGetter(
	t: import('ava').ExecutionContext,
	platform: NodeJS.Platform,
	env: Record<string, string | undefined>,
	getter: () => string,
	expected: string,
) {
	resetEnvironment();
	setPlatform(platform);
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	t.is(getter(), expected);
}

// getAppDataPath

test.serial('getAppDataPath uses NANOCODER_DATA_DIR override verbatim', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_DATA_DIR: '/custom/data',
			APPDATA: 'C:/Ignored',
			XDG_DATA_HOME: '/ignored',
		},
		getAppDataPath,
		'/custom/data',
	);
});

test.serial('getAppDataPath darwin default path is stable', t => {
	testPathGetter(
		t,
		'darwin',
		{HOME: '/Users/test'},
		getAppDataPath,
		path.join('/Users/test', 'Library', 'Application Support', 'nanocoder'),
	);
});

test.serial('getAppDataPath win32 uses APPDATA when set', t => {
	testPathGetter(
		t,
		'win32',
		{APPDATA: path.join('C:', 'Users', 'test', 'AppData', 'Roaming')},
		getAppDataPath,
		path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder'),
	);
});

test.serial(
	'getAppDataPath win32 falls back to homedir Roaming when APPDATA missing',
	t => {
		testPathGetter(
			t,
			'win32',
			{APPDATA: undefined, HOME: path.join('C:', 'Users', 'test')},
			getAppDataPath,
			path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder'),
		);
	},
);

test.serial(
	'getAppDataPath linux honours XDG_DATA_HOME and ignores APPDATA',
	t => {
		testPathGetter(
			t,
			'linux',
			{XDG_DATA_HOME: '/xdg-data', APPDATA: '/should-not-be-used'},
			getAppDataPath,
			path.join('/xdg-data', 'nanocoder'),
		);
	},
);

test.serial('getAppDataPath linux falls back to ~/.local/share', t => {
	testPathGetter(
		t,
		'linux',
		{XDG_DATA_HOME: undefined, HOME: '/home/test'},
		getAppDataPath,
		path.join('/home/test', '.local', 'share', 'nanocoder'),
	);
});

test.serial(
	'getAppDataPath non-standard platform falls back to Linux-style defaults',
	t => {
		testPathGetter(
			t,
			'freebsd',
			{XDG_DATA_HOME: undefined, HOME: '/home/test'},
			getAppDataPath,
			path.join('/home/test', '.local', 'share', 'nanocoder'),
		);
	},
);

// getConfigPath

test.serial('getConfigPath uses NANOCODER_CONFIG_DIR override verbatim', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_CONFIG_DIR: '/custom/config',
			XDG_CONFIG_HOME: '/ignored',
			APPDATA: 'C:/Ignored',
		},
		getConfigPath,
		'/custom/config',
	);
});

test.serial('getConfigPath darwin default path is stable', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_CONFIG_DIR: undefined, HOME: '/Users/test'},
		getConfigPath,
		path.join('/Users/test', 'Library', 'Preferences', 'nanocoder'),
	);
});

test.serial('getConfigPath win32 uses APPDATA when set', t => {
	testPathGetter(
		t,
		'win32',
		{
			NANOCODER_CONFIG_DIR: undefined,
			APPDATA: path.join('C:', 'Users', 'test', 'AppData', 'Roaming'),
		},
		getConfigPath,
		path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder'),
	);
});

test.serial(
	'getConfigPath win32 falls back to homedir Roaming when APPDATA missing',
	t => {
		testPathGetter(
			t,
			'win32',
			{
				NANOCODER_CONFIG_DIR: undefined,
				APPDATA: undefined,
				HOME: path.join('C:', 'Users', 'test'),
			},
			getConfigPath,
			path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder'),
		);
	},
);

test.serial(
	'getConfigPath linux honours XDG_CONFIG_HOME and ignores APPDATA',
	t => {
		testPathGetter(
			t,
			'linux',
			{
				NANOCODER_CONFIG_DIR: undefined,
				XDG_CONFIG_HOME: '/xdg-config',
				APPDATA: '/should-not-be-used',
			},
			getConfigPath,
			path.join('/xdg-config', 'nanocoder'),
		);
	},
);

test.serial('getConfigPath linux falls back to ~/.config', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_CONFIG_DIR: undefined,
			XDG_CONFIG_HOME: undefined,
			HOME: '/home/test',
		},
		getConfigPath,
		path.join('/home/test', '.config', 'nanocoder'),
	);
});

test.serial(
	'getConfigPath non-standard platform falls back to Linux-style defaults',
	t => {
		testPathGetter(
			t,
			'freebsd',
			{
				NANOCODER_CONFIG_DIR: undefined,
				XDG_CONFIG_HOME: undefined,
				HOME: '/home/test',
			},
			getConfigPath,
			path.join('/home/test', '.config', 'nanocoder'),
		);
	},
);

// ============================================
// New Unified Path Functions (Issue #230)
// ============================================

// getBasePath - Primary base path for all nanocoder files

test.serial('getBasePath uses NANOCODER_HOME_DIR override verbatim', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_HOME_DIR: '/custom/nanocoder'},
		getBasePath,
		'/custom/nanocoder',
	);
});

test.serial('getBasePath darwin uses ~/.config/nanocoder', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_HOME_DIR: undefined, HOME: '/Users/test'},
		getBasePath,
		path.join('/Users/test', '.config', 'nanocoder'),
	);
});

test.serial('getBasePath linux uses ~/.config/nanocoder', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_HOME_DIR: undefined, HOME: '/home/test'},
		getBasePath,
		path.join('/home/test', '.config', 'nanocoder'),
	);
});

test.serial('getBasePath win32 uses APPDATA\\nanocoder', t => {
	testPathGetter(
		t,
		'win32',
		{
			NANOCODER_HOME_DIR: undefined,
			APPDATA: path.join('C:', 'Users', 'test', 'AppData', 'Roaming'),
		},
		getBasePath,
		path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder'),
	);
});

test.serial(
	'getBasePath win32 falls back to homedir when APPDATA missing',
	t => {
		testPathGetter(
			t,
			'win32',
			{
				NANOCODER_HOME_DIR: undefined,
				APPDATA: undefined,
				HOME: path.join('C:', 'Users', 'test'),
			},
			getBasePath,
			path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder'),
		);
	},
);

// getConfigDir - Config subdirectory

test.serial('getConfigDir uses NANOCODER_CONFIG_DIR override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_CONFIG_DIR: '/custom/config'},
		getConfigDir,
		'/custom/config',
	);
});

test.serial('getConfigDir returns base/config by default', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_CONFIG_DIR: undefined, HOME: '/Users/test'},
		getConfigDir,
		path.join('/Users/test', '.config', 'nanocoder', 'config'),
	);
});

// getDataDir - Data subdirectory

test.serial('getDataDir uses NANOCODER_DATA_DIR override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_DATA_DIR: '/custom/data'},
		getDataDir,
		'/custom/data',
	);
});

test.serial('getDataDir returns base/data by default', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_DATA_DIR: undefined, HOME: '/Users/test'},
		getDataDir,
		path.join('/Users/test', '.config', 'nanocoder', 'data'),
	);
});

// getLogsDir - Logs subdirectory

test.serial('getLogsDir uses NANOCODER_LOG_DIR override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_LOG_DIR: '/custom/logs'},
		getLogsDir,
		'/custom/logs',
	);
});

test.serial('getLogsDir returns base/logs by default', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_LOG_DIR: undefined, HOME: '/Users/test'},
		getLogsDir,
		path.join('/Users/test', '.config', 'nanocoder', 'logs'),
	);
});

// getCacheDir - Cache subdirectory

test.serial('getCacheDir returns base/cache', t => {
	testPathGetter(
		t,
		'darwin',
		{HOME: '/Users/test'},
		getCacheDir,
		path.join('/Users/test', '.config', 'nanocoder', 'cache'),
	);
});

// getSessionsDir - Sessions subdirectory

test.serial('getSessionsDir returns base/sessions', t => {
	testPathGetter(
		t,
		'darwin',
		{HOME: '/Users/test'},
		getSessionsDir,
		path.join('/Users/test', '.config', 'nanocoder', 'sessions'),
	);
});

// Project-local path functions

test.serial('getProjectConfigDir returns .nanocoder in cwd', t => {
	resetEnvironment();
	const result = getProjectConfigDir('/project/path');
	t.is(result, path.join('/project/path', '.nanocoder'));
});

test.serial('getProjectSessionsDir returns .nanocoder/sessions', t => {
	resetEnvironment();
	const result = getProjectSessionsDir('/project/path');
	t.is(result, path.join('/project/path', '.nanocoder', 'sessions'));
});

test.serial('getProjectCommandsDir returns .nanocoder/commands', t => {
	resetEnvironment();
	const result = getProjectCommandsDir('/project/path');
	t.is(result, path.join('/project/path', '.nanocoder', 'commands'));
});

test.serial('hasProjectConfig returns false for non-existent directory', t => {
	resetEnvironment();
	// Use a path that definitely doesn't exist
	const result = hasProjectConfig('/non/existent/path/12345');
	t.false(result);
});
