import path from 'path';
import {useCallback, useEffect, useState} from 'react';
import {loadPreferences, savePreferences} from '@/config/preferences';
import {logError, logInfo} from '@/utils/message-queue';

interface UseDirectoryTrustReturn {
	isTrusted: boolean;
	handleConfirmTrust: () => void;
	isTrustLoading: boolean;
	isTrustedError: string | null;
}

/**
 * Custom hook for managing directory trust functionality.
 * Handles checking if a directory is trusted and adding it to trusted directories.
 *
 * @param directory - The directory path to check trust for (defaults to current working directory)
 * @returns Object containing trust state and handler functions
 */
export function useDirectoryTrust(
	directory: string = process.cwd(),
): UseDirectoryTrustReturn {
	const [isTrusted, setIsTrusted] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Check if directory is trusted on mount and when directory changes
	useEffect(() => {
		const checkTrustStatus = () => {
			try {
				setIsLoading(true);
				setError(null);

				const preferences = loadPreferences();
				const trustedDirectories = preferences.trustedDirectories || [];

				// Normalize paths for comparison (resolve any relative path components)
				const normalizedDirectory = path.resolve(directory); // nosemgrep
				const isTrustedDir = trustedDirectories.some(
					trustedDir => path.resolve(trustedDir) === normalizedDirectory, // nosemgrep
				);

				setIsTrusted(isTrustedDir);
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : 'Unknown error occurred';
				setError(`Failed to check directory trust status: ${errorMessage}`);

				logError(`${errorMessage}`);
			} finally {
				setIsLoading(false);
			}
		};

		checkTrustStatus();
	}, [directory]);

	// Handler to confirm trust for the current directory
	const handleConfirmTrust = useCallback(() => {
		try {
			setError(null);

			const preferences = loadPreferences();
			const trustedDirectories = preferences.trustedDirectories || [];

			// Normalize the directory path before storing and checking
			const normalizedDirectory = path.resolve(directory); // nosemgrep

			// Only add if not already trusted (check using normalized paths)
			if (
				!trustedDirectories.some(
					trustedDir => path.resolve(trustedDir) === normalizedDirectory, // nosemgrep
				)
			) {
				trustedDirectories.push(normalizedDirectory);
				preferences.trustedDirectories = trustedDirectories;
				savePreferences(preferences);

				logInfo(`Directory added to trusted list: ${normalizedDirectory}`);
			}

			setIsTrusted(true);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : 'Unknown error occurred';
			setError(`Failed to save directory trust: ${errorMessage}`);

			logError(`${errorMessage}`);
		}
	}, [directory]);

	return {
		isTrusted,
		handleConfirmTrust,
		isTrustLoading: isLoading,
		isTrustedError: error,
	};
}
