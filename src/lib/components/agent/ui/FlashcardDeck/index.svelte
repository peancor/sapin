<script lang="ts">
    import 'katex/dist/katex.min.css';
    import { renderMarkdownMath } from '$lib/utils';

    interface Flashcard {
        front: string;
        back: string;
    }

    interface Props {
        instanceId: string;
        title?: string;
        cards: Flashcard[];
        interactive: boolean;
        initialUserResponse?: Record<string, unknown>;
        apiBase: string;
        onRespond?: () => void;
    }

    let {
        instanceId,
        title,
        cards,
        interactive: initialInteractive,
        initialUserResponse,
        apiBase,
        onRespond
    }: Props = $props();

    let completed = $state(!!initialUserResponse);
    let interactive = $state(initialInteractive && !initialUserResponse);

    let currentIndex = $state(0);
    let isFlipped = $state(false);
    let isSubmitting = $state(false);
    let submitError = $state('');
    let reviewedCount = $state(
        initialUserResponse?.cardsReviewed ? (initialUserResponse.cardsReviewed as number) : 0
    );

    const currentCard = $derived(cards[currentIndex]);
    const isLast = $derived(currentIndex === cards.length - 1);

    function renderCardContent(content: string): string {
        try {
            return renderMarkdownMath(content ?? '');
        } catch {
            return content ?? '';
        }
    }

    function flip() {
        isFlipped = !isFlipped;
    }

    function next() {
        if (currentIndex < cards.length - 1) {
            currentIndex++;
            isFlipped = false;
            reviewedCount = Math.max(reviewedCount, currentIndex + 1);
        }
    }

    function prev() {
        if (currentIndex > 0) {
            currentIndex--;
            isFlipped = false;
        }
    }

    async function finish() {
        if (!interactive || isSubmitting) return;
        isSubmitting = true;
        submitError = '';

        try {
            const res = await fetch(`${apiBase}/ui-response`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId,
                    componentKey: 'FlashcardDeck',
                    payload: {
                        cardsReviewed: cards.length,
                        completed: true
                    }
                })
            });
            if (!res.ok) {
                submitError = 'No se pudo guardar el progreso. Intenta nuevamente.';
                return;
            }
        } catch {
            submitError = 'No se pudo guardar el progreso. Intenta nuevamente.';
            return;
        } finally {
            isSubmitting = false;
        }

        completed = true;
        interactive = false;
        onRespond?.();
    }
</script>

<div class="my-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div class="flex items-center gap-2">
            <svg class="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
            <span class="text-sm font-semibold text-gray-900 dark:text-white">
                {title ?? 'Flashcards'}
            </span>
        </div>
        <span class="text-xs text-gray-400">
            {currentIndex + 1} / {cards.length}
        </span>
    </div>

    {#if completed}
        <!-- Completed state -->
        <div class="px-4 py-8 text-center">
            <div class="mb-2 text-2xl">✓</div>
            <p class="text-sm font-medium text-green-600 dark:text-green-400">¡Mazo completado!</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Revisaste {cards.length} tarjetas</p>
        </div>
    {:else}
        <!-- Flashcard -->
        <div class="px-4 py-4">
            <button
                onclick={flip}
                class="w-full min-h-[100px] rounded-xl border-2 border-dashed
                    {isFlipped
                        ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-700'
                        : 'border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-600'}
                    px-4 py-4 text-left transition-colors cursor-pointer"
            >
                <div class="mb-1.5 text-xs font-medium uppercase tracking-wide
                    {isFlipped ? 'text-indigo-400' : 'text-gray-400'}">
                    {isFlipped ? 'Respuesta' : 'Pregunta'}
                </div>
                <div class="prose prose-sm max-w-none text-sm text-gray-900 dark:prose-invert dark:text-white [&_p]:m-0">
                    {@html renderCardContent(isFlipped ? currentCard.back : currentCard.front)}
                </div>
                <p class="mt-2 text-xs text-gray-400 text-right">
                    {isFlipped ? 'Clic para ver la pregunta' : 'Clic para ver la respuesta'}
                </p>
            </button>
        </div>

        <!-- Navigation -->
        <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            {#if submitError}
                <p class="mb-2 text-xs text-red-600 dark:text-red-400">{submitError}</p>
            {/if}
            <div class="flex items-center justify-between">
            <button
                onclick={prev}
                disabled={currentIndex === 0}
                class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600
                    hover:bg-gray-50 dark:hover:bg-gray-700
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                    text-gray-600 dark:text-gray-300"
            >
                ← Anterior
            </button>

            <!-- Progress dots -->
            <div class="flex gap-1">
                {#each cards as _, i}
                    <span class="h-1.5 w-1.5 rounded-full transition-colors
                        {i === currentIndex
                            ? 'bg-indigo-500'
                            : i < currentIndex
                                ? 'bg-indigo-200 dark:bg-indigo-800'
                                : 'bg-gray-200 dark:bg-gray-600'}
                    "></span>
                {/each}
            </div>

            {#if interactive && isLast}
                <button
                    onclick={finish}
                    disabled={isSubmitting}
                    class="px-3 py-1.5 text-xs font-medium rounded-lg
                        bg-indigo-600 text-white hover:bg-indigo-700
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {isSubmitting ? 'Guardando...' : 'Completar'}
                </button>
            {:else}
                <button
                    onclick={next}
                    disabled={isLast}
                    class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600
                        hover:bg-gray-50 dark:hover:bg-gray-700
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                        text-gray-600 dark:text-gray-300"
                >
                    Siguiente →
                </button>
            {/if}
            </div>
        </div>
    {/if}
</div>
