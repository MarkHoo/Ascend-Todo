import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import type { SyncLog } from '@/types';

export function SyncLogsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-sync-logs'], queryFn: adminApi.syncLogs });
  return (
    <div className="page">
      <h1>同步日志</h1>
      <Table<SyncLog>
        rowKey="id"
        loading={isLoading}
        dataSource={data || []}
        columns={[
          { title: '时间', dataIndex: 'created_at' },
          { title: '用户 ID', dataIndex: 'user_id' },
          { title: '设备 ID', dataIndex: 'device_id' },
          { title: '动作', dataIndex: 'action' },
          { title: '状态', render: (_, row) => row.status === 'success' ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
          { title: '远端版本', dataIndex: 'remote_version' },
          { title: '大小', dataIndex: 'payload_size' },
          { title: '错误', dataIndex: 'error_message' },
        ]}
      />
    </div>
  );
}

