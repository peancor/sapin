<script lang="ts">
    import type { PageData } from './$types';
    import Breadcrumb from '$lib/components/Breadcrumb.svelte';
    import { Users, BookOpen } from 'lucide-svelte';

    let { data }: { data: PageData } = $props();

    const breadcrumbItems = [
        { label: 'Home', href: '/' },
        { label: 'Student Dashboard', href: '/student' }
    ];

    const gradients = [
        'from-blue-300/60 via-indigo-200/60 to-violet-300/60',
        'from-rose-200/60 via-pink-200/60 to-purple-300/60',
        'from-sky-200/60 via-cyan-200/60 to-blue-300/60',
        'from-teal-200/60 via-emerald-200/60 to-green-300/60',
    ];

    function truncateText(text: string | null | undefined, maxLength: number) {
        if (!text) return '-';
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }
</script>

<div class="max-w-[2000px] mx-auto p-4">
    <Breadcrumb items={breadcrumbItems} />

    <div class="flex justify-between items-center mb-8">
        <h1 class="text-3xl font-bold dark:text-white">Mi Aprendizaje</h1>
    </div>

    <div class="space-y-6">
        {#each data.courses as course, i}
            <div class="group relative overflow-hidden rounded-xl bg-gradient-to-r {gradients[i % gradients.length]} shadow-lg backdrop-blur-sm transition-all duration-500 hover:shadow-2xl hover:scale-[1.01] hover:-translate-y-1">
                <!-- Shine effect on hover -->
                <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <div class="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent rotate-45 transform translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                </div>
                
                <div class="flex flex-col lg:flex-row items-center gap-8 p-8 relative z-10">
                    <div class="w-full lg:w-1/3 aspect-video rounded-lg overflow-hidden bg-black/5 transition-transform duration-500 group-hover:scale-105 group-hover:shadow-xl">
                        {#if course.image}
                            <img
                                src={course.image}
                                alt={course.name}
                                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                        {:else}
                            <div class="w-full h-full flex items-center justify-center">
                                <span class="text-white/60">No image</span>
                            </div>
                        {/if}
                    </div>
                    <div class="flex-1 text-gray-800 dark:text-white">
                        <h2 class="text-4xl font-bold mb-4 transition-transform duration-500 group-hover:translate-x-2">{course.name}</h2>
                        <p class="text-xl text-gray-700/90 dark:text-white/90 mb-8 leading-relaxed transition-all duration-500 group-hover:text-gray-900 dark:group-hover:text-white">
                            {truncateText(course.description, 150) || 'No description available'}
                        </p>
                        <div class="flex flex-wrap gap-6 items-center">
                            <div class="flex items-center gap-2">
                                <BookOpen class="w-5 h-5 text-gray-700/90 dark:text-white/90" />
                                <span class="text-gray-700/90 dark:text-white/90">{course.activityCount} Activities</span>
                            </div>
                            <a 
                                href={`/course/${course.id}/run`}
                                class="px-16 py-4 bg-white/90 dark:bg-gray-800/90 text-gray-900 dark:text-white rounded-lg shadow-lg font-semibold text-lg transition-all duration-500 hover:scale-105 hover:shadow-xl hover:-translate-y-1"
                            >
                                Continuar Aprendiendo
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        {/each}

        {#if data.courses.length === 0}
            <div class="rounded-xl bg-gradient-to-r from-gray-200/60 via-gray-300/60 to-gray-400/60 p-12 text-center transition-all duration-500 hover:shadow-xl hover:scale-[1.01]">
                <p class="text-gray-800 dark:text-white text-xl mb-2">Aún no estás inscrito en ningún curso.</p>
                <p class="text-gray-600 dark:text-gray-200">Por favor, utiliza un código de inscripción para unirte a un curso.</p>
            </div>
        {/if}
    </div>
</div>

<style>
    @keyframes shine {
        from {
            transform: translateX(-100%) rotate(45deg);
        }
        to {
            transform: translateX(200%) rotate(45deg);
        }
    }
</style>