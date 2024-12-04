import { useEffect, useRef, useCallback, useState } from 'react';
import { WebSocketService } from '../services/websocket';
import { MarketData } from '../types/strategy';

export function useWebSocket(symbol: string) {
  const [data, setData] = useState<MarketData[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocketService | null>(null);

  const handleData = useCallback((newData: MarketData & { error?: Error }) => {
    if ('error' in newData) {
      setError(newData.error);
      return;
    }

    setData(prevData => {
      const updatedData = [newData, ...prevData];
      return updatedData.slice(0, 1000); // Keep last 1000 data points
    });
  }, []);

  useEffect(() => {
    if (!symbol) return;

    if (!wsRef.current) {
      wsRef.current = new WebSocketService();
    }

    const ws = wsRef.current;
    ws.addSubscriber(handleData);
    ws.subscribe(symbol);

    return () => {
      ws.unsubscribe(symbol);
      ws.removeSubscriber(handleData);
    };
  }, [symbol, handleData]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, []);

  return { data, error };
}