import React, { useState, useEffect, useRef } from 'react';
import './admin-dashboard.css';

const HolidayModal = ({ isOpen, onClose, onSave, onDelete, initialName, initialAction, dateStr }) => {
  const [name, setName] = useState(initialName || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (name.trim() === '') {
      alert('Holiday name cannot be empty.');
      return;
    }
    onSave(name.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px',
        width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex', flexDirection: 'column', gap: '20px'
      }}>
        <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>
            {initialAction === 'edit' ? 'Manage Holiday' : 'Add Holiday'}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            {dateStr}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#334155' }}>Holiday Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            placeholder="e.g. Independence Day"
            style={{
              padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
              fontSize: '15px', outline: 'none', transition: 'border-color 0.2s', width: '100%', boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          {initialAction === 'edit' && (
            <button
              onClick={onDelete}
              style={{
                padding: '10px 16px', borderRadius: '8px', border: 'none',
                backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '14px', fontWeight: '600',
                cursor: 'pointer', transition: 'background-color 0.2s', marginRight: 'auto'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff', color: '#475569', fontSize: '14px', fontWeight: '600',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.color = '#0f172a'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.color = '#475569'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '14px', fontWeight: '600',
              cursor: 'pointer', transition: 'background-color 0.2s', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default HolidayModal;
