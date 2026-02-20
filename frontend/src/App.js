import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ME_ICON = L.divIcon({
  className: '',
  html: `<div class="marker-me"><span></span></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const OTHER_ICON = L.divIcon({
  className: '',
  html: `<div class="marker-other"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const WS_URL = 'wss://map-app-production-995e.up.railway.app';
const RECONNECT_DELAY = 3000;

function timeAgo(isoDate) {
  if (!isoDate) return '—';
  const diff = Math.floor((Date.now() - new Date(isoDate)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function FlyToUser({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 13, { duration: 1.5 });
  }, [position, map]);
  return null;
}

function SetDidFly({ setDidFly }) {
  useEffect(() => { setDidFly(true); }, [setDidFly]);
  return null;
}

export default function App() {
  const [myId, setMyId] = useState(null);
  const [myPos, setMyPos] = useState(null);
  const [myAccuracy, setMyAccuracy] = useState(null);
  const [myUpdated, setMyUpdated] = useState(null);
  const [users, setUsers] = useState({});
  const [newUsers, setNewUsers] = useState(new Set());
  const [status, setStatus] = useState('connecting');
  const [geoError, setGeoError] = useState(null);
  const [didFly, setDidFly] = useState(false);
  const [now, setNow] = useState(Date.now());
  const wsRef = useRef(null);
  const watchRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sendLocation = useCallback((lat, lng) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'UPDATE_LOCATION', lat, lng }));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };

    ws.onclose = () => {
      setStatus('disconnected');
      reconnectRef.current = setTimeout(() => connect(), RECONNECT_DELAY);
    };

    ws.onerror = () => setStatus('error');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === 'INIT') {
        setMyId(msg.userId);
        const initial = {};
        msg.users.forEach(u => {
          initial[u.id] = { lat: u.lat, lng: u.lng, connectedAt: u.connectedAt, updatedAt: u.connectedAt };
        });
        setUsers(initial);
      }

      if (msg.type === 'USER_UPDATED') {
        const { id, lat, lng, connectedAt } = msg.user;
        setUsers(prev => {
          const isNew = !prev[id];
          if (isNew) {
            setNewUsers(n => {
              const s = new Set(n); s.add(id);
              setTimeout(() => setNewUsers(nn => { const ss = new Set(nn); ss.delete(id); return ss; }), 2000);
              return s;
            });
          }
          return { ...prev, [id]: { lat, lng, connectedAt, updatedAt: new Date().toISOString() } };
        });
      }

      if (msg.type === 'USER_LEFT') {
        setUsers(prev => { const next = { ...prev }; delete next[msg.userId]; return next; });
      }
    };
  }, []);

  useEffect(() => {
    connect();

    if (!navigator.geolocation) {
      setGeoError('O teu browser não suporta geolocalização.');
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setMyPos([lat, lng]);
        setMyAccuracy(Math.round(accuracy));
        setMyUpdated(new Date().toISOString());
        setGeoError(null);
        sendLocation(lat, lng);
      },
      (err) => {
        if (err.code === 1) setGeoError('Permissão de localização negada. Ativa o GPS no browser.');
        else if (err.code === 2) setGeoError('Localização indisponível. Verifica o GPS.');
        else setGeoError('Erro ao obter localização.');
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect, sendLocation]);

  const totalOnline = Object.keys(users).length + (myId ? 1 : 0);
  const defaultCenter = myPos || [38.7169, -9.1399];
  const formatCoord = (val) => val != null ? val.toFixed(5) : '—';

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">◉ LIVE MAP</div>
          <div className={`status-badge ${status}`}>
            <span className="dot" />
            {status === 'connected' ? 'connected' : status === 'disconnected' ? 'reconnecting…' : status}
          </div>
        </div>
        <div className="header-right">
          <div className="online-count">
            <span className="count-num">{totalOnline}</span>
            <span className="count-label">online</span>
          </div>
        </div>
      </header>

      {geoError && <div className="geo-error">⚠ {geoError}</div>}

      <div className="map-wrap">
        <MapContainer center={defaultCenter} zoom={13} className="leaflet-map" zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {myPos && (
            <Marker position={myPos} icon={ME_ICON}>
              <Popup className="custom-popup">
                <strong>YOU</strong><br />
                {myPos[0].toFixed(5)}, {myPos[1].toFixed(5)}<br />
                {myAccuracy && <span style={{color:'#888',fontSize:'0.7em'}}>±{myAccuracy}m</span>}
              </Popup>
            </Marker>
          )}
          {Object.entries(users).map(([id, u]) =>
            u.lat != null && u.lng != null ? (
              <Marker key={id} position={[u.lat, u.lng]} icon={OTHER_ICON}>
                <Popup className="custom-popup">
                  <strong>{id.slice(0, 8)}…</strong><br />
                  {u.lat.toFixed(5)}, {u.lng.toFixed(5)}<br />
                  <span style={{color:'#888',fontSize:'0.7em'}}>online {timeAgo(u.connectedAt)}</span>
                </Popup>
              </Marker>
            ) : null
          )}
          {myPos && !didFly && <FlyToUser position={myPos} />}
          {myPos && !didFly && <SetDidFly setDidFly={setDidFly} />}
        </MapContainer>
      </div>

      <aside className="panel">
        <div className="panel-section">
          <div className="panel-title">YOUR LOCATION</div>
          {myPos ? (
            <div className="coord-block me">
              <div className="coord-row"><span className="coord-label">LAT</span><span className="coord-val">{formatCoord(myPos[0])}</span></div>
              <div className="coord-row"><span className="coord-label">LNG</span><span className="coord-val">{formatCoord(myPos[1])}</span></div>
              {myAccuracy && <div className="coord-row"><span className="coord-label">ACC</span><span className="coord-val">±{myAccuracy}m</span></div>}
              {myUpdated && <div className="updated-at">updated {timeAgo(myUpdated)}</div>}
            </div>
          ) : (
            <div className="coord-block empty">{geoError ? '⚠ GPS negado' : 'Waiting for GPS…'}</div>
          )}
        </div>

        <div className="panel-section">
          <div className="panel-title">OTHER USERS ({Object.keys(users).length})</div>
          <div className="users-list">
            {Object.keys(users).length === 0 && <div className="no-users">No other users online</div>}
            {Object.entries(users).map(([id, u]) => (
              <div key={id} className={`user-item ${newUsers.has(id) ? 'user-new' : ''}`}>
                <div className="user-id">{id.slice(0, 8)}…</div>
                <div className="coord-row small"><span className="coord-label">LAT</span><span className="coord-val">{formatCoord(u.lat)}</span></div>
                <div className="coord-row small"><span className="coord-label">LNG</span><span className="coord-val">{formatCoord(u.lng)}</span></div>
                <div className="updated-at">online {timeAgo(u.connectedAt)}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}