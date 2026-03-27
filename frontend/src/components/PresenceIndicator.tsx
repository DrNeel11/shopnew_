import { PresenceUser } from '../types';

interface Props {
  users: PresenceUser[];
  currentClientId: string;
}

export function PresenceIndicator({ users, currentClientId }: Props) {
  const others = users.filter((u) => u.clientId !== currentClientId);

  if (others.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '13px', color: '#6B7280', marginRight: '4px' }}>
        Online:
      </span>
      {others.slice(0, 5).map((user) => (
        <div
          key={user.clientId}
          title={`${user.name}${user.editingTaskId ? ' (editing)' : ''}`}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: user.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'default',
            border: user.editingTaskId ? '2px solid #1D4ED8' : '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            position: 'relative',
          }}
        >
          {user.name.charAt(0).toUpperCase()}
          {user.editingTaskId && (
            <span
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#1D4ED8',
                border: '1px solid white',
              }}
            />
          )}
        </div>
      ))}
      {others.length > 5 && (
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#9CA3AF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '11px',
          }}
        >
          +{others.length - 5}
        </div>
      )}
    </div>
  );
}
