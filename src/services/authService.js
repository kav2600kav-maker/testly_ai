import { supabase } from './supabaseClient';

/**
 * Sign up a new user with email, password, and metadata
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.fullName
 * @param {string} [params.role]
 */
export async function signUpUser({ email, password, fullName, role = 'QA Engineer' }) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: role
        }
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      user: data.user,
      session: data.session,
      // If session is null, email confirmation may be required by Supabase settings
      requiresConfirmation: !data.session && !!data.user
    };
  } catch (err) {
    return { success: false, error: err.message || 'An unexpected error occurred during sign up.' };
  }
}

/**
 * Sign in an existing user with email and password
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 */
export async function signInUser({ email, password }) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      user: data.user,
      session: data.session
    };
  } catch (err) {
    return { success: false, error: err.message || 'An unexpected error occurred during sign in.' };
  }
}

/**
 * Sign out the currently logged-in user
 */
export async function signOutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to sign out.' };
  }
}

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api');

/**
 * Send Password Reset OTP code via SMTP
 * Dispatches a 6-digit OTP code directly to user email via configured Gmail SMTP
 * and synchronizes with Supabase Auth recovery.
 * @param {string} email
 */
export async function sendPasswordResetOtp(email) {
  try {
    const trimmedEmail = email.trim();
    let smtpSuccess = false;
    let smtpError = null;

    // 1. Dispatch through dedicated Gmail SMTP backend endpoint
    try {
      const resp = await fetch(`${API_BASE}/auth/send-smtp-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail })
      });
      const json = await resp.json();
      if (resp.ok && json.success) {
        smtpSuccess = true;
      } else {
        smtpError = json.detail || json.message;
      }
    } catch (e) {
      smtpError = e.message;
    }

    // 2. Also trigger Supabase resetPasswordForEmail in background
    let supabaseSuccess = false;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (!error) supabaseSuccess = true;
    } catch {}

    if (smtpSuccess || supabaseSuccess) {
      return {
        success: true,
        message: `6-digit verification OTP has been sent to ${trimmedEmail} via SMTP.`
      };
    }

    return {
      success: false,
      error: smtpError || 'Failed to dispatch password reset OTP. Please verify your email address.'
    };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to dispatch password reset OTP.' };
  }
}

/**
 * Verify the OTP code manually entered by the user
 * Validates against the backend SMTP OTP store and Supabase Auth recovery.
 * @param {string} email
 * @param {string} otpToken - 6-digit OTP code entered by the user
 */
export async function verifyPasswordResetOtp(email, otpToken) {
  try {
    const trimmedEmail = email.trim();
    const cleanedToken = otpToken.trim().replace(/\s+/g, '');

    // 1. Validate against backend SMTP OTP store
    let smtpVerified = false;
    try {
      const resp = await fetch(`${API_BASE}/auth/verify-smtp-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, otp: cleanedToken })
      });
      const json = await resp.json();
      if (resp.ok && json.success) {
        smtpVerified = true;
      }
    } catch {}

    // 2. Validate against Supabase recovery token
    let supabaseVerified = false;
    let session = null;
    let user = null;
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: cleanedToken,
        type: 'recovery'
      });
      if (!error && data) {
        supabaseVerified = true;
        session = data.session;
        user = data.user;
      }
    } catch {}

    // 3. Directly check Supabase public.password_reset_otps table (handles stateless Vercel edge cases)
    let tableVerified = false;
    try {
      const { data: records } = await supabase
        .from('password_reset_otps')
        .select('*')
        .eq('email', trimmedEmail.toLowerCase())
        .eq('otp_code', cleanedToken)
        .eq('verified', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (records && records.length > 0) {
        const record = records[0];
        if (new Date(record.expires_at) > new Date()) {
          tableVerified = true;
          await supabase
            .from('password_reset_otps')
            .update({ verified: true })
            .eq('id', record.id);
        }
      }
    } catch {}

    if (smtpVerified || supabaseVerified || tableVerified) {
      return {
        success: true,
        user,
        session,
        verifiedVia: tableVerified ? 'supabase_table' : (smtpVerified ? 'smtp' : 'supabase')
      };
    }


    return {
      success: false,
      error: 'Invalid or expired OTP verification code. Please check your email inbox and try again.'
    };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to verify OTP code.' };
  }
}


/**
 * Update the user password
 * Handles both active sessions and session-less OTP recovery via reset_user_password RPC
 * @param {Object|string} params
 * @param {string} [params.email]
 * @param {string} [params.otpToken]
 * @param {string} [params.newPassword]
 */
export async function updateUserPassword(params) {
  try {
    const newPassword = typeof params === 'string' ? params : params?.newPassword;
    const email = typeof params === 'object' ? params?.email : null;
    const otpToken = typeof params === 'object' ? params?.otpToken : null;

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters in length.' };
    }

    // 1. Try native Supabase updateUser if an active session exists
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (!error && data?.user) {
          return { success: true, user: data.user };
        }
      }
    } catch {}

    // 2. If no active session, use our secure reset_user_password RPC
    if (email && otpToken) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('reset_user_password', {
          user_email: email.trim().toLowerCase(),
          otp_token: otpToken.trim(),
          new_plain_password: newPassword
        });

        if (!rpcError && rpcData) {
          if (rpcData.success) {
            return { success: true, message: rpcData.message };
          } else {
            return { success: false, error: rpcData.error };
          }
        }
      } catch {}

      // 3. Fallback to backend reset-password endpoint
      try {
        const resp = await fetch(`${API_BASE}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            otp: otpToken.trim(),
            new_password: newPassword
          })
        });
        const json = await resp.json();
        if (resp.ok && json.success) {
          return { success: true, message: json.message };
        }
        if (json.detail) {
          return { success: false, error: json.detail };
        }
      } catch {}
    }

    return {
      success: false,
      error: 'Please execute the updated SQL script in Supabase SQL Editor to enable session-less password updates.'
    };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to update password.' };
  }
}


/**
 * Get current session from Supabase client
 */
export async function getCurrentSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { session: null, error: error.message };
    }
    return { session: data.session, error: null };
  } catch (err) {
    return { session: null, error: err.message };
  }
}

/**
 * Get current user from Supabase client
 */
export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return { user: null, error: error.message };
    }
    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

/**
 * Listen to authentication state changes
 * @param {Function} callback (event, session)
 */
export function subscribeToAuthChanges(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return subscription;
}
