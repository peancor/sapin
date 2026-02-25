<script lang="ts">
    import QuizCard from './ui/QuizCard.svelte';
    import FlashcardDeck from './ui/FlashcardDeck.svelte';

    interface Props {
        instanceId: string;
        componentKey: string;
        props: Record<string, unknown>;
        interactive: boolean;
        initialUserResponse?: Record<string, unknown>;
        apiBase: string;
        onRespond?: (score?: number) => void;
    }

    let {
        instanceId,
        componentKey,
        props,
        interactive,
        initialUserResponse,
        apiBase,
        onRespond
    }: Props = $props();
</script>

{#if componentKey === 'QuizCard'}
    <QuizCard
        {instanceId}
        title={props.title as string | undefined}
        questions={props.questions as { question: string; options: string[]; correctIndex: number; explanation?: string }[]}
        {interactive}
        {initialUserResponse}
        {apiBase}
        onRespond={(score) => onRespond?.(score)}
    />
{:else if componentKey === 'FlashcardDeck'}
    <FlashcardDeck
        {instanceId}
        title={props.title as string | undefined}
        cards={props.cards as { front: string; back: string }[]}
        {interactive}
        {initialUserResponse}
        {apiBase}
        onRespond={() => onRespond?.()}
    />
{:else}
    <!-- Unknown component: show raw props as fallback -->
    <div class="my-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 text-xs text-gray-500">
        <span class="font-medium">[{componentKey}]</span>
        <pre class="mt-1 overflow-auto text-xs">{JSON.stringify(props, null, 2)}</pre>
    </div>
{/if}
