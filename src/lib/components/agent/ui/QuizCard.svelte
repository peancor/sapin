<script lang="ts">
    interface Question {
        question: string;
        options: string[];
        correctIndex: number;
        explanation?: string;
    }

    interface Props {
        instanceId: string;
        title?: string;
        questions: Question[];
        interactive: boolean;
        initialUserResponse?: Record<string, unknown>;
        apiBase: string;
        onRespond?: (score: number) => void;
    }

    let {
        instanceId,
        title,
        questions,
        interactive: initialInteractive,
        initialUserResponse,
        apiBase,
        onRespond
    }: Props = $props();

    // If already responded, show results immediately
    let submitted = $state(!!initialUserResponse);
    let interactive = $state(initialInteractive && !initialUserResponse);
    let isSubmitting = $state(false);
    let submitError = $state('');

    // User's selected answers (index or -1 for unanswered)
    let answers = $state<number[]>(
        initialUserResponse?.answers
            ? (initialUserResponse.answers as number[])
            : questions.map(() => -1)
    );

    const score = $derived(
        submitted
            ? answers.filter((a, i) => a === questions[i].correctIndex).length / questions.length
            : 0
    );

    const scorePercent = $derived(Math.round(score * 100));

    function selectAnswer(questionIndex: number, optionIndex: number) {
        if (!interactive || submitted) return;
        answers = answers.map((a, i) => (i === questionIndex ? optionIndex : a));
    }

    const allAnswered = $derived(answers.every((a) => a >= 0));

    async function submitQuiz() {
        if (!allAnswered || submitted || isSubmitting) return;
        isSubmitting = true;
        submitError = '';

        const finalScore = answers.filter((a, i) => a === questions[i].correctIndex).length / questions.length;

        try {
            const res = await fetch(`${apiBase}/ui-response`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId,
                    componentKey: 'QuizCard',
                    payload: {
                        answers,
                        score: finalScore,
                        completed: true
                    }
                })
            });
            if (!res.ok) {
                submitError = 'No se pudo guardar tu respuesta. Intenta nuevamente.';
                return;
            }
        } catch {
            submitError = 'No se pudo guardar tu respuesta. Intenta nuevamente.';
            return;
        } finally {
            isSubmitting = false;
        }

        submitted = true;
        interactive = false;
        onRespond?.(finalScore);
    }

    function getOptionClass(qIdx: number, optIdx: number): string {
        if (!submitted) {
            const isSelected = answers[qIdx] === optIdx;
            return isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-400 text-blue-800 dark:text-blue-200'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-400 cursor-pointer';
        }
        // Show results
        const isCorrect = optIdx === questions[qIdx].correctIndex;
        const isSelected = answers[qIdx] === optIdx;
        if (isCorrect) return 'border-green-500 bg-green-50 dark:bg-green-950 dark:border-green-400 text-green-800 dark:text-green-200';
        if (isSelected && !isCorrect) return 'border-red-400 bg-red-50 dark:bg-red-950 dark:border-red-400 text-red-800 dark:text-red-200';
        return 'border-gray-200 dark:border-gray-600 opacity-50';
    }
</script>

<div class="my-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div class="flex items-center gap-2">
            <svg class="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <span class="text-sm font-semibold text-gray-900 dark:text-white">
                {title ?? 'Quiz'}
            </span>
        </div>
        {#if submitted}
            <span class="text-xs font-medium px-2 py-0.5 rounded-full
                {scorePercent >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}">
                {scorePercent}%
            </span>
        {:else}
            <span class="text-xs text-gray-400">{questions.length} pregunta{questions.length !== 1 ? 's' : ''}</span>
        {/if}
    </div>

    <!-- Questions -->
    <div class="divide-y divide-gray-100 dark:divide-gray-700">
        {#each questions as q, qIdx}
            <div class="px-4 py-3">
                <p class="text-sm font-medium text-gray-900 dark:text-white mb-2.5">
                    {qIdx + 1}. {q.question}
                </p>
                <div class="space-y-1.5">
                    {#each q.options as opt, optIdx}
                        <button
                            class="w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors
                                {getOptionClass(qIdx, optIdx)}"
                            onclick={() => selectAnswer(qIdx, optIdx)}
                            disabled={!interactive || submitted}
                        >
                            <span class="font-medium mr-1.5">{String.fromCharCode(65 + optIdx)}.</span>
                            {opt}
                        </button>
                    {/each}
                </div>
                {#if submitted && q.explanation}
                    <p class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                        {q.explanation}
                    </p>
                {/if}
            </div>
        {/each}
    </div>

    <!-- Footer -->
    {#if interactive && !submitted}
        <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            {#if submitError}
                <p class="mb-2 text-xs text-red-600 dark:text-red-400">{submitError}</p>
            {/if}
            <div class="flex justify-end">
            <button
                onclick={submitQuiz}
                disabled={!allAnswered || isSubmitting}
                class="px-4 py-1.5 text-xs font-medium rounded-lg
                    bg-purple-600 text-white hover:bg-purple-700
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-colors"
            >
                {#if isSubmitting}
                    Enviando...
                {:else}
                    Enviar respuestas
                {/if}
            </button>
            </div>
        </div>
    {:else if submitted}
        <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <p class="text-xs text-center
                {scorePercent >= 70 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}">
                {#if scorePercent === 100}
                    ¡Perfecto! Respondiste todo correctamente.
                {:else if scorePercent >= 70}
                    Buen trabajo: {answers.filter((a, i) => a === questions[i].correctIndex).length}/{questions.length} correctas.
                {:else}
                    {answers.filter((a, i) => a === questions[i].correctIndex).length}/{questions.length} correctas. ¡Sigue practicando!
                {/if}
            </p>
        </div>
    {/if}
</div>
