export class RealtimeClient {
    private eventSource: EventSource | null = null;
    private listeners: Map<string, Function[]> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;

    constructor(private url: string = "/api/realtime/events") { }

    connect() {
        if (this.eventSource) return;

        this.eventSource = new EventSource(this.url);

        this.eventSource.onopen = () => {
            console.log("Realtime connection established");
            this.reconnectAttempts = 0;
            this.emit("connected", {});
        };

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit(data.type, data.data);
                this.emit("message", data);
            } catch (e) {
                console.error("Failed to parse realtime message", e);
            }
        };

        this.eventSource.onerror = (err) => {
            console.error("Realtime connection error", err);
            this.eventSource?.close();
            this.eventSource = null;
            this.reconnect();
        };
    }

    private reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("Max reconnect attempts reached");
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        setTimeout(() => this.connect(), delay);
    }

    on(event: string, callback: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
        return () => this.off(event, callback);
    }

    off(event: string, callback: Function) {
        if (!this.listeners.has(event)) return;
        this.listeners.set(
            event,
            this.listeners.get(event)!.filter((cb) => cb !== callback)
        );
    }

    private emit(event: string, data: any) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach((cb) => cb(data));
    }
}

export const realtime = new RealtimeClient();
