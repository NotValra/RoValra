import { OptionDefaults } from "typedoc";

/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
	$schema: "https://typedoc.org/schema.json",

	entryPoints: [
		"src/content/**/*.js",
		"src/content/**/*.ts",
		"src/content/**/*.jsx",
		"src/content/**/*.tsx",
	],

	out: "cidocs",
	entryPointStrategy: "resolve",
	router: "group",

	navigation: {
		includeGroups: true,
		includeCategories: false,
	},

	blockTags: [
		...OptionDefaults.blockTags,
		"@dangerous",
	],

	skipErrorChecking: true,
	customCss: "./assets/docs/styling.css",

	projectDocuments: [
		"README.md",
		"CONTRIBUTING.md",
		"assets/docs/RoValra-LICENSE.md"
	],
};
