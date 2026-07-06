import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import type { Device } from '@/types';
import { compactId, formatLocalTime } from '@/utils/format';

export function DevicesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-devices'], queryFn: adminApi.devices });
  return (
    <div className="page">
      <h1>设备管理</h1>
      <Table<Device>
        rowKey="id"
        loading={isLoading}
        dataSource={data || []}
        columns={[
          { title: '设备名', dataIndex: 'deviceName' },
          { title: '用户昵称', render: (_, row) => row.userNickname || '-' },
          { title: '用户 ID', render: (_, row) => compactId(row.userId) },
          { title: '平台', dataIndex: 'platform' },
          { title: '版本', render: (_, row) => row.appVersion || '-' },
          { title: '最近登录', render: (_, row) => formatLocalTime(row.lastLoginAt) },
          { title: '最近同步', render: (_, row) => formatLocalTime(row.lastSyncAt) },
          { title: '状态', render: (_, row) => row.revokedAt ? <Tag color="red">已移除</Tag> : <Tag color="green">正常</Tag> },
          { title: '清理请求', render: (_, row) => row.wipeRequestedAt ? <Tag color="orange">已请求</Tag> : '-' },
        ]}
      />
    </div>
  );
}
