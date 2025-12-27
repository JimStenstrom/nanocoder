import test from 'ava';
import React from 'react';
import {renderWithTheme} from '../../test-utils/render-with-theme';
import {createStaticComponents} from './app-container';
import type {AppContainerProps} from './app-container';

test('createStaticComponents includes welcome message when shouldShowWelcome is true', t => {
	const props: AppContainerProps = {
		shouldShowWelcome: true,
		currentProvider: 'test-provider',
		currentModel: 'test-model',
		currentTheme: 'tokyo-night',
		updateInfo: null,
		mcpServersStatus: undefined,
		lspServersStatus: [],
		preferencesLoaded: true,
		customCommandsCount: 0,
	};

	const components = createStaticComponents(props);
	t.is(components.length, 2); // Welcome + Status
	t.is((components[0] as React.ReactElement).key, 'welcome');
	t.is((components[1] as React.ReactElement).key, 'status');

	// Render and verify the components display correctly
	const {lastFrame, unmount} = renderWithTheme(<>{components}</>);
	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Nanocoder/); // Welcome message should contain "Nanocoder"
	unmount();
});

test('createStaticComponents excludes welcome message when shouldShowWelcome is false', t => {
	const props: AppContainerProps = {
		shouldShowWelcome: false,
		currentProvider: 'test-provider',
		currentModel: 'test-model',
		currentTheme: 'tokyo-night',
		updateInfo: null,
		mcpServersStatus: undefined,
		lspServersStatus: [],
		preferencesLoaded: true,
		customCommandsCount: 0,
	};

	const components = createStaticComponents(props);
	t.is(components.length, 1); // Only Status
	t.is((components[0] as React.ReactElement).key, 'status');

	// Render and verify the components display correctly
	const {lastFrame, unmount} = renderWithTheme(<>{components}</>);
	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /test-provider/); // Should show provider name
	t.regex(output!, /test-model/); // Should show model name
	unmount();
});

test('createStaticComponents always includes status component', t => {
	const props: AppContainerProps = {
		shouldShowWelcome: false,
		currentProvider: 'local',
		currentModel: 'gpt-4',
		currentTheme: 'dracula',
		updateInfo: {hasUpdate: true, currentVersion: '1.0.0', latestVersion: '1.1.0'},
		mcpServersStatus: [],
		lspServersStatus: [],
		preferencesLoaded: true,
		customCommandsCount: 5,
	};

	const components = createStaticComponents(props);
	const statusComponent = components.find(
		c => (c as React.ReactElement).key === 'status',
	) as React.ReactElement<{
		provider: string;
		model: string;
		theme: string;
		customCommandsCount: number;
	}>;

	t.truthy(statusComponent);
	t.is(statusComponent.props.provider, 'local');
	t.is(statusComponent.props.model, 'gpt-4');
	t.is(statusComponent.props.theme, 'dracula');
	t.is(statusComponent.props.customCommandsCount, 5);

	// Render and verify the components display correctly
	const {lastFrame, unmount} = renderWithTheme(<>{components}</>);
	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /local/); // Provider name
	t.regex(output!, /gpt-4/); // Model name
	t.regex(output!, /5.*commands?/i); // Custom commands count
	unmount();
});
