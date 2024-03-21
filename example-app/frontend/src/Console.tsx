import { useRef, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Guacamole from 'guacamole-common-js';
import { guacamoleURL } from './Conf';

const Console = () => {
    const [searchParams] = useSearchParams();
    const consoleRef = useRef(null);


    useEffect(() => {
        const displayDiv = consoleRef.current;
        if (!displayDiv || !searchParams.get("GUAC_DATA_SOURCE") || !searchParams.get("GUAC_ID") || !searchParams.get("GUAC_TYPE") || !searchParams.get("token")) {
            return;
        }

        const client = new Guacamole.Client(new Guacamole.WebSocketTunnel(guacamoleURL));
        (displayDiv as HTMLElement).appendChild(client.getDisplay().getElement());
        console.log("guacamole client connected!");

        const params = `GUAC_DATA_SOURCE=${searchParams.get("GUAC_DATA_SOURCE")}&GUAC_ID=${searchParams.get("GUAC_ID")}&GUAC_TYPE=${searchParams.get("GUAC_TYPE")}&token=${searchParams.get("token")}`;
        client.connect(params);

        return () => {
            client.disconnect();
            console.log("guacamole client disconnected!");
        };
    }, [consoleRef, searchParams]);

    return (
        <div ref={consoleRef}></div>
    );
};

export default Console;