import { Card, Col, Row, Statistic } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { useAdminI18n } from '@/i18n';

export function DashboardPage() {
  const { text } = useAdminI18n();
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: adminApi.overview });
  const verifiedRate = data && data.totalUsers > 0 ? Math.round((data.verifiedUsers / data.totalUsers) * 100) : 0;
  const versionLabels = data?.clientVersions?.map((item) => item.version) || [];

  return (
    <div className="page">
      <h1>{text.dashboard}</h1>
      <Row gutter={[16, 16]}>
        <Col span={6}><Card><Statistic title={text.totalUsers} value={data?.totalUsers || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title={text.verifiedUsers} value={data?.verifiedUsers || 0} suffix={`(${verifiedRate}%)`} /></Card></Col>
        <Col span={6}><Card><Statistic title={text.totalDevices} value={data?.totalDevices || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title={text.syncFailedToday} value={data?.syncFailedToday || 0} valueStyle={{ color: '#cf1322' }} /></Card></Col>
      </Row>
      <Card className="chart-card" title={text.syncOverviewToday}>
        <ReactECharts
          style={{ height: 280 }}
          option={{
            tooltip: {},
            xAxis: { type: 'category', data: [text.success, text.failed] },
            yAxis: { type: 'value', minInterval: 1 },
            series: [{ type: 'bar', data: [data?.syncSuccessToday || 0, data?.syncFailedToday || 0], itemStyle: { color: '#1677ff' } }],
          }}
        />
      </Card>
      <Card className="chart-card" title={text.clientVersionDistribution}>
        <ReactECharts
          style={{ height: 320 }}
          option={{
            tooltip: { trigger: 'axis' },
            legend: { data: [text.userCount, text.deviceCount] },
            grid: { left: 48, right: 24, top: 48, bottom: 48 },
            xAxis: { type: 'category', data: versionLabels },
            yAxis: { type: 'value', minInterval: 1 },
            series: [
              { name: text.userCount, type: 'bar', data: data?.clientVersions?.map((item) => item.users) || [], itemStyle: { color: '#1677ff' } },
              { name: text.deviceCount, type: 'bar', data: data?.clientVersions?.map((item) => item.devices) || [], itemStyle: { color: '#52c41a' } },
            ],
          }}
        />
      </Card>
    </div>
  );
}
