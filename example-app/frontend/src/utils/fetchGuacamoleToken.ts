import axios, {AxiosResponse} from "axios"

export enum JWTLocation {
  Header,
  Body
}

export interface GuacamoleTokenRequest {
    token: string,
}

export interface GuacamoleToken {
    authToken: string,
    username: string,
    dataSource: string,
    availableDataSources: [string]

}

export async function fetchGuacamoleToken(guacamoleTokenAPI: string, data: GuacamoleTokenRequest, jwtLocation: JWTLocation): Promise<GuacamoleToken> {
    try {
        var resp: AxiosResponse<GuacamoleToken>;
        if (jwtLocation === JWTLocation.Header) {
            resp = await axios.post<GuacamoleToken>(guacamoleTokenAPI, null, {
                headers: {
                    "GUACAMOLE-AUTH-JWT": data.token,
                }
            });
        } else {
            const params = new URLSearchParams();
            params.append("token", data.token)
            resp = await axios.post<GuacamoleToken>(guacamoleTokenAPI, params);
        }

        if (resp.status !== 200) {
            throw new Error("Unexpected response code: ${resp.status_code}");
        }
        return resp.data;
    } catch(error) {
        console.error("Failed to fetch guacamole token: ", error);
        throw error;
    }
}
