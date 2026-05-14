import { useState, useEffect } from 'react';
import { derivWS } from '../lib/derivWS';

export function useConnection(token: string) {
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    derivWS.onConnectionChange = (conn, auth) => {
      setConnected(conn);
      setAuthenticated(auth);
    };
    derivWS.setToken(token);
    derivWS.connect();

    return () => {
      derivWS.onConnectionChange = null;
    };
  }, [token]);

  return { connected, authenticated };
}
