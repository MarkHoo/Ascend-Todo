import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import type { Device } from '@/types';

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
          { title: '设备名', dataIndex: 'device_name' },
          { title: '用户 ID', dataIndex: 'user_id' },
          { title: '平台', dataIndex: 'platform' },
          { title: '版本', dataIndex: 'app_version' },
          { title: '最近同步', dataIndex: 'last_sync_at' },
          { title: '状态', render: (_, row) => row.revoked_at ? <Tag color="red">已移除</Tag> : <Tag color="green">正常</Tag> },
          { title: '清理请求', render: (_, row) => row.wipe_requested_at ? <Tag color="orange">已请求</Tag> : '-' },
        ]}
      />
    </div>
  );
}

