import { Card, Descriptions, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { useAdminI18n } from '@/i18n';

export function SystemHealthPage() {
  const { text } = useAdminI18n();
  const { data } = useQuery({ queryKey: ['admin-system-health'], queryFn: adminApi.systemHealth });
  return (
    <div className="page">
      <h1>{text.systemHealth}</h1>
      <Card>
        <Descriptions bordered column={1}>
          <Descriptions.Item label={text.api}>{data?.ok ? <Tag color="green">{text.normal}</Tag> : <Tag color="red">{text.abnormal}</Tag>}</Descriptions.Item>
          <Descriptions.Item label={text.database}>{data?.database ? <Tag color="green">{text.normal}</Tag> : <Tag color="red">{text.abnormal}</Tag>}</Descriptions.Item>
          <Descriptions.Item label={text.serviceVersion}>{data?.version || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
