import { Col, Layout, Row } from 'antd';
import { Content, Header } from 'antd/es/layout/layout';
import Paragraph from 'antd/es/typography/Paragraph';
import React, { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import GuacamoleWebsocketParams from './model';

const Console: React.FC<{}> = () => {

    const [searchParams] = useSearchParams();

    const consoleRef = useRef(null);
    let guacID = searchParams.get("GUAC_ID");
    let guacType= searchParams.get("guac_type");
    let guacToken = searchParams.get("token");

    let valid = guacID && guacType && guacToken;

    
    useEffect(() => {
        if (!valid) {
            return
        }
        const displayDiv = consoleRef.current;
        console.log("display div", displayDiv);
        return () => {
            console.log("disconnect");
        }
    }, []);

    if (!valid) {
      return (
        <>
        <Row style={{"height": 40}}></Row>
        <Row>
            <Col span={6}></Col>
            <Col span={12} style={{"textAlign": "center"}}>
                <Paragraph type="danger">
                    Not found enough guacamole connection params.
                </Paragraph>
            </Col>
            <Col span={6}></Col>

        </Row>
        </>
      )
    }

    return (
        <div ref={consoleRef}>
            will be connect
        </div>
    );
};

export default Console;