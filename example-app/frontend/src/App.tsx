import React from 'react';
import {Row, Col, Layout, Radio, InputNumber} from 'antd';
import { Button, Form, Input } from 'antd';
import { Content, Footer, Header } from 'antd/es/layout/layout';
import Title from 'antd/es/typography/Title';
import Paragraph from 'antd/es/typography/Paragraph';
import {createSearchParams, useNavigate } from 'react-router-dom';

import GuacamoleWebsocketParams from './model';
import { guacamoleJWTSecret, guacamoleTokenAPI } from './conf';
import { JWTLocation, fetchGuacamoleToken } from './utils/fetchGuacamoleToken';
import { SignJWT } from 'jose';

const defaultJWTSecret = "secret";

const layoutStyle: React.CSSProperties = {
  backgroundColor: '#fff',
};

type GuacamoleJWTParams = {
  protocol?: string;
  hostname?: string;
  port: number,
  username?: string;
  password?: string;
  jwt_location: JWTLocation;
};

const defaultValues = {
  guacd_host: "guacd:4822",
  hostname: "ubuntu-xfce",
  protocol: "VNC",
  port: 5901,
  password: "headless",
  jwt_location: JWTLocation.SearchParams,
}

const App: React.FC = () => {
  const navigate = useNavigate();

  const onFinish = async (values: GuacamoleJWTParams) => {

    console.log('found guacamole connection params:', values);

    const guacId = "guacamole-auth-jwt";

    let payload = {
      "GUAC_ID": guacId,
      "guac.protocol": values.protocol,
      "guac.hostname": values.hostname,
      "guac.port": values.port.toString(),
      "guac.password": values.password,
    };
    
    const secret = new TextEncoder().encode(guacamoleJWTSecret)
    const alg = 'HS256';
    const jwt = await new SignJWT(payload).setProtectedHeader({alg}).sign(secret);
    console.log('create guacamole json web token with algorithm:', alg, 'and secret:', guacamoleJWTSecret);
    console.log('create json web token:', jwt);

    // fetch guacamole token from guacamole-auth-jwt
    const  guacamoleToken = await fetchGuacamoleToken(guacamoleTokenAPI, {token: jwt}, values.jwt_location)
    // TODO setup nginx proxy to fix the CORS error
    //                          --> antd dev server localhost:3000
    //  browser --> nginx:8080 |
    //                          --> guacamole java application which loaded guacamole-jwt-auth plugin listen at 8080
    //

    navigate({
      pathname: "/console",
      search: createSearchParams({guac_id: guacId, guac_type: "c", token: guacamoleToken.authToken}).toString()
    });
  };

  return  (
  <Layout>
    <Header style={layoutStyle}>
      <Row justify="space-around" align="middle">
        <Col span={6}></Col>
        <Col span={12}>
          <Title level={5} style={{textAlign: "center"}} className="responsive-title">Guacamole JWT Authentication Example APP</Title>
        </Col>
        <Col span={6}></Col>
      </Row>
    </Header>
    <Content style={layoutStyle}>
      <Row justify="center" align="middle">
        <Col span={6}></Col>
        <Col span={12}>
          <Paragraph style={{width: "100%", textAlign: "center", marginBottom: 40}}>
            Default JWT Algorithm: HS256, secret: secret
          </Paragraph>
          <Form
            name="basic"
            labelCol={{ span: 8 }}
            wrapperCol={{ span: 16 }}
            style={{ maxWidth: 600, margin: "0 auto"}}
            initialValues={defaultValues}
            onFinish={onFinish}
            autoComplete="off"
          >
            <Form.Item<GuacamoleJWTParams>
              label="Protocol"
              name="protocol"
              rules={[{required: true}]}
            >
              <Input
                disabled
              />
            </Form.Item>

            <Form.Item<GuacamoleJWTParams>
              label="Hostname"
              name="hostname"
              rules={[{ required: true, message: 'Please input the host to connect!' }]}
            >
              <Input/>
            </Form.Item>

            <Form.Item<GuacamoleJWTParams>
              label="Port"
              name="port"
              rules={[{ required: true, message: 'Please input the host to connect!' }]}
            >
              <InputNumber min={1} max={65535}/>
            </Form.Item>

            <Form.Item<GuacamoleJWTParams>
              label="Username"
              name="username"
              rules={[{ required: false, message: 'Please input the username!' }]}
            >
              <Input/>
            </Form.Item>

            <Form.Item<GuacamoleJWTParams>
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Please input the password!' }]}
            >
              <Input.Password />
            </Form.Item>

            <Form.Item<GuacamoleJWTParams>
              label="JWT Location"
              name="jwt_location"
              rules={[{ required: true}]}
            >
              <Radio.Group>
                <Radio value={JWTLocation.Header}>Header</Radio>
                <Radio value={JWTLocation.SearchParams}>Params</Radio>
                <Radio value={JWTLocation.Body}>Body</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
              <Button type="primary" htmlType="submit">
                Connect
              </Button>
            </Form.Item>

          </Form>
        </Col>
        <Col span={6}></Col>
      </Row>
    </Content>
    <Footer style={layoutStyle}>
    </Footer>
    
</Layout>
  )
};

export default App;