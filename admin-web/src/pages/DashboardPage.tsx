import { Card, Col, Row, Statistic } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';

export function DashboardPage() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: adminApi.overview });
  const verifiedRate = data && data.total_users > 0 ? Math.round((data.verified_users / data.total_users) * 100) : 0;

  return (
    <div className="page">
      <h1>运营概览</h1>
      <Row gutter={[16, 16]}>
        <Col span={6}><Card><Statistic title="总用户数" value={data?.total_users || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="已验证邮箱" value={data?.verified_users || 0} suffix={`(${verifiedRate}%)`} /></Card></Col>
        <Col span={6}><Card><Statistic title="设备数" value={data?.total_devices || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="今日同步失败" value={data?.sync_failed_today || 0} valueStyle={{ color: '#cf1322' }} /></Card></Col>
      </Row>
      <Card className="chart-card" title="今日同步概况">
        <ReactECharts
          style={{ height: 280 }}
          option={{
            tooltip: {},
            xAxis: { type: 'category', data: ['成功', '失败'] },
            yAxis: { type: 'value', minInterval: 1 },
            series: [{ type: 'bar', data: [data?.sync_success_today || 0, data?.sync_failed_today || 0], itemStyle: { color: '#1677ff' } }],
          }}
        />
      </Card>
    </div>
  );
}

