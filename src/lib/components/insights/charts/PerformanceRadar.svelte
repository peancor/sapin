<script lang="ts">
    import EChart from '$lib/components/charts/EChart.svelte';
    import { theme } from '$lib/stores/theme';
    import type { PerformanceRadarData } from '$lib/types/insights';

    interface Props {
        data: PerformanceRadarData;
        title?: string;
    }

    let { data, title = 'Rendimiento' }: Props = $props();

    let currentTheme = $derived($theme);

    let chartOptions = $derived(() => {
        return {
            title: {
                text: title,
                left: 'center',
                textStyle: {
                    color: currentTheme === 'dark' ? '#f3f4f6' : '#111827',
                    fontSize: 14,
                    fontWeight: 'bold'
                }
            },
            tooltip: {
                trigger: 'item'
            },
            radar: {
                indicator: data.categories.map(cat => ({
                    name: cat,
                    max: data.maxValue
                })),
                shape: 'polygon',
                splitNumber: 4,
                axisName: {
                    color: currentTheme === 'dark' ? '#9ca3af' : '#4b5563',
                    fontSize: 11
                },
                splitLine: {
                    lineStyle: {
                        color: currentTheme === 'dark' ? '#374151' : '#e5e7eb'
                    }
                },
                splitArea: {
                    show: true,
                    areaStyle: {
                        color: currentTheme === 'dark'
                            ? ['rgba(59, 130, 246, 0.1)', 'rgba(59, 130, 246, 0.05)']
                            : ['rgba(59, 130, 246, 0.08)', 'rgba(59, 130, 246, 0.02)']
                    }
                },
                axisLine: {
                    lineStyle: {
                        color: currentTheme === 'dark' ? '#4b5563' : '#d1d5db'
                    }
                }
            },
            series: [
                {
                    name: 'Rendimiento',
                    type: 'radar',
                    data: [
                        {
                            value: data.values,
                            name: 'Puntuacion',
                            areaStyle: {
                                color: {
                                    type: 'radial',
                                    x: 0.5,
                                    y: 0.5,
                                    r: 0.5,
                                    colorStops: [
                                        { offset: 0, color: 'rgba(99, 102, 241, 0.6)' },
                                        { offset: 1, color: 'rgba(99, 102, 241, 0.2)' }
                                    ]
                                }
                            },
                            lineStyle: {
                                color: '#6366f1',
                                width: 2
                            },
                            itemStyle: {
                                color: '#6366f1'
                            }
                        }
                    ]
                }
            ]
        };
    });
</script>

<EChart options={chartOptions()} height="280px" theme={currentTheme} />
