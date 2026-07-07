import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { useAdminI18n } from '@/i18n';
import type { Device } from '@/types';
import { compactId, formatLocalTime } from '@/utils/format';

export function DevicesPage() {
  const { language, text } = useAdminI18n();
  const { data, isLoading } = useQuery({ queryKey: ['admin-devices'], queryFn: adminApi.devices });
  return (
    <div className="page">
      <h1>{text.devices}</h1>
      <Table<Device>
        rowKey="id"
        loading={isLoading}
        dataSource={data || []}
        columns={[
          { title: text.deviceName, dataIndex: 'deviceName' },
          { title: text.nickname, render: (_, row) => row.userNickname || '-' },
          { title: text.userId, render: (_, row) => compactId(row.userId) },
          { title: text.platform, dataIndex: 'platform' },
          { title: text.version, render: (_, row) => row.appVersion || '-' },
          { title: text.lastLogin, render: (_, row) => formatLocalTime(row.lastLoginAt, language) },
          { title: text.lastSync, render: (_, row) => formatLocalTime(row.lastSyncAt, language) },
          { title: text.status, render: (_, row) => row.revokedAt ? <Tag color="red">{text.removed}</Tag> : <Tag color="green">{text.normal}</Tag> },
          { title: text.cleanupRequest, render: (_, row) => row.wipeRequestedAt ? <Tag color="orange">{text.requested}</Tag> : '-' },
        ]}
      />
    </div>
  );
}
