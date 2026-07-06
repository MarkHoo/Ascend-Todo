import { Card, Col, Row, Statistic } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';

export function DashboardPage() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: adminApi.overview });
  const verifiedRate = data && data.totalUsers > 0 ? Math.round((data.verifiedUsers / data.totalUsers) * 100) : 0;
  const versionLabels = data?.clientVersions?.map((item) => item.version) || [];

  return (
    <div className="page">
      <h1>运营概览</h1>
      <Row gutter={[16, 16]}>
        <Col span={6}><Card><Statistic title="总用户数" value={data?.totalUsers || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="已验证邮箱" value={data?.verifiedUsers || 0} suffix={`(${verifiedRate}%)`} /></Card></Col>
        <Col span={6}><Card><Statistic title="设备数" value={data?.totalDevices || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="今日同步失败" value={data?.syncFailedToday || 0} valueStyle={{ color: '#cf1322' }} /></Card></Col>
      </Row>
      <Card className="chart-card" title="今日同步概况">
        <ReactECharts
          style={{ height: 280 }}
          option={{
            tooltip: {},
            xAxis: { type: 'category', data: ['成功', '失败'] },
            yAxis: { type: 'value', minInterval: 1 },
            series: [{ type: 'bar', data: [data?.syncSuccessToday || 0, data?.syncFailedToday || 0], itemStyle: { color: '#1677ff' } }],
          }}
        />
      </Card>
      <Card className="chart-card" title="客户端版本分布">
        <ReactECharts
          style={{ height: 320 }}
          option={{
            tooltip: { trigger: 'axis' },
            legend: { data: ['用户数', '设备数'] },
            grid: { left: 48, right: 24, top: 48, bottom: 48 },
            xAxis: { type: 'category', data: versionLabels },
            yAxis: { type: 'value', minInterval: 1 },
            series: [
              { name: '用户数', type: 'bar', data: data?.clientVersions?.map((item) => item.users) || [], itemStyle: { color: '#1677ff' } },
              { name: '设备数', type: 'bar', data: data?.clientVersions?.map((item) => item.devices) || [], itemStyle: { color: '#52c41a' } },
            ],
          }}
        />
      </Card>
    </div>
  );
}
