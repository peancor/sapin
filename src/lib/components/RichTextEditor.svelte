<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import Underline from '@tiptap/extension-underline';
	import Link from '@tiptap/extension-link';
	import Image from '@tiptap/extension-image';
	import TextAlign from '@tiptap/extension-text-align';
	import Typography from '@tiptap/extension-typography';
	import Highlight from '@tiptap/extension-highlight';
	import { Markdown } from '@tiptap/markdown';
	import {
		Bold,
		Italic,
		Underline as UnderlineIcon,
		Strikethrough,
		List,
		ListOrdered,
		Quote,
		Heading1,
		Heading2,
		Heading3,
		AlignLeft,
		AlignCenter,
		AlignRight,
		Link as LinkIcon,
		Unlink,
		Highlighter,
		Undo,
		Redo
	} from 'lucide-svelte';

	interface Props {
		value?: string;
		placeholder?: string;
		rows?: number;
		onchange?: (content: string) => void;
		name?: string;
		id?: string;
		enableImagePaste?: boolean;
		uploadImage?: (file: File) => Promise<{
			id: string;
			name: string;
			path: string;
			markdown: string;
		}>;
	}

	let { 
		value = '', 
		placeholder = '', 
		rows = 5, 
		onchange,
		name,
		id,
		enableImagePaste = false,
		uploadImage
	}: Props = $props();

	let element: HTMLDivElement;
	let editor: Editor | null = $state(null);
	let hiddenInput: HTMLInputElement | undefined = $state(undefined);
	let isUploadingImage = $state(false);
	let imageUploadError = $state('');

	// Flag to suppress onchange during programmatic setContent (e.g. when the
	// parent hydrates state after mount). We must not mark the form dirty then.
	let _suppressOnChange = false;

	// Calculate min-height based on rows (approximately 1.5rem per row)
	const getMinHeight = () => `${rows * 1.5}rem`;

	async function insertUploadedImage(file: File) {
		if (!uploadImage) return;

		isUploadingImage = true;
		imageUploadError = '';

		try {
			const uploaded = await uploadImage(file);
			editor?.chain().focus().setImage({
				src: uploaded.path,
				alt: uploaded.name,
				title: uploaded.name
			}).run();
		} catch (errorValue) {
			imageUploadError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo subir la imagen.';
		} finally {
			isUploadingImage = false;
		}
	}

	function extractImageFile(items: Iterable<DataTransferItem> | null | undefined): File | null {
		if (!items) return null;

		for (const item of items) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (file && file.type.startsWith('image/')) {
					return file;
				}
			}
		}

		return null;
	}

	onMount(() => {
		const minHeight = getMinHeight();
		editor = new Editor({
			element: element,
			extensions: [
				StarterKit.configure({
					heading: {
						levels: [1, 2, 3]
					}
				}),
				Placeholder.configure({
					placeholder: placeholder
				}),
				Underline,
				Link.configure({
					openOnClick: false,
					HTMLAttributes: {
						class: 'text-blue-600 underline hover:text-blue-800 dark:text-blue-400'
					}
				}),
				Image.configure({
					HTMLAttributes: {
						class: 'rounded-xl max-w-full border border-gray-200 dark:border-gray-700'
					}
				}),
				TextAlign.configure({
					types: ['heading', 'paragraph']
				}),
				Typography,
				Highlight.configure({
					HTMLAttributes: {
						class: 'bg-yellow-200 dark:bg-yellow-600'
					}
				}),
				Markdown.configure({
					indentation: {
						style: 'space',
						size: 2
					}
				})
			],
			content: value,
			contentType: 'markdown',
			editorProps: {
				attributes: {
					class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none p-3',
					style: `min-height: ${minHeight}`
				},
				handlePaste: (_view, event) => {
					if (!enableImagePaste || !uploadImage) return false;

					const file = extractImageFile(event.clipboardData?.items);
					if (!file) return false;

					event.preventDefault();
					void insertUploadedImage(file);
					return true;
				},
				handleDrop: (_view, event) => {
					if (!enableImagePaste || !uploadImage) return false;

					const file = Array.from(event.dataTransfer?.files ?? []).find((candidate) =>
						candidate.type.startsWith('image/')
					);
					if (!file) return false;

					event.preventDefault();
					void insertUploadedImage(file);
					return true;
				}
			},
			onUpdate: ({ editor }) => {
				// Get Markdown using the official API
				const markdown = editor.getMarkdown();
				// Update hidden input for form submission
				if (hiddenInput) {
					hiddenInput.value = markdown;
				}
				if (!_suppressOnChange) {
					onchange?.(markdown);
				}
			}
		});
	});

	onDestroy(() => {
		editor?.destroy();
	});

	// Update editor content when value prop changes externally
	$effect(() => {
		if (editor && value !== editor.getMarkdown()) {
			_suppressOnChange = true;
			editor.commands.setContent(value, { contentType: 'markdown' });
			_suppressOnChange = false;
		}
	});

	function setLink() {
		const previousUrl = editor?.getAttributes('link').href;
		const url = window.prompt('URL del enlace:', previousUrl);

		if (url === null) return;

		if (url === '') {
			editor?.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}

		editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	function isActive(type: string, attrs?: Record<string, unknown>): boolean {
		return editor?.isActive(type, attrs) ?? false;
	}

	function isTextAlignActive(alignment: string): boolean {
		return editor?.isActive({ textAlign: alignment }) ?? false;
	}
</script>

<div class="rich-text-editor rounded border dark:border-gray-600 bg-white dark:bg-gray-700">
	<!-- Toolbar -->
	{#if editor}
		<div class="toolbar flex flex-wrap gap-1 border-b p-2 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 rounded-t">
			<!-- Text formatting -->
			<div class="flex gap-0.5 border-r pr-2 dark:border-gray-600">
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleBold().run()}
					class="toolbar-btn"
					class:active={isActive('bold')}
					title="Negrita"
				>
					<Bold class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleItalic().run()}
					class="toolbar-btn"
					class:active={isActive('italic')}
					title="Cursiva"
				>
					<Italic class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleUnderline().run()}
					class="toolbar-btn"
					class:active={isActive('underline')}
					title="Subrayado"
				>
					<UnderlineIcon class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleStrike().run()}
					class="toolbar-btn"
					class:active={isActive('strike')}
					title="Tachado"
				>
					<Strikethrough class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleHighlight().run()}
					class="toolbar-btn"
					class:active={isActive('highlight')}
					title="Resaltar"
				>
					<Highlighter class="h-4 w-4" />
				</button>
			</div>

			<!-- Headings -->
			<div class="flex gap-0.5 border-r pr-2 dark:border-gray-600">
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
					class="toolbar-btn"
					class:active={isActive('heading', { level: 1 })}
					title="Título 1"
				>
					<Heading1 class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
					class="toolbar-btn"
					class:active={isActive('heading', { level: 2 })}
					title="Título 2"
				>
					<Heading2 class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
					class="toolbar-btn"
					class:active={isActive('heading', { level: 3 })}
					title="Título 3"
				>
					<Heading3 class="h-4 w-4" />
				</button>
			</div>

			<!-- Lists -->
			<div class="flex gap-0.5 border-r pr-2 dark:border-gray-600">
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleBulletList().run()}
					class="toolbar-btn"
					class:active={isActive('bulletList')}
					title="Lista con viñetas"
				>
					<List class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleOrderedList().run()}
					class="toolbar-btn"
					class:active={isActive('orderedList')}
					title="Lista numerada"
				>
					<ListOrdered class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().toggleBlockquote().run()}
					class="toolbar-btn"
					class:active={isActive('blockquote')}
					title="Cita"
				>
					<Quote class="h-4 w-4" />
				</button>
			</div>

			<!-- Alignment -->
			<div class="flex gap-0.5 border-r pr-2 dark:border-gray-600">
				<button
					type="button"
					onclick={() => editor?.chain().focus().setTextAlign('left').run()}
					class="toolbar-btn"
					class:active={isTextAlignActive('left')}
					title="Alinear izquierda"
				>
					<AlignLeft class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().setTextAlign('center').run()}
					class="toolbar-btn"
					class:active={isTextAlignActive('center')}
					title="Centrar"
				>
					<AlignCenter class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().setTextAlign('right').run()}
					class="toolbar-btn"
					class:active={isTextAlignActive('right')}
					title="Alinear derecha"
				>
					<AlignRight class="h-4 w-4" />
				</button>
			</div>

			<!-- Links -->
			<div class="flex gap-0.5 border-r pr-2 dark:border-gray-600">
				<button
					type="button"
					onclick={setLink}
					class="toolbar-btn"
					class:active={isActive('link')}
					title="Añadir enlace"
				>
					<LinkIcon class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().unsetLink().run()}
					class="toolbar-btn"
					disabled={!isActive('link')}
					title="Quitar enlace"
				>
					<Unlink class="h-4 w-4" />
				</button>
			</div>

			<!-- Undo/Redo -->
			<div class="flex gap-0.5">
				<button
					type="button"
					onclick={() => editor?.chain().focus().undo().run()}
					class="toolbar-btn"
					disabled={!editor?.can().undo()}
					title="Deshacer"
				>
					<Undo class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => editor?.chain().focus().redo().run()}
					class="toolbar-btn"
					disabled={!editor?.can().redo()}
					title="Rehacer"
				>
					<Redo class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Editor content -->
	<div bind:this={element} class="editor-content dark:text-white"></div>

	<!-- Hidden input for form submission -->
	{#if name}
		<input type="hidden" {name} {id} bind:this={hiddenInput} value={value} />
	{/if}

	{#if isUploadingImage || imageUploadError}
		<div class="border-t px-3 py-2 text-sm dark:border-gray-600">
			{#if isUploadingImage}
				<p class="text-sky-700 dark:text-sky-300">Subiendo imagen...</p>
			{:else if imageUploadError}
				<p class="text-red-700 dark:text-red-300">{imageUploadError}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.toolbar-btn {
		padding: 0.375rem;
		border-radius: 0.25rem;
		transition: all 0.15s ease;
		color: var(--color-gray-600);
	}

	:global(.dark) .toolbar-btn {
		color: var(--color-gray-300);
	}

	.toolbar-btn:hover:not(:disabled) {
		background-color: var(--color-gray-200);
	}

	:global(.dark) .toolbar-btn:hover:not(:disabled) {
		background-color: var(--color-gray-600);
	}

	.toolbar-btn.active {
		background-color: var(--color-blue-100);
		color: var(--color-blue-700);
	}

	:global(.dark) .toolbar-btn.active {
		background-color: var(--color-blue-900);
		color: var(--color-blue-300);
	}

	.toolbar-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.editor-content :global(.ProseMirror) {
		outline: none;
	}

	.editor-content :global(.ProseMirror p.is-editor-empty:first-child::before) {
		color: var(--color-gray-400);
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}

	/* Prose styling overrides for the editor */
	.editor-content :global(.ProseMirror h1) {
		font-size: 1.5rem;
		font-weight: 700;
		margin-top: 1rem;
		margin-bottom: 0.5rem;
	}

	.editor-content :global(.ProseMirror h2) {
		font-size: 1.25rem;
		font-weight: 600;
		margin-top: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.editor-content :global(.ProseMirror h3) {
		font-size: 1.1rem;
		font-weight: 600;
		margin-top: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.editor-content :global(.ProseMirror ul),
	.editor-content :global(.ProseMirror ol) {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}

	.editor-content :global(.ProseMirror ul) {
		list-style-type: disc;
	}

	.editor-content :global(.ProseMirror ol) {
		list-style-type: decimal;
	}

	.editor-content :global(.ProseMirror blockquote) {
		border-left: 3px solid var(--color-gray-300);
		padding-left: 1rem;
		margin: 0.5rem 0;
		color: var(--color-gray-600);
	}

	.editor-content :global(.ProseMirror img) {
		margin: 1rem 0;
		height: auto;
		max-width: 100%;
	}

	:global(.dark) .editor-content :global(.ProseMirror blockquote) {
		border-left-color: var(--color-gray-600);
		color: var(--color-gray-400);
	}
</style>
