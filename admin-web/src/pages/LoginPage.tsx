import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Select, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { useAdminI18n, type AdminLanguage } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const setToken = useAuthStore((state) => state.setToken);
  const { language, setLanguage, text, languageLabels } = useAdminI18n();

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      const result = await adminApi.login({
        ...values,
        deviceName: 'Admin Web',
        deviceFingerprint: `admin-web-${navigator.userAgent}`,
        platform: navigator.platform,
        appVersion: '2.2.0',
      });
      setToken(result.accessToken);
      navigate('/');
    } catch (error) {
      message.error(String(error));
    }
  };

  return (
    <div className="login-page">
      <Card
        className="login-card"
        title={text.login}
        extra={
          <Select
            aria-label={text.language}
            size="small"
            value={language}
            style={{ width: 116 }}
            onChange={(value) => setLanguage(value as AdminLanguage)}
            options={(Object.keys(languageLabels) as AdminLanguage[]).map((value) => ({
              value,
              label: languageLabels[value],
            }))}
          />
        }
      >
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label={text.email} rules={[{ required: true }, { type: 'email' }]}>
            <Input prefix={<MailOutlined />} placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="password" label={text.password} rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder={text.passwordPlaceholder} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>{text.login}</Button>
        </Form>
      </Card>
    </div>
  );
}
