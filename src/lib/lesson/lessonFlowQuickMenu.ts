export type LessonFlowQuickMenuContext =
	| 'closed'
	| 'canvas'
	| 'node'
	| 'edge'
	| 'connect-from-handle';

export type LessonFlowQuickMenuItemTone = 'default' | 'accent' | 'danger';

export type LessonFlowQuickMenuItem = {
	id: string;
	label: string;
	description?: string;
	keywords?: string[];
	shortcut?: string;
	tone?: LessonFlowQuickMenuItemTone;
	disabled?: boolean;
};
