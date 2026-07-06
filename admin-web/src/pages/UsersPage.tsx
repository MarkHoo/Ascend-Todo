import { Button, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { useAdminI18n } from '@/i18n';
import type { User } from '@/types';
import { formatLocalTime } from '@/utils/format';

export function UsersPage() {
  const navigate = useNavigate();
  const { language, text } = useAdminI18n();
  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: adminApi.users });
  return (
    <div className="page">
      <h1>{text.users}</h1>
      <Table<User>
        rowKey="id"
        loading={isLoading}
        dataSource={data || []}
        columns={[
          { title: text.email, dataIndex: 'email' },
          { title: text.nickname, render: (_, row) => row.nickname || '-' },
          {
            title: text.emailVerification,
            render: (_, row) => row.emailVerifiedAt ? <Tag color="green">{text.verified}</Tag> : <Tag>{text.unverified}</Tag>,
          },
          { title: text.clientVersion, render: (_, row) => row.currentClientVersion || '-' },
          { title: text.role, dataIndex: 'role' },
          { title: text.status, dataIndex: 'status' },
          { title: text.lastLogin, render: (_, row) => formatLocalTime(row.lastLoginAt, language) },
          { title: text.action, render: (_, row) => <Button size="small" onClick={() => navigate(`/users/${row.id}`)}>{text.details}</Button> },
        ]}
      />
    </div>
  );
}
