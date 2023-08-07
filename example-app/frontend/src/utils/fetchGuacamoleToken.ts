import axios, {AxiosResponse} from "axios"

export enum JWTLocation {
  Header,
  SearchParams,
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
        } else if (jwtLocation === JWTLocation.SearchParams) {
            resp = await axios.post<GuacamoleToken>(guacamoleTokenAPI, null, {
                params: data,
            });
        } else {
            resp = await axios.post<GuacamoleToken>(guacamoleTokenAPI, data);
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
