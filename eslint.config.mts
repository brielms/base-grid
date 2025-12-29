import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// Disable strict TypeScript rules for Obsidian plugin compatibility
			// Obsidian plugins frequently deal with dynamic frontmatter data that is inherently any-typed
			"@typescript-eslint/no-unsafe-assignment": "off", // Data from config.get() and frontmatter is any
			"@typescript-eslint/no-unsafe-argument": "off", // Passing dynamic data to Obsidian APIs
			"@typescript-eslint/no-unsafe-call": "off", // Calling methods on dynamic objects
			"@typescript-eslint/no-unsafe-member-access": "off", // Accessing properties on dynamic data
			"@typescript-eslint/no-explicit-any": "off", // Any is necessary for dynamic frontmatter handling
			"@typescript-eslint/no-redundant-type-constituents": "off", // Union with unknown is valid for dynamic data
			"@typescript-eslint/restrict-template-expressions": "off", // String() conversion is safe for display
			"@typescript-eslint/no-base-to-string": "off", // Explicit String() calls are intentional
			"@typescript-eslint/no-deprecated": "off", // window.event is deprecated but still works
			"@typescript-eslint/no-misused-promises": "off", // Async functions in event handlers are valid
			"@typescript-eslint/no-unsafe-return": "off", // Returning dynamic data is valid
			"no-console": "off", // Debug logging is allowed in development
			"obsidianmd/no-static-styles-assignment": "off", // Direct style assignment needed for dynamic styling
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
