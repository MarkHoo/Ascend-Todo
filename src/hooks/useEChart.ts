import { useEffect, useRef, useCallback } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, PieChart, LineChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  PieChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer,
]);

export function useEChart(
  option: echarts.EChartsCoreOption | null,
  deps: unknown[] = [],
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;
    if (chartRef.current) {
      chartRef.current.dispose();
    }
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    chartRef.current = echarts.init(containerRef.current, undefined, {
      renderer: 'canvas',
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    initChart();
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
    if (!chartRef.current || !option) return;
    chartRef.current.setOption(option, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, ...deps]);

  return containerRef;
}
