import { Card, Descriptions, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { useAdminI18n } from '@/i18n';
import { formatLocalTime } from '@/utils/format';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { language, text } = useAdminI18n();
  const { data } = useQuery({ queryKey: ['admin-user', id], queryFn: () => adminApi.user(id), enabled: Boolean(id) });
  return (
    <div className="page">
      <h1>{text.userDetails}</h1>
      <Card>
        <Descriptions column={1} bordered>
          <Descriptions.Item label={text.userId}>{data?.id}</Descriptions.Item>
          <Descriptions.Item label={text.email}>{data?.email}</Descriptions.Item>
          <Descriptions.Item label={text.nickname}>{data?.nickname || '-'}</Descriptions.Item>
          <Descriptions.Item label={text.emailVerification}>
            {data?.emailVerifiedAt ? <Tag color="green">{text.verified}</Tag> : <Tag>{text.unverified}</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label={text.currentClientVersion}>{data?.currentClientVersion || '-'}</Descriptions.Item>
          <Descriptions.Item label={text.role}>{data?.role}</Descriptions.Item>
          <Descriptions.Item label={text.status}>{data?.status}</Descriptions.Item>
          <Descriptions.Item label={text.registeredAt}>{formatLocalTime(data?.createdAt, language)}</Descriptions.Item>
          <Descriptions.Item label={text.lastLogin}>{formatLocalTime(data?.lastLoginAt, language)}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
