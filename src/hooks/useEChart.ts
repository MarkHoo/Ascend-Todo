import { useEffect, useRef, useCallback } from 'react';
import type { ECharts, EChartsCoreOption } from 'echarts/core';

type EChartsCore = typeof import('echarts/core');

let echartsLoader: Promise<EChartsCore> | null = null;

async function loadECharts() {
  if (!echartsLoader) {
    echartsLoader = Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers'),
    ]).then(([echarts, charts, components, renderers]) => {
      echarts.use([
        charts.BarChart,
        charts.PieChart,
        charts.LineChart,
        components.TitleComponent,
        components.TooltipComponent,
        components.GridComponent,
        components.LegendComponent,
        renderers.CanvasRenderer,
      ]);
      return echarts;
    });
  }
  return echartsLoader;
}

export function useEChart(
  option: EChartsCoreOption | null,
  deps: unknown[] = [],
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const echartsRef = useRef<EChartsCore | null>(null);

  const initChart = useCallback(async () => {
    if (!containerRef.current) return;
    if (chartRef.current) {
      chartRef.current.dispose();
    }
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const echarts = echartsRef.current || await loadECharts();
    echartsRef.current = echarts;
    chartRef.current = echarts.init(containerRef.current, undefined, {
      renderer: 'canvas',
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    initChart().then(() => {
      if (disposed && chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    });
    const handleResize = () => {
      chartRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [initChart]);

  useEffect(() => {
    if (!option) return;
    let disposed = false;
    const setOption = async () => {
      if (!chartRef.current) {
        await initChart();
      }
      if (disposed || !chartRef.current) return;
      chartRef.current.setOption(option, true);
    };
    setOption();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, initChart, ...deps]);

  return containerRef;
}
