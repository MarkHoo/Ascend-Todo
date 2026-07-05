import { DashboardOutlined, DatabaseOutlined, LaptopOutlined, LogoutOutlined, TeamOutlined, ToolOutlined } from '@ant-design/icons';
import { Layout, Menu, Button } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

const { Header, Sider, Content } = Layout;

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);

  return (
    <Layout className="admin-shell">
      <Sider width={232} theme="light">
        <div className="brand">光阶 Todo 管理后台</div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={(item) => navigate(item.key)}
          items={[
            { key: '/', icon: <DashboardOutlined />, label: '运营概览' },
            { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
            { key: '/devices', icon: <LaptopOutlined />, label: '设备管理' },
            { key: '/sync-logs', icon: <DatabaseOutlined />, label: '同步日志' },
            { key: '/system-health', icon: <ToolOutlined />, label: '系统健康' },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="topbar">
          <span>Ascend Todo Operations</span>
          <Button icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/login'); }}>退出</Button>
        </Header>
        <Content className="content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

