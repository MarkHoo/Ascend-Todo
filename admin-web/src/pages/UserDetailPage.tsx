import { Card, Descriptions, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { formatLocalTime } from '@/utils/format';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { data } = useQuery({ queryKey: ['admin-user', id], queryFn: () => adminApi.user(id), enabled: Boolean(id) });
  return (
    <div className="page">
      <h1>用户详情</h1>
      <Card>
        <Descriptions column={1} bordered>
          <Descriptions.Item label="用户 ID">{data?.id}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{data?.email}</Descriptions.Item>
          <Descriptions.Item label="昵称">{data?.nickname || '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱验证">
            {data?.emailVerifiedAt ? <Tag color="green">已验证</Tag> : <Tag>未验证</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="当前客户端版本">{data?.currentClientVersion || '-'}</Descriptions.Item>
          <Descriptions.Item label="角色">{data?.role}</Descriptions.Item>
          <Descriptions.Item label="状态">{data?.status}</Descriptions.Item>
          <Descriptions.Item label="注册时间">{formatLocalTime(data?.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="最近登录">{formatLocalTime(data?.lastLoginAt)}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
