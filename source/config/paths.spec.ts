import * as path from 'path';
import test from 'ava';
import {
	getAppDataPath,
	getCacheDir,
	getConfigDir,
	getConfigPath,
	getDataDir,
	getGlobalCommandsDir,
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

// ============================================
// Deprecated Functions (backward compatibility)
// ============================================

// getAppDataPath (deprecated - use getDataDir)

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

// getConfigPath (deprecated - use getConfigDir)

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

test.serial('getConfigPath darwin uses Application Support', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_CONFIG_DIR: undefined, HOME: '/Users/test'},
		getConfigPath,
		path.join('/Users/test', 'Library', 'Application Support', 'nanocoder'),
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
// Platform-Native Path Functions (Issue #230)
// ============================================

// getConfigDir - Platform-native config directory

test.serial('getConfigDir uses NANOCODER_CONFIG_DIR override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_CONFIG_DIR: '/custom/config'},
		getConfigDir,
		'/custom/config',
	);
});

test.serial('getConfigDir uses NANOCODER_HOME override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_HOME: '/custom/home', NANOCODER_CONFIG_DIR: undefined},
		getConfigDir,
		path.join('/custom/home', 'config'),
	);
});

test.serial('getConfigDir darwin uses Application Support/config', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_CONFIG_DIR: undefined, NANOCODER_HOME: undefined, HOME: '/Users/test'},
		getConfigDir,
		path.join('/Users/test', 'Library', 'Application Support', 'nanocoder', 'config'),
	);
});

test.serial('getConfigDir linux uses XDG_CONFIG_HOME', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_CONFIG_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_CONFIG_HOME: '/xdg-config',
		},
		getConfigDir,
		path.join('/xdg-config', 'nanocoder'),
	);
});

test.serial('getConfigDir linux falls back to ~/.config', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_CONFIG_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_CONFIG_HOME: undefined,
			HOME: '/home/test',
		},
		getConfigDir,
		path.join('/home/test', '.config', 'nanocoder'),
	);
});

test.serial('getConfigDir win32 uses APPDATA/config', t => {
	testPathGetter(
		t,
		'win32',
		{
			NANOCODER_CONFIG_DIR: undefined,
			NANOCODER_HOME: undefined,
			APPDATA: path.join('C:', 'Users', 'test', 'AppData', 'Roaming'),
		},
		getConfigDir,
		path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder', 'config'),
	);
});

// getDataDir - Platform-native data directory

test.serial('getDataDir uses NANOCODER_DATA_DIR override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_DATA_DIR: '/custom/data'},
		getDataDir,
		'/custom/data',
	);
});

test.serial('getDataDir uses NANOCODER_HOME override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_HOME: '/custom/home', NANOCODER_DATA_DIR: undefined},
		getDataDir,
		path.join('/custom/home', 'data'),
	);
});

test.serial('getDataDir darwin uses Application Support/data', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_DATA_DIR: undefined, NANOCODER_HOME: undefined, HOME: '/Users/test'},
		getDataDir,
		path.join('/Users/test', 'Library', 'Application Support', 'nanocoder', 'data'),
	);
});

test.serial('getDataDir linux uses XDG_DATA_HOME', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_DATA_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_DATA_HOME: '/xdg-data',
		},
		getDataDir,
		path.join('/xdg-data', 'nanocoder'),
	);
});

test.serial('getDataDir linux falls back to ~/.local/share', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_DATA_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_DATA_HOME: undefined,
			HOME: '/home/test',
		},
		getDataDir,
		path.join('/home/test', '.local', 'share', 'nanocoder'),
	);
});

test.serial('getDataDir win32 uses APPDATA/data', t => {
	testPathGetter(
		t,
		'win32',
		{
			NANOCODER_DATA_DIR: undefined,
			NANOCODER_HOME: undefined,
			APPDATA: path.join('C:', 'Users', 'test', 'AppData', 'Roaming'),
		},
		getDataDir,
		path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder', 'data'),
	);
});

// getCacheDir - Platform-native cache directory

test.serial('getCacheDir uses NANOCODER_CACHE_DIR override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_CACHE_DIR: '/custom/cache'},
		getCacheDir,
		'/custom/cache',
	);
});

test.serial('getCacheDir uses NANOCODER_HOME override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_HOME: '/custom/home', NANOCODER_CACHE_DIR: undefined},
		getCacheDir,
		path.join('/custom/home', 'cache'),
	);
});

test.serial('getCacheDir darwin uses Library/Caches', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_CACHE_DIR: undefined, NANOCODER_HOME: undefined, HOME: '/Users/test'},
		getCacheDir,
		path.join('/Users/test', 'Library', 'Caches', 'nanocoder'),
	);
});

test.serial('getCacheDir linux uses XDG_CACHE_HOME', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_CACHE_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_CACHE_HOME: '/xdg-cache',
		},
		getCacheDir,
		path.join('/xdg-cache', 'nanocoder'),
	);
});

test.serial('getCacheDir linux falls back to ~/.cache', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_CACHE_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_CACHE_HOME: undefined,
			HOME: '/home/test',
		},
		getCacheDir,
		path.join('/home/test', '.cache', 'nanocoder'),
	);
});

test.serial('getCacheDir win32 uses LOCALAPPDATA', t => {
	testPathGetter(
		t,
		'win32',
		{
			NANOCODER_CACHE_DIR: undefined,
			NANOCODER_HOME: undefined,
			LOCALAPPDATA: path.join('C:', 'Users', 'test', 'AppData', 'Local'),
		},
		getCacheDir,
		path.join('C:', 'Users', 'test', 'AppData', 'Local', 'nanocoder', 'cache'),
	);
});

test.serial('getCacheDir win32 falls back to homedir Local', t => {
	testPathGetter(
		t,
		'win32',
		{
			NANOCODER_CACHE_DIR: undefined,
			NANOCODER_HOME: undefined,
			LOCALAPPDATA: undefined,
			HOME: path.join('C:', 'Users', 'test'),
		},
		getCacheDir,
		path.join('C:', 'Users', 'test', 'AppData', 'Local', 'nanocoder', 'cache'),
	);
});

// getLogsDir - Platform-native logs directory

test.serial('getLogsDir uses NANOCODER_LOG_DIR override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_LOG_DIR: '/custom/logs'},
		getLogsDir,
		'/custom/logs',
	);
});

test.serial('getLogsDir uses NANOCODER_HOME override', t => {
	testPathGetter(
		t,
		'linux',
		{NANOCODER_HOME: '/custom/home', NANOCODER_LOG_DIR: undefined},
		getLogsDir,
		path.join('/custom/home', 'logs'),
	);
});

test.serial('getLogsDir darwin uses Library/Logs', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_LOG_DIR: undefined, NANOCODER_HOME: undefined, HOME: '/Users/test'},
		getLogsDir,
		path.join('/Users/test', 'Library', 'Logs', 'nanocoder'),
	);
});

test.serial('getLogsDir linux uses XDG_STATE_HOME', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_LOG_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_STATE_HOME: '/xdg-state',
		},
		getLogsDir,
		path.join('/xdg-state', 'nanocoder', 'logs'),
	);
});

test.serial('getLogsDir linux falls back to ~/.local/state', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_LOG_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_STATE_HOME: undefined,
			HOME: '/home/test',
		},
		getLogsDir,
		path.join('/home/test', '.local', 'state', 'nanocoder', 'logs'),
	);
});

test.serial('getLogsDir win32 uses APPDATA/logs', t => {
	testPathGetter(
		t,
		'win32',
		{
			NANOCODER_LOG_DIR: undefined,
			NANOCODER_HOME: undefined,
			APPDATA: path.join('C:', 'Users', 'test', 'AppData', 'Roaming'),
		},
		getLogsDir,
		path.join('C:', 'Users', 'test', 'AppData', 'Roaming', 'nanocoder', 'logs'),
	);
});

// getSessionsDir - Sessions subdirectory under data

test.serial('getSessionsDir darwin returns data/sessions', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_DATA_DIR: undefined, NANOCODER_HOME: undefined, HOME: '/Users/test'},
		getSessionsDir,
		path.join('/Users/test', 'Library', 'Application Support', 'nanocoder', 'data', 'sessions'),
	);
});

test.serial('getSessionsDir linux returns XDG data/sessions', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_DATA_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_DATA_HOME: undefined,
			HOME: '/home/test',
		},
		getSessionsDir,
		path.join('/home/test', '.local', 'share', 'nanocoder', 'sessions'),
	);
});

// getGlobalCommandsDir - Commands subdirectory under data

test.serial('getGlobalCommandsDir darwin returns data/commands', t => {
	testPathGetter(
		t,
		'darwin',
		{NANOCODER_DATA_DIR: undefined, NANOCODER_HOME: undefined, HOME: '/Users/test'},
		getGlobalCommandsDir,
		path.join('/Users/test', 'Library', 'Application Support', 'nanocoder', 'data', 'commands'),
	);
});

test.serial('getGlobalCommandsDir linux returns XDG data/commands', t => {
	testPathGetter(
		t,
		'linux',
		{
			NANOCODER_DATA_DIR: undefined,
			NANOCODER_HOME: undefined,
			XDG_DATA_HOME: undefined,
			HOME: '/home/test',
		},
		getGlobalCommandsDir,
		path.join('/home/test', '.local', 'share', 'nanocoder', 'commands'),
	);
});

// ============================================
// Project-local path functions
// ============================================

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
