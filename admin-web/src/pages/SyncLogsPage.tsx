import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import type { SyncLog } from '@/types';
import { compactId, formatLocalTime } from '@/utils/format';

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
          { title: '时间', render: (_, row) => formatLocalTime(row.createdAt) },
          { title: '用户昵称', render: (_, row) => row.userNickname || '-' },
          { title: '用户 ID', render: (_, row) => compactId(row.userId) },
          { title: '设备 ID', render: (_, row) => compactId(row.deviceId) },
          { title: '动作', dataIndex: 'action' },
          { title: '状态', render: (_, row) => row.status === 'success' ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
          { title: '远端版本', dataIndex: 'remoteVersion' },
          { title: '大小', dataIndex: 'payloadSize' },
          { title: '错误', dataIndex: 'errorMessage' },
        ]}
      />
    </div>
  );
}
