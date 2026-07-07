import { DashboardOutlined, DatabaseOutlined, LaptopOutlined, LogoutOutlined, TeamOutlined, ToolOutlined } from '@ant-design/icons';
import { Button, Layout, Menu, Select } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminI18n, type AdminLanguage } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

const { Header, Sider, Content } = Layout;

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const { language, setLanguage, text, languageLabels } = useAdminI18n();

  return (
    <Layout className="admin-shell">
      <Sider width={232} theme="light">
        <div className="brand">{text.appName}</div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={(item) => navigate(item.key)}
          items={[
            { key: '/', icon: <DashboardOutlined />, label: text.dashboard },
            { key: '/users', icon: <TeamOutlined />, label: text.users },
            { key: '/devices', icon: <LaptopOutlined />, label: text.devices },
            { key: '/sync-logs', icon: <DatabaseOutlined />, label: text.syncLogs },
            { key: '/system-health', icon: <ToolOutlined />, label: text.systemHealth },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="topbar">
          <span>{text.operations}</span>
          <div className="topbar-actions">
            <Select
              aria-label={text.language}
              size="small"
              value={language}
              style={{ width: 128 }}
              onChange={(value) => setLanguage(value as AdminLanguage)}
              options={(Object.keys(languageLabels) as AdminLanguage[]).map((value) => ({
                value,
                label: languageLabels[value],
              }))}
            />
            <Button icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/login'); }}>
              {text.logout}
            </Button>
          </div>
        </Header>
        <Content className="content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
