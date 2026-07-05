import { Button, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import type { User } from '@/types';

export function UsersPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: adminApi.users });
  return (
    <div className="page">
      <h1>用户管理</h1>
      <Table<User>
        rowKey="id"
        loading={isLoading}
        dataSource={data || []}
        columns={[
          { title: '邮箱', dataIndex: 'email' },
          { title: '邮箱验证', render: (_, row) => row.email_verified_at ? <Tag color="green">已验证</Tag> : <Tag>未验证</Tag> },
          { title: '角色', dataIndex: 'role' },
          { title: '状态', dataIndex: 'status' },
          { title: '最近登录', dataIndex: 'last_login_at' },
          { title: '操作', render: (_, row) => <Button size="small" onClick={() => navigate(`/users/${row.id}`)}>详情</Button> },
        ]}
      />
    </div>
  );
}

