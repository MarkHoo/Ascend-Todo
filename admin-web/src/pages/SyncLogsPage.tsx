import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { useAdminI18n } from '@/i18n';
import type { SyncLog } from '@/types';
import { compactId, formatLocalTime } from '@/utils/format';

export function SyncLogsPage() {
  const { language, text } = useAdminI18n();
  const { data, isLoading } = useQuery({ queryKey: ['admin-sync-logs'], queryFn: adminApi.syncLogs });
  return (
    <div className="page">
      <h1>{text.syncLogs}</h1>
      <Table<SyncLog>
        rowKey="id"
        loading={isLoading}
        dataSource={data || []}
        columns={[
          { title: text.time, render: (_, row) => formatLocalTime(row.createdAt, language) },
          { title: text.nickname, render: (_, row) => row.userNickname || '-' },
          { title: text.userId, render: (_, row) => compactId(row.userId) },
          { title: text.deviceId, render: (_, row) => compactId(row.deviceId) },
          { title: text.syncAction, dataIndex: 'action' },
          { title: text.status, render: (_, row) => row.status === 'success' ? <Tag color="green">{text.success}</Tag> : <Tag color="red">{text.failed}</Tag> },
          { title: text.remoteVersion, dataIndex: 'remoteVersion' },
          { title: text.size, dataIndex: 'payloadSize' },
          { title: text.error, dataIndex: 'errorMessage' },
        ]}
      />
    </div>
  );
}
