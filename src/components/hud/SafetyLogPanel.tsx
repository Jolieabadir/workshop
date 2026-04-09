// ============================================================
// Workshop — Safety Log Panel Component
// Top-left panel showing Builder action audit log
// ============================================================

'use client';

import { useState } from 'react';
import { useSafetyStore } from '@/store/safety-store';
import { getActionSummary, getActionIcon, formatLogTime } from '@/agents/safety/logger';

export function SafetyLogPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const safetyLog = useSafetyStore((s) => s.log);

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'rgba(10,10,26,0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: isOpen ? '12px 12px 0 0' : '12px',
          padding: '8px 14px',
          color: '#ef4444',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: isOpen ? '280px' : 'auto',
        }}
      >
        <span style={{ fontSize: '14px' }}>🛡</span>
        Safety Log
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
          {isOpen ? '▲' : '▼'}
        </span>
        {safetyLog.length > 0 && !isOpen && (
          <span
            style={{
              background: '#ef4444',
              color: '#fff',
              borderRadius: '10px',
              padding: '2px 6px',
              fontSize: '10px',
              marginLeft: '4px',
            }}
          >
            {safetyLog.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            background: 'rgba(10,10,26,0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            width: '280px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {safetyLog.length === 0 ? (
            <div
              style={{
                padding: '16px',
                color: '#6b7280',
                fontSize: '11px',
                textAlign: 'center',
              }}
            >
              No actions logged yet
            </div>
          ) : (
            <div style={{ padding: '8px' }}>
              {safetyLog.slice(0, 15).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: '8px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px' }}>{getActionIcon(entry.action)}</span>
                    <span style={{ color: '#e5e7eb', fontWeight: 500 }}>
                      {getActionSummary(entry.action)}
                    </span>
                    <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: '10px' }}>
                      {formatLogTime(entry.timestamp)}
                    </span>
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '10px', paddingLeft: '18px' }}>
                    &ldquo;{entry.utterance.slice(0, 40)}{entry.utterance.length > 40 ? '...' : ''}&rdquo;
                  </div>
                  {(entry.canvasDiff.nodesAdded.length > 0 ||
                    entry.canvasDiff.nodesRemoved.length > 0 ||
                    entry.canvasDiff.connectionsAdded.length > 0) && (
                    <div style={{ color: '#6b7280', fontSize: '9px', paddingLeft: '18px', marginTop: '2px' }}>
                      {entry.canvasDiff.nodesAdded.length > 0 && (
                        <span style={{ color: '#22c55e' }}>+{entry.canvasDiff.nodesAdded.length} node </span>
                      )}
                      {entry.canvasDiff.nodesRemoved.length > 0 && (
                        <span style={{ color: '#ef4444' }}>-{entry.canvasDiff.nodesRemoved.length} node </span>
                      )}
                      {entry.canvasDiff.connectionsAdded.length > 0 && (
                        <span style={{ color: '#6366f1' }}>+{entry.canvasDiff.connectionsAdded.length} conn</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
