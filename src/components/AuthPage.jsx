import React, { useState, useEffect, useRef } from 'react';
import './AuthPage.css';
import {
  signInUser,
  signUpUser,
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
  updateUserPassword
} from '../services/authService';

export default function AuthPage({ onLoginSuccess, onContinueAsGuest }) {
  // Navigation: 'signin' | 'signup' | 'forgot'
  const [activeTab, setActiveTab] = useState('signin');
  
  // Sign In Form State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  
  // Sign Up Form State
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [signUpRole, setSignUpRole] = useState('QA Automation Engineer');
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // Forgot Password Flow State (Step 1: Request, Step 2: Verify OTP, Step 3: Set New Password, Step 4: Success)
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Status & Feedback States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);

  const otpInputsRef = useRef([]);

  // Clear feedback messages when tab changes
  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setInfoMsg(null);
  }, [activeTab]);

  // Handle countdown timer for OTP resend cooldown
  useEffect(() => {
    let timer = null;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  // Calculate password strength
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: '#ccc' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 1) return { score: 20, label: 'Weak', color: '#dc2626' };
    if (score === 2) return { score: 45, label: 'Fair', color: '#f59e0b' };
    if (score === 3 || score === 4) return { score: 75, label: 'Good', color: '#3b82f6' };
    return { score: 100, label: 'Strong', color: '#059669' };
  };

  // -------------------------------------------------------------
  // Sign In Handler
  // -------------------------------------------------------------
  const handleSignIn = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!signInEmail.trim() || !signInPassword) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    const result = await signInUser({
      email: signInEmail,
      password: signInPassword
    });
    setLoading(false);

    if (!result.success) {
      setErrorMsg(result.error);
      return;
    }

    setSuccessMsg('Successfully signed in! Loading your QA workspace...');
    if (onLoginSuccess) {
      onLoginSuccess(result.session, result.user);
    }
  };

  // -------------------------------------------------------------
  // Sign Up Handler
  // -------------------------------------------------------------
  const handleSignUp = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!signUpName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!signUpEmail.trim()) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (signUpPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters in length.');
      return;
    }
    if (signUpPassword !== signUpConfirmPassword) {
      setErrorMsg('Passwords do not match. Please verify and re-enter.');
      return;
    }

    setLoading(true);
    const result = await signUpUser({
      email: signUpEmail,
      password: signUpPassword,
      fullName: signUpName,
      role: signUpRole
    });

    if (!result.success) {
      setLoading(false);
      setErrorMsg(result.error);
      return;
    }

    // If session returned immediately, log in right away
    if (result.session) {
      setLoading(false);
      setSuccessMsg('Account created successfully! Launching your QA dashboard...');
      if (onLoginSuccess) {
        onLoginSuccess(result.session, result.user);
      }
      return;
    }

    // Auto-login immediately (works seamlessly when Confirm Email is disabled in Supabase)
    const loginResult = await signInUser({
      email: signUpEmail,
      password: signUpPassword
    });
    setLoading(false);

    if (loginResult.success) {
      setSuccessMsg('Account created successfully! Welcome to Testly AI.');
      if (onLoginSuccess) {
        onLoginSuccess(loginResult.session, loginResult.user);
      }
    } else {
      setSuccessMsg('Account created successfully! Please sign in with your credentials.');
      setActiveTab('signin');
      setSignInEmail(signUpEmail);
      setSignInPassword(signUpPassword);
    }
  };


  // -------------------------------------------------------------
  // Forgot Password Step 1: Send OTP via SMTP
  // -------------------------------------------------------------
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!forgotEmail.trim()) {
      setErrorMsg('Please enter the email address linked to your account.');
      return;
    }

    setLoading(true);
    const result = await sendPasswordResetOtp(forgotEmail);
    setLoading(false);

    if (!result.success) {
      setErrorMsg(result.error);
      return;
    }

    setSuccessMsg(`A 6-digit verification OTP has been dispatched to ${forgotEmail} via SMTP.`);
    setResendCooldown(60);
    setForgotStep(2);
    setOtpDigits(['', '', '', '', '', '']);
  };

  // -------------------------------------------------------------
  // OTP Input Box Handlers (Individual Digit Boxes & Paste)
  // -------------------------------------------------------------
  const handleOtpChange = (index, value) => {
    // Only accept numeric inputs
    const char = value.replace(/[^0-9]/g, '');
    const newDigits = [...otpDigits];

    if (char.length > 1) {
      // User typed or pasted multiple characters in one box
      const chars = char.slice(0, 6).split('');
      chars.forEach((c, i) => {
        if (index + i < 6) newDigits[index + i] = c;
      });
      setOtpDigits(newDigits);
      const nextIndex = Math.min(index + chars.length, 5);
      otpInputsRef.current[nextIndex]?.focus();
      return;
    }

    newDigits[index] = char;
    setOtpDigits(newDigits);

    // Auto-advance to next box
    if (char && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        // Shift to previous box
        otpInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (!pastedData) return;

    const chars = pastedData.slice(0, 6).split('');
    const newDigits = ['', '', '', '', '', ''];
    chars.forEach((c, i) => {
      if (i < 6) newDigits[i] = c;
    });
    setOtpDigits(newDigits);

    const targetFocus = Math.min(chars.length, 5);
    otpInputsRef.current[targetFocus]?.focus();
  };

  // -------------------------------------------------------------
  // Forgot Password Step 2: Verify OTP Manually
  // -------------------------------------------------------------
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const enteredOtp = otpDigits.join('');
    if (enteredOtp.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit OTP verification code.');
      return;
    }

    setLoading(true);
    const result = await verifyPasswordResetOtp(forgotEmail, enteredOtp);
    setLoading(false);

    if (!result.success) {
      setErrorMsg(result.error || 'Invalid or expired OTP token. Please check the code and try again.');
      return;
    }

    setSuccessMsg('OTP verified successfully! Please enter your new password.');
    setForgotStep(3);
  };

  // -------------------------------------------------------------
  // Forgot Password Step 3: Update New Password
  // -------------------------------------------------------------
  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters in length.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match. Please ensure both fields are identical.');
      return;
    }

    setLoading(true);
    const result = await updateUserPassword({
      email: forgotEmail,
      otpToken: otpDigits.join(''),
      newPassword: newPassword
    });
    setLoading(false);

    if (!result.success) {
      setErrorMsg(result.error);
      return;
    }


    setSuccessMsg('Your password has been successfully updated!');
    setForgotStep(4);
  };

  const pwdStrength = getPasswordStrength(signUpPassword);
  const newPwdStrength = getPasswordStrength(newPassword);

  return (
    <div className="auth-viewport">
      <div className="auth-ambient-blur"></div>

      <div className="auth-container">
        {/* Header Branding */}
        <header className="auth-header">
          <div className="auth-logo-badge">T</div>
          <h1 className="auth-brand-title">Testly AI</h1>
          <p className="auth-brand-subtitle">Autonomous QA Intelligence Platform</p>
          <div className="auth-supabase-badge">
            <span className="auth-supabase-dot"></span>
            <span>Supabase Cloud Auth</span>
          </div>
        </header>

        {/* Tab Switcher (Visible on Sign In / Sign Up) */}
        {activeTab !== 'forgot' && (
          <nav className="auth-tabs" aria-label="Authentication Options">
            <button
              id="tab-btn-signin"
              className={`auth-tab-btn ${activeTab === 'signin' ? 'active' : ''}`}
              onClick={() => setActiveTab('signin')}
              type="button"
            >
              Sign In
            </button>
            <button
              id="tab-btn-signup"
              className={`auth-tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
              onClick={() => setActiveTab('signup')}
              type="button"
            >
              Create Account
            </button>
          </nav>
        )}

        {/* Global Feedback Banners */}
        {errorMsg && (
          <div className="auth-alert auth-alert-error" role="alert">
            <span className="auth-alert-icon">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert auth-alert-success" role="status">
            <span className="auth-alert-icon">✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="auth-alert auth-alert-info">
            <span className="auth-alert-icon">ℹ️</span>
            <span>{infoMsg}</span>
          </div>
        )}

        {/* =========================================================
            TAB 1: SIGN IN FORM
            ========================================================= */}
        {activeTab === 'signin' && (
          <form className="auth-form" onSubmit={handleSignIn} noValidate>
            <div className="auth-form-group">
              <label className="auth-label" htmlFor="signin-email">Email Address</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">✉️</span>
                <input
                  id="signin-email"
                  type="email"
                  className="auth-input"
                  placeholder="qa-lead@example.com"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-form-group">
              <div className="auth-label">
                <label htmlFor="signin-password">Password</label>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setActiveTab('forgot');
                    setForgotStep(1);
                    setForgotEmail(signInEmail);
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">🔒</span>
                <input
                  id="signin-password"
                  type={showSignInPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="••••••••••••"
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-toggle-pwd"
                  onClick={() => setShowSignInPassword(!showSignInPassword)}
                  aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                >
                  {showSignInPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              id="btn-signin-submit"
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-sm"></span>
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In to QA Hub →</span>
              )}
            </button>

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <button
              id="btn-guest-mode"
              type="button"
              className="auth-guest-btn"
              onClick={onContinueAsGuest}
            >
              <span>⚡ Continue as Guest (Demo Mode)</span>
            </button>
          </form>
        )}

        {/* =========================================================
            TAB 2: SIGN UP FORM
            ========================================================= */}
        {activeTab === 'signup' && (
          <form className="auth-form" onSubmit={handleSignUp} noValidate>
            <div className="auth-form-group">
              <label className="auth-label" htmlFor="signup-name">Full Name</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">👤</span>
                <input
                  id="signup-name"
                  type="text"
                  className="auth-input"
                  placeholder="Kavya Sharma"
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-form-group">
              <label className="auth-label" htmlFor="signup-email">Work Email</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">✉️</span>
                <input
                  id="signup-email"
                  type="email"
                  className="auth-input"
                  placeholder="kavya@enterprise.com"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-form-group">
              <label className="auth-label" htmlFor="signup-role">QA Role / Position</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">💼</span>
                <select
                  id="signup-role"
                  className="auth-input"
                  value={signUpRole}
                  onChange={(e) => setSignUpRole(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Lead QA Engineer">Lead QA Engineer</option>
                  <option value="QA Automation Engineer">QA Automation Engineer</option>
                  <option value="Full Stack Developer">Full Stack Developer</option>
                  <option value="Product Manager / Tester">Product Manager / Tester</option>
                  <option value="Security Auditor">Security Auditor</option>
                </select>
              </div>
            </div>

            <div className="auth-form-group">
              <label className="auth-label" htmlFor="signup-password">Password</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">🔒</span>
                <input
                  id="signup-password"
                  type={showSignUpPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Min 6 characters"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-toggle-pwd"
                  onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                  aria-label={showSignUpPassword ? 'Hide password' : 'Show password'}
                >
                  {showSignUpPassword ? '🙈' : '👁️'}
                </button>
              </div>

              {signUpPassword && (
                <div className="pwd-strength-container">
                  <div className="pwd-strength-bar">
                    <div
                      className="pwd-strength-fill"
                      style={{
                        width: `${pwdStrength.score}%`,
                        backgroundColor: pwdStrength.color
                      }}
                    ></div>
                  </div>
                  <span className="pwd-strength-text" style={{ color: pwdStrength.color }}>
                    Strength: {pwdStrength.label}
                  </span>
                </div>
              )}
            </div>

            <div className="auth-form-group">
              <label className="auth-label" htmlFor="signup-confirm-password">Confirm Password</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">🔐</span>
                <input
                  id="signup-confirm-password"
                  type={showSignUpPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Re-enter password"
                  value={signUpConfirmPassword}
                  onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              id="btn-signup-submit"
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-sm"></span>
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Register Account →</span>
              )}
            </button>
          </form>
        )}

        {/* =========================================================
            FORGOT PASSWORD WORKFLOW (WITH MANUAL SMTP OTP)
            ========================================================= */}
        {activeTab === 'forgot' && (
          <div className="auth-forgot-container">
            {/* Step Navigation Indicator */}
            {forgotStep < 4 && (
              <div className="forgot-steps-nav">
                <div className={`step-indicator ${forgotStep >= 1 ? (forgotStep > 1 ? 'completed' : 'active') : ''}`}>
                  <span className="step-circle">{forgotStep > 1 ? '✓' : '1'}</span>
                  <span>Email</span>
                </div>
                <div className="step-divider-line"></div>
                <div className={`step-indicator ${forgotStep >= 2 ? (forgotStep > 2 ? 'completed' : 'active') : ''}`}>
                  <span className="step-circle">{forgotStep > 2 ? '✓' : '2'}</span>
                  <span>Enter OTP</span>
                </div>
                <div className="step-divider-line"></div>
                <div className={`step-indicator ${forgotStep >= 3 ? 'active' : ''}`}>
                  <span className="step-circle">3</span>
                  <span>New Password</span>
                </div>
              </div>
            )}

            {/* STEP 1: Enter Email to Request OTP */}
            {forgotStep === 1 && (
              <form className="auth-form" onSubmit={handleSendOtp} noValidate>
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '17px', color: 'var(--wine-900)', marginBottom: '4px' }}>
                    Reset Password
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Enter your account email. We will send a 6-digit OTP code directly to your email inbox via SMTP.
                  </p>
                </div>

                <div className="auth-form-group">
                  <label className="auth-label" htmlFor="forgot-email">Account Email Address</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">✉️</span>
                    <input
                      id="forgot-email"
                      type="email"
                      className="auth-input"
                      placeholder="qa-lead@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button
                  id="btn-send-otp"
                  type="submit"
                  className="auth-submit-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-sm"></span>
                      <span>Dispatching OTP...</span>
                    </>
                  ) : (
                    <span>Send Verification OTP Code →</span>
                  )}
                </button>

                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => setActiveTab('signin')}
                  >
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: Enter OTP Manually */}
            {forgotStep === 2 && (
              <form className="auth-form" onSubmit={handleVerifyOtp} noValidate>
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '17px', color: 'var(--wine-900)', marginBottom: '4px' }}>
                    Enter 6-Digit OTP Code
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    An OTP token was sent via SMTP to <strong>{forgotEmail}</strong>. Enter the 6 digits manually below:
                  </p>
                </div>

                <div className="otp-input-group">
                  <div className="otp-boxes-wrapper" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpInputsRef.current[idx] = el)}
                        id={`otp-box-${idx}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className={`otp-box-input ${digit ? 'filled' : ''}`}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        autoFocus={idx === 0}
                      />
                    ))}
                  </div>

                  <div className="otp-cooldown-notice">
                    {resendCooldown > 0 ? (
                      <span>Resend OTP available in <strong>{resendCooldown}s</strong></span>
                    ) : (
                      <button
                        type="button"
                        className="otp-resend-btn"
                        onClick={handleSendOtp}
                        disabled={loading}
                      >
                        🔄 Resend OTP Code
                      </button>
                    )}
                  </div>
                </div>

                <button
                  id="btn-verify-otp"
                  type="submit"
                  className="auth-submit-btn"
                  disabled={loading || otpDigits.join('').length !== 6}
                >
                  {loading ? (
                    <>
                      <span className="spinner-sm"></span>
                      <span>Verifying OTP...</span>
                    </>
                  ) : (
                    <span>Verify Code & Continue →</span>
                  )}
                </button>

                <div className="auth-row-between" style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => setForgotStep(1)}
                  >
                    ← Change Email
                  </button>
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => setActiveTab('signin')}
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Set New Password */}
            {forgotStep === 3 && (
              <form className="auth-form" onSubmit={handleSetNewPassword} noValidate>
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '17px', color: 'var(--wine-900)', marginBottom: '4px' }}>
                    Create New Password
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Your OTP has been verified. Enter a new secure password for your account.
                  </p>
                </div>

                <div className="auth-form-group">
                  <label className="auth-label" htmlFor="new-password">New Password</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">🔒</span>
                    <input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="Minimum 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="auth-toggle-pwd"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? '🙈' : '👁️'}
                    </button>
                  </div>

                  {newPassword && (
                    <div className="pwd-strength-container">
                      <div className="pwd-strength-bar">
                        <div
                          className="pwd-strength-fill"
                          style={{
                            width: `${newPwdStrength.score}%`,
                            backgroundColor: newPwdStrength.color
                          }}
                        ></div>
                      </div>
                      <span className="pwd-strength-text" style={{ color: newPwdStrength.color }}>
                        Strength: {newPwdStrength.label}
                      </span>
                    </div>
                  )}
                </div>

                <div className="auth-form-group">
                  <label className="auth-label" htmlFor="confirm-new-password">Confirm New Password</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">🔐</span>
                    <input
                      id="confirm-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="Re-enter new password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button
                  id="btn-update-password"
                  type="submit"
                  className="auth-submit-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-sm"></span>
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <span>Save New Password & Finish →</span>
                  )}
                </button>
              </form>
            )}

            {/* STEP 4: Success State */}
            {forgotStep === 4 && (
              <div className="auth-success-state">
                <div className="success-check-icon">✓</div>
                <h3 className="auth-success-title">Password Reset Complete!</h3>
                <p className="auth-success-desc">
                  Your password has been successfully updated in Supabase. You can now sign in to Testly AI using your new password.
                </p>

                <button
                  id="btn-success-to-signin"
                  type="button"
                  className="auth-submit-btn"
                  onClick={() => {
                    setActiveTab('signin');
                    setForgotStep(1);
                    setSignInEmail(forgotEmail);
                    setSignInPassword('');
                  }}
                >
                  Proceed to Sign In →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
