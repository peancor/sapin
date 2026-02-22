<script lang="ts">
    import EChart from '$lib/components/charts/EChart.svelte';
    import { theme } from '$lib/stores/theme';

    interface Props {
        data: {
            completed: number;
            inProgress: number;
            notStarted: number;
        };
    }

    let { data }: Props = $props();

    let currentTheme = $derived($theme);

    let chartOptions = $derived(() => {
        const total = data.completed + data.inProgress + data.notStarted;

        return {
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c} ({d}%)'
            },
            legend: {
                orient: 'horizontal',
                bottom: '0%',
                left: 'center',
                textStyle: {
                    color: currentTheme === 'dark' ? '#9ca3af' : '#4b5563'
                }
            },
            series: [
                {
                    name: 'Participacion',
                    type: 'pie',
                    radius: ['50%', '70%'],
                    center: ['50%', '45%'],
                    avoidLabelOverlap: false,
                    itemStyle: {
                        borderRadius: 8,
                        borderColor: currentTheme === 'dark' ? '#1f2937' : '#fff',
                        borderWidth: 2
                    },
                    label: {
                        show: true,
                        position: 'center',
                        formatter: () => `${total}\nTotal`,
                        fontSize: 16,
                        fontWeight: 'bold',
                        color: currentTheme === 'dark' ? '#f3f4f6' : '#111827'
                    },
                    emphasis: {
                        label: {
                            show: true,
                            fontSize: 18,
                            fontWeight: 'bold'
                        }
                    },
                    labelLine: {
                        show: false
                    },
                    data: [
                        {
                            value: data.completed,
                            name: 'Completado',
                            itemStyle: { color: '#10b981' }
                        },
                        {
                            value: data.inProgress,
                            name: 'En progreso',
                            itemStyle: { color: '#3b82f6' }
                        },
                        {
                            value: data.notStarted,
                            name: 'Sin iniciar',
                            itemStyle: { color: '#6b7280' }
                        }
                    ]
                }
            ]
        };
    });
</script>

<EChart options={chartOptions()} height="250px" theme={currentTheme} />
