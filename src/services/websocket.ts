import { w3cwebsocket as WebSocket } from 'websocket';
import { config } from '../config/env';
import { MarketData } from '../types/strategy';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private subscribers: ((data: MarketData) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private authenticated = false;
  private pendingSubscriptions: string[] = [];

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(config.alpaca.wsDataUrl);

      this.ws.onopen = () => {
        console.log('WebSocket Connected');
        this.reconnectAttempts = 0;
        this.authenticate();
      };

      this.ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data.toString());
          
          if (data[0]?.msg === 'authenticated') {
            this.authenticated = true;
            this.processPendingSubscriptions();
            return;
          }

          if (data[0]?.T === 't' || data[0]?.T === 'q') {
            const marketData: MarketData = {
              timestamp: new Date(data[0].t),
              open: parseFloat(data[0].o || data[0].ap || '0'),
              high: parseFloat(data[0].h || data[0].ap || '0'),
              low: parseFloat(data[0].l || data[0].ap || '0'),
              close: parseFloat(data[0].c || data[0].ap || '0'),
              volume: parseInt(data[0].v || '0')
            };
            this.notifySubscribers(marketData);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.handleError();
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.authenticated = false;
        this.handleDisconnect();
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.handleError();
    }
  }

  private authenticate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const authMessage = {
      action: 'auth',
      key: config.alpaca.apiKeyId,
      secret: config.alpaca.apiSecretKey
    };

    this.ws.send(JSON.stringify(authMessage));
  }

  private processPendingSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) return;

    if (this.pendingSubscriptions.length > 0) {
      const subscribeMessage = {
        action: 'subscribe',
        trades: this.pendingSubscriptions,
        quotes: this.pendingSubscriptions
      };
      
      this.ws.send(JSON.stringify(subscribeMessage));
      console.log('Subscribed to:', this.pendingSubscriptions);
      this.pendingSubscriptions = [];
    }
  }

  subscribe(symbol: string) {
    if (!this.authenticated) {
      if (!this.pendingSubscriptions.includes(symbol)) {
        this.pendingSubscriptions.push(symbol);
      }
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        action: 'subscribe',
        trades: [symbol],
        quotes: [symbol]
      };
      this.ws.send(JSON.stringify(subscribeMessage));
    } else {
      if (!this.pendingSubscriptions.includes(symbol)) {
        this.pendingSubscriptions.push(symbol);
      }
    }
  }

  private handleError() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handleDisconnect();
  }

  private handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private notifySubscribers(data: MarketData) {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in subscriber callback:', error);
      }
    });
  }

  addSubscriber(callback: (data: MarketData) => void) {
    this.subscribers.push(callback);
  }

  removeSubscriber(callback: (data: MarketData) => void) {
    this.subscribers = this.subscribers.filter(sub => sub !== callback);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribers = [];
    this.authenticated = false;
    this.pendingSubscriptions = [];
  }
}