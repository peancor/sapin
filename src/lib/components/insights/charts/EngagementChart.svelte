<script lang="ts">
    import EChart from '$lib/components/charts/EChart.svelte';
    import { theme } from '$lib/stores/theme';
    import type { EngagementChartData } from '$lib/types/insights';

    interface Props {
        data: EngagementChartData;
    }

    let { data }: Props = $props();

    let currentTheme = $derived($theme);

    let chartOptions = $derived(() => {
        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    label: {
                        backgroundColor: '#6a7985'
                    }
                }
            },
            legend: {
                data: ['Engagement', 'Mensajes'],
                bottom: '0%',
                textStyle: {
                    color: currentTheme === 'dark' ? '#9ca3af' : '#4b5563'
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                top: '10%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: data.dates,
                axisLine: {
                    lineStyle: {
                        color: currentTheme === 'dark' ? '#4b5563' : '#d1d5db'
                    }
                },
                axisLabel: {
                    color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280'
                }
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'Engagement %',
                    position: 'left',
                    axisLine: {
                        show: true,
                        lineStyle: {
                            color: '#8b5cf6'
                        }
                    },
                    axisLabel: {
                        color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
                        formatter: '{value}%'
                    },
                    splitLine: {
                        lineStyle: {
                            color: currentTheme === 'dark' ? '#374151' : '#e5e7eb'
                        }
                    },
                    max: 100
                },
                {
                    type: 'value',
                    name: 'Mensajes',
                    position: 'right',
                    axisLine: {
                        show: true,
                        lineStyle: {
                            color: '#3b82f6'
                        }
                    },
                    axisLabel: {
                        color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280'
                    },
                    splitLine: {
                        show: false
                    }
                }
            ],
            series: [
                {
                    name: 'Engagement',
                    type: 'line',
                    yAxisIndex: 0,
                    smooth: true,
                    lineStyle: {
                        width: 3,
                        color: '#8b5cf6'
                    },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(139, 92, 246, 0.3)' },
                                { offset: 1, color: 'rgba(139, 92, 246, 0.05)' }
                            ]
                        }
                    },
                    itemStyle: {
                        color: '#8b5cf6'
                    },
                    data: data.engagement
                },
                {
                    name: 'Mensajes',
                    type: 'bar',
                    yAxisIndex: 1,
                    barWidth: '40%',
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: '#3b82f6' },
                                { offset: 1, color: '#1d4ed8' }
                            ]
                        },
                        borderRadius: [4, 4, 0, 0]
                    },
                    data: data.messages
                }
            ]
        };
    });
</script>

<EChart options={chartOptions()} height="300px" theme={currentTheme} />
