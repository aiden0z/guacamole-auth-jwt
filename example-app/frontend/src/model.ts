class GuacamoleWebsocketParams {
    guac_id: string
    guac_type: string
    token: string

    constructor(guac_id: string, guac_type: string, token: string) {
        this.guac_id = guac_id;
        this.guac_type = guac_type;
        this.token = token;
    }

    public valid(): boolean {
        if (!this.guac_id || !this.guac_type || !this.token) {
            return false
        }
        return true
    }
}


export default GuacamoleWebsocketParams;