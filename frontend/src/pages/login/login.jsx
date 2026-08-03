import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import './login.css';

const Login = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ employeeId: '', password: '' });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);
    const [showWelcomeSplash, setShowWelcomeSplash] = useState(false);
    const [loggedInEmployee, setLoggedInEmployee] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.employeeId.trim()) newErrors.employeeId = 'Employee ID is required';
        if (!formData.password) newErrors.password = 'Password is required';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        setSubmitStatus(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: formData.employeeId,
                    password: formData.password
                })
            });

            const data = await response.json();
            if (!response.ok) {
                setErrors({ form: data.error || 'Login failed' });
                setSubmitStatus('error');
            } else {
                const employeeData = { ...data.employee, password: formData.password };
                localStorage.setItem('employee', JSON.stringify(employeeData));
                setSubmitStatus('success');
                setLoggedInEmployee(employeeData);
                setShowWelcomeSplash(true);
                setTimeout(() => {
                    navigate('/history');
                }, 7000);
            }
        } catch (err) {
            console.error(err);
            setErrors({ form: 'Network error or server offline' });
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-container" style={{ position: 'relative' }}>
            <div className="top-nav-bar">
                <button onClick={() => navigate('/')} className="beautiful-back-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Back
                </button>
            </div>
            {showWelcomeSplash && loggedInEmployee && (
                <div className="welcome-splash-overlay">
                    <div className="welcome-splash-content">
                        <div className="welcome-avatar-wrapper">
                            {loggedInEmployee.facePhoto && !loggedInEmployee.facePhoto.includes('<svg>') ? (
                                <img 
                                    src={loggedInEmployee.facePhoto} 
                                    alt={loggedInEmployee.name} 
                                    className="welcome-avatar" 
                                />
                            ) : (
                                <div className="welcome-avatar-placeholder">
                                    {loggedInEmployee.name.charAt(0)}
                                </div>
                            )}
                            <div className="welcome-checkmark-badge">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="4">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                        </div>
                        <h1 className="welcome-name">Welcome, {loggedInEmployee.name}!</h1>
                        <p className="welcome-role">{loggedInEmployee.employeeId} • {loggedInEmployee.role.toUpperCase()}</p>
                        <div className="welcome-loading-bar-container">
                            <div className="welcome-loading-bar"></div>
                        </div>
                        <p className="welcome-redirect-text">Entering Employee Portal...</p>
                    </div>
                </div>
            )}
            <div className="login-card">
                <div className="login-header">
                    <div className="header-icon-circle">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1062b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                    <h2>Welcome Back</h2>
                    <p>Sign in to access the employee portal</p>
                </div>

                {submitStatus === 'success' && (
                    <div className="alert alert-success">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>Login successful! Redirecting...</span>
                    </div>
                )}

                {submitStatus === 'error' && (
                    <div className="alert alert-error" style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>{errors.form || 'Invalid credentials'}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="employeeId">Employee ID</label>
                        <input
                            type="text"
                            id="employeeId"
                            name="employeeId"
                            placeholder="e.g. EMP-1042"
                            value={formData.employeeId}
                            onChange={handleChange}
                            disabled={isSubmitting}
                            className={errors.employeeId ? 'input-error' : ''}
                        />
                        {errors.employeeId && <span className="error-text">{errors.employeeId}</span>}
                    </div>

                    <div className="form-group">
                        <div className="label-row">
                            <label htmlFor="password">Password</label>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                name="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                                disabled={isSubmitting}
                                className={errors.password ? 'input-error' : ''}
                                style={{ paddingRight: '40px' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0'
                                }}
                            >
                                {showPassword ? (
                                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        {errors.password && <span className="error-text">{errors.password}</span>}
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <span className="spinner"></span>
                        ) : (
                            <>
                                Login
                                <svg className="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                    <polyline points="12 5 19 12 12 19" />
                                </svg>
                            </>
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    Don't have an account? Please contact your Administrator to register.
                </div>
            </div>
        </div>
    );
};

export default Login;
