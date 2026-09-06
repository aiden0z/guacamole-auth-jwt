import React, { useState } from 'react';
import { Button, Form, Input, Radio, Typography, Alert, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { openOfficial, saveSession } from './session';

const App: React.FC = () => {
  const navigate = useNavigate();
  const official = new URLSearchParams(window.location.search).get('launch') === 'official';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async (values: { accessToken: string; jwtLocation: string }) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/example-api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${values.accessToken}` },
        body: JSON.stringify({ connectionId: 'demo', jwtLocation: values.jwtLocation, shareable: !official }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connection authorization failed');
      if (official) openOfficial(result);
      else { saveSession(result); navigate('/console'); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 560, margin: '64px auto', padding: 24 }}>
      <Typography.Title level={2}>Guacamole JWT example</Typography.Title>
      <Typography.Paragraph>
        Connect to the configured demo desktop. The server authorizes the connection;
        signing keys and desktop credentials stay on the server.
      </Typography.Paragraph>
      <Space style={{ marginBottom: 16 }} wrap>
        <a href="/example-app/?launch=embedded" target="_blank" rel="noopener noreferrer">New independent Console</a>
        <a href="/example-app/?launch=official" target="_blank" rel="noopener noreferrer">New independent official UI</a>
      </Space>
      <Typography.Paragraph>Each new window requires its own authorization. Browser Duplicate Tab is not an independent login.</Typography.Paragraph>
      <Form layout="vertical" initialValues={{ jwtLocation: 'header' }} onFinish={connect}>
        <Form.Item label="Demo access token" name="accessToken" rules={[{ required: true }]}>
          <Input.Password autoComplete="off" />
        </Form.Item>
        <Form.Item label="Server-to-Guacamole JWT transport" name="jwtLocation">
          <Radio.Group><Radio value="header">Header</Radio><Radio value="body">Form body</Radio></Radio.Group>
        </Form.Item>
        <Space direction="vertical" style={{ width: '100%' }}>
          {error && <Alert type="error" message={error} role="alert" />}
          <Button type="primary" htmlType="submit" loading={busy}>{official ? 'Connect in official Guacamole UI' : 'Connect to demo desktop'}</Button>
        </Space>
      </Form>
    </main>
  );
};
export default App;
