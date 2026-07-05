import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { useAuthStore } from '@/store/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const setToken = useAuthStore((state) => state.setToken);

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      const result = await adminApi.login({
        ...values,
        deviceName: 'Admin Web',
        deviceFingerprint: `admin-web-${navigator.userAgent}`,
        platform: navigator.platform,
        appVersion: '2.0.0',
      });
      setToken(result.accessToken);
      navigate('/');
    } catch (error) {
      message.error(String(error));
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card" title="管理员登录">
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
            <Input prefix={<MailOutlined />} placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>登录</Button>
        </Form>
      </Card>
    </div>
  );
}
