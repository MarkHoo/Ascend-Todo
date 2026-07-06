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
        appVersion: '2.6.2',
      });
      setToken(result.accessToken);
      navigate('/');
    } catch (error) {
      message.error(String(error));
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card" title="\u7ba1\u7406\u5458\u767b\u5f55">
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="\u90ae\u7bb1" rules={[{ required: true }, { type: 'email' }]}>
            <Input prefix={<MailOutlined />} placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="password" label="\u5bc6\u7801" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="\u8bf7\u8f93\u5165\u5bc6\u7801" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>\u767b\u5f55</Button>
        </Form>
      </Card>
    </div>
  );
}
