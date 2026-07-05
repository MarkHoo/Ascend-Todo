import { Card, Descriptions, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';

export function SystemHealthPage() {
  const { data } = useQuery({ queryKey: ['admin-system-health'], queryFn: adminApi.systemHealth });
  return (
    <div className="page">
      <h1>系统健康</h1>
      <Card>
        <Descriptions bordered column={1}>
          <Descriptions.Item label="API">{data?.ok ? <Tag color="green">正常</Tag> : <Tag color="red">异常</Tag>}</Descriptions.Item>
          <Descriptions.Item label="数据库">{data?.database ? <Tag color="green">正常</Tag> : <Tag color="red">异常</Tag>}</Descriptions.Item>
          <Descriptions.Item label="服务版本">{data?.version || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}

