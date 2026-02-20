import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Fix leaflet default icon
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

const WS_URL = process.env.REACT_APP_WS_URL || `wss://${window.location.hostname}`;

function FlyToUser({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 13, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

export default function App() {
  const [myId, setMyId] = useState(null);
  const [myPos, setMyPos] = useState(null);
  const [users, setUsers] = useState({}); // { id: { lat, lng, connectedAt } }
  const [status, setStatus] = useState('connecting');
  const [didFly, setDidFly] = useState(false);
  const wsRef = useRef(null);
  const watchRef = useRef(null);

  const sendLocation = useCallback((lat, lng) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'UPDATE_LOCATION', lat, lng }));
    }
  }, []);

  useEffect(() => {
    // Connect WebSocket
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('error');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === 'INIT') {
        setMyId(msg.userId);
        const initial = {};
        msg.users.forEach(u => { initial[u.id] = { lat: u.lat, lng: u.lng, connectedAt: u.connectedAt }; });
        setUsers(initial);
      }

      if (msg.type === 'USER_UPDATED') {
        const { id, lat, lng, connectedAt } = msg.user;
        setUsers(prev => ({ ...prev, [id]: { lat, lng, connectedAt } }));
      }

      if (msg.type === 'USER_LEFT') {
        setUsers(prev => {
          const next = { ...prev };
          delete next[msg.userId];
          return next;
        });
      }
    };

    // Start geolocation
    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          setMyPos([lat, lng]);
          sendLocation(lat, lng);
        },
        (err) => console.error('Geo error:', err),
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    return () => {
      ws.close();
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [sendLocation]);

  const totalOnline = Object.keys(users).length + (myId ? 1 : 0);
  const defaultCenter = myPos || [38.7169, -9.1399]; // Lisbon fallback

  const formatCoord = (val) => val != null ? val.toFixed(5) : '—';

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">◉ LIVE MAP</div>
          <div className={`status-badge ${status}`}>
            <span className="dot" />
            {status === 'connected' ? 'connected' : status === 'disconnected' ? 'disconnected' : status}
          </div>
        </div>
        <div className="header-right">
          <div className="online-count">
            <span className="count-num">{totalOnline}</span>
            <span className="count-label">online</span>
          </div>
        </div>
      </header>

      {/* Map */}
      <div className="map-wrap">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          className="leaflet-map"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {myPos && (
            <Marker position={myPos} icon={ME_ICON}>
              <Popup className="custom-popup">
                <strong>YOU</strong><br />
                {myPos[0].toFixed(5)}, {myPos[1].toFixed(5)}
              </Popup>
            </Marker>
          )}
          {Object.entries(users).map(([id, u]) =>
            u.lat != null && u.lng != null ? (
              <Marker key={id} position={[u.lat, u.lng]} icon={OTHER_ICON}>
                <Popup className="custom-popup">
                  <strong>{id.slice(0, 8)}…</strong><br />
                  {u.lat.toFixed(5)}, {u.lng.toFixed(5)}
                </Popup>
              </Marker>
            ) : null
          )}
          {myPos && !didFly && <FlyToUser position={myPos} />}
          {myPos && !didFly && <SetDidFly setDidFly={setDidFly} />}
        </MapContainer>
      </div>

      {/* Sidebar panel */}
      <aside className="panel">
        <div className="panel-section">
          <div className="panel-title">YOUR LOCATION</div>
          {myPos ? (
            <div className="coord-block me">
              <div className="coord-row"><span className="coord-label">LAT</span><span className="coord-val">{formatCoord(myPos[0])}</span></div>
              <div className="coord-row"><span className="coord-label">LNG</span><span className="coord-val">{formatCoord(myPos[1])}</span></div>
            </div>
          ) : (
            <div className="coord-block empty">Waiting for GPS…</div>
          )}
        </div>

        <div className="panel-section">
          <div className="panel-title">OTHER USERS ({Object.keys(users).length})</div>
          <div className="users-list">
            {Object.keys(users).length === 0 && (
              <div className="no-users">No other users online</div>
            )}
            {Object.entries(users).map(([id, u]) => (
              <div key={id} className="user-item">
                <div className="user-id">{id.slice(0, 8)}…</div>
                <div className="coord-row small"><span className="coord-label">LAT</span><span className="coord-val">{formatCoord(u.lat)}</span></div>
                <div className="coord-row small"><span className="coord-label">LNG</span><span className="coord-val">{formatCoord(u.lng)}</span></div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SetDidFly({ setDidFly }) {
  useEffect(() => { setDidFly(true); }, [setDidFly]);
  return null;
}
