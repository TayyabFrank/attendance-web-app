import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

const DepartmentDeleteModal = ({ department, departments, onClose, onConfirm, fetchWithAuth }) => {
  const [employeesInDept, setEmployeesInDept] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transferTo, setTransferTo] = useState('');
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
    if (employeesInDept > 0 && !transferTo) {
      alert('Please select a department to transfer existing employees to.');
      return;
    }
    
    setIsDeleting(true);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/departments/${encodeURIComponent(department.name)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferTo })
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
            <div style={{ marginTop: '15px', padding: '15px', backgroundColor: 'rgba(251,191,36,0.15)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.3)', }}>
              <p style={{ color: 'var(--accent-yellow)', margin: '0 0 10px 0' }}>
                <strong>Warning:</strong> There are {employeesInDept} employee(s) currently assigned to this department.
              </p>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--accent-yellow)', fontWeight: 'bold' }}>Transfer employees to:</label>
              <select 
                value={transferTo} 
                onChange={(e) => setTransferTo(e.target.value)}
                className="form-control" style={{ width: "100%" }}
              >
                <option value="">-- Select Department --</option>
                {departments
                  .filter(d => d.name !== department.name)
                  .map(d => (
                    <option key={d._id || d.name} value={d.name}>{d.name}</option>
                  ))
                }
              </select>
            </div>
          ) : (
             <p style={{ marginTop: '15px', color: 'var(--accent-neon)' }}>There are no employees in this department. It is safe to delete.</p>
          )}
        </div>
        
        <div className="modal-actions" style={{ padding: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={isDeleting}>Cancel</button>
          <button 
            className="btn btn-danger" 
            onClick={handleDelete} 
            disabled={isDeleting || (employeesInDept > 0 && !transferTo)}
          >
            {isDeleting ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DepartmentDeleteModal;
