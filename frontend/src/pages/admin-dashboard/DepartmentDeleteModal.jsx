import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

const DepartmentDeleteModal = ({ department, departments, onClose, onConfirm, fetchWithAuth }) => {
  const [employeesInDept, setEmployeesInDept] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchDeptEmployees = async () => {
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/api/employees?limit=1000&status=active`, { credentials: 'include' });
        const data = await response.json();
        const count = data.employees ? data.employees.filter(emp => emp.department === department.name).length : 0;
        setEmployeesInDept(count);
      } catch (err) {
        console.error('Failed to fetch employees for dept', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDeptEmployees();
  }, [department, fetchWithAuth]);

  const handleDelete = async () => {
    if (employeesInDept > 0) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/departments/${encodeURIComponent(department.name)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        onConfirm();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error}`);
      }
    } catch (err) {
      console.error('Error deleting department', err);
      alert('Failed to delete department.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content admin-modal">
        <h3 className="modal-title">Delete Department</h3>
        <button className="modal-close-btn" onClick={onClose}>×</button>
        
        <div className="modal-body" style={{ padding: '20px' }}>
          <p>Are you sure you want to delete the department <strong>{department.name}</strong>?</p>
          
          {loading ? (
            <p>Checking active employees...</p>
          ) : employeesInDept > 0 ? (
            <div style={{ marginTop: '15px', padding: '20px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca', textAlign: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ marginBottom: '8px' }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <p style={{ color: '#991b1b', margin: '0 0 8px 0', fontSize: '15px', fontWeight: '600' }}>
                Cannot Delete Department
              </p>
              <p style={{ color: '#b91c1c', margin: 0, fontSize: '13px', lineHeight: '1.5' }}>
                There are <strong>{employeesInDept} employees</strong> in it.<br/>
                First assign them to another department. When it is empty, then it will be deleted.
              </p>
            </div>
          ) : (
             <div style={{ marginTop: '15px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                <p style={{ color: '#166534', margin: 0, fontSize: '14px', fontWeight: '500' }}>
                  There are no employees in this department.<br/>It is safe to delete.
                </p>
             </div>
          )}
        </div>
        
        <div className="modal-actions" style={{ padding: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0' }}>
          <button className="beauty-cancel-btn" onClick={onClose} disabled={isDeleting}>Cancel</button>
          {employeesInDept === 0 && !loading && (
            <button 
              className="beauty-primary-btn" 
              style={{ backgroundColor: '#dc2626', boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.2)' }}
              onClick={handleDelete} 
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepartmentDeleteModal;
