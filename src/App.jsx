import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AuthPage from './components/AuthPage';
import {
  getCurrentSession,
  signOutUser,
  subscribeToAuthChanges
} from './services/authService';
import {
  getStoredProfile,
  saveStoredProfile,
  getStoredHistory,
  getStoredWebsites
} from './services/storage';
import {
  fetchTestHistory,
  saveTestRunToDatabase,
  fetchTestedWebsites,
  saveTestedWebsiteToDatabase,
  deleteTestHistoryItem
} from './services/historyService';
import { runAutonomousAgentPipeline } from './services/agentEngine';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api');

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Supabase Authentication States
  const [session, setSession] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);
  
  // Dashboard & History States
  const [history, setHistory] = useState([]);
  const [websites, setWebsites] = useState([]);
  const [profile, setProfile] = useState({
    name: 'QA Engineer',
    role: 'Lead Developer / Tester',
    gemini_api_key: '',
    default_browser: 'Chrome',
    screenshot_quality: 'High',
    notifications_enabled: true
  });
  
  // Notification States
  const [notifications, setNotifications] = useState([
    { id: 1, text: 'Agentic Pipeline: Initialized system check successfully.', time: '5m ago', read: false },
    { id: 2, text: 'Bug Alert: SSL/HTTPS Security check failed on http://example.com.', time: '1h ago', read: false }
  ]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  // Executor Wizard States
  const [testUrl, setTestUrl] = useState('');
  const [selectedBrowser, setSelectedBrowser] = useState('Chrome');
  const [testingTypes, setTestingTypes] = useState(['Functional', 'UI/UX']);
  const [executionState, setExecutionState] = useState('idle'); // idle, running, finished, error
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [liveLogs, setLiveLogs] = useState([]);
  const [liveStatus, setLiveStatus] = useState('pending'); // planning, generating, executing, analyzing, reporting, completed, failed
  const [activeTestCases, setActiveTestCases] = useState([]);
  const [activeBugs, setActiveBugs] = useState([]);
  const [activeReportUrl, setActiveReportUrl] = useState(null);
  const [activePlan, setActivePlan] = useState({});
  const [selectedTestCase, setSelectedTestCase] = useState(null);
  
  // Screenshot Carousel State
  const [carouselIndex, setCarouselIndex] = useState(0);

  const [backendConnected, setBackendConnected] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  const consoleEndRef = useRef(null);

  // Check Supabase session & listen for auth state updates
  useEffect(() => {
    getCurrentSession().then(({ session }) => {
      if (session) {
        setSession(session);
        setAuthUser(session.user);
        if (session.user?.user_metadata?.full_name) {
          setProfile(prev => ({
            ...prev,
            name: session.user.user_metadata.full_name,
            role: session.user.user_metadata.role || prev.role
          }));
        }
      }
      setAuthLoading(false);
    });

    const subscription = subscribeToAuthChanges((event, newSession) => {
      setSession(newSession);
      setAuthUser(newSession?.user || null);
      if (newSession?.user?.user_metadata?.full_name) {
        setProfile(prev => ({
          ...prev,
          name: newSession.user.user_metadata.full_name,
          role: newSession.user.user_metadata.role || prev.role
        }));
      }
      if (event === 'SIGNED_OUT') {
        setIsGuestMode(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Check backend health & fetch initial data
  useEffect(() => {
    checkBackendHealth();
    fetchProfile();
    fetchHistory(authUser?.id);
    fetchWebsites(authUser?.id);

    const healthInterval = setInterval(checkBackendHealth, 4000);
    return () => clearInterval(healthInterval);
  }, [authUser]);

  const handleSignOut = async () => {
    await signOutUser();
    setSession(null);
    setAuthUser(null);
    setIsGuestMode(false);
  };


  const checkBackendHealth = async () => {
    try {
      const r = await fetch(`${API_BASE}/profile`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        setBackendConnected(true);
      } else {
        setBackendConnected(false);
      }
    } catch {
      setBackendConnected(false);
    }
  };

  // Scroll to bottom of terminal console logs
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs]);

  // Polling helper for active task
  useEffect(() => {
    let intervalId = null;
    if (executionState === 'running' && currentTaskId) {
      intervalId = setInterval(() => {
        pollTaskStatus(currentTaskId);
      }, 1200);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [executionState, currentTaskId]);

  const fetchProfile = async () => {
    try {
      const r = await fetch(`${API_BASE}/profile`);
      if (r.ok) {
        const data = await r.json();
        setProfile(data);
        saveStoredProfile(data);
        setBackendConnected(true);
        return;
      }
    } catch (e) {}
    // Fallback to local persistent storage
    setProfile(getStoredProfile());
    setBackendConnected(true);
  };

  const fetchHistory = async (userId = authUser?.id) => {
    try {
      const data = await fetchTestHistory(userId);
      if (Array.isArray(data)) {
        setHistory(data);
        return;
      }
    } catch (e) {
      console.warn("fetchTestHistory failed, falling back to API/local:", e);
    }

    try {
      const r = await fetch(`${API_BASE}/test/history`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          setHistory(data);
          return;
        }
      }
    } catch (e) {}
    setHistory(getStoredHistory());
  };

  const fetchWebsites = async (userId = authUser?.id) => {
    try {
      const data = await fetchTestedWebsites(userId);
      if (Array.isArray(data)) {
        setWebsites(data);
        return;
      }
    } catch (e) {
      console.warn("fetchTestedWebsites failed, falling back to API/local:", e);
    }

    try {
      const r = await fetch(`${API_BASE}/websites`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          setWebsites(data);
          return;
        }
      }
    } catch (e) {}
    setWebsites(getStoredWebsites());
  };

  const handleDeleteHistoryItem = async (id, e) => {
    if (e) e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this test execution record from the Supabase database?")) {
      await deleteTestHistoryItem(id);
      await fetchHistory(authUser?.id);
    }
  };

  const pollTaskStatus = async (taskId) => {
    try {
      const r = await fetch(`${API_BASE}/test/status/${taskId}`);
      if (r.ok) {
        const data = await r.json();
        setLiveLogs(data.logs || []);
        setLiveStatus(data.status);
        
        if (data.status === 'completed') {
          setExecutionState('finished');
          const results = (data.test_results && data.test_results.length > 0) 
            ? data.test_results 
            : (data.test_cases || []);
          setActiveTestCases(results);
          setActiveBugs(data.bugs || []);
          setActiveReportUrl(data.report_url);
          setActivePlan(data.plan || {});
          if (data.url) setTestUrl(data.url);

          // Save to persistent Supabase database
          const passedCount = results.filter(t => t.status === 'PASSED' || t.status === 'passed').length;
          const totalCases = results.length;
          const successRate = totalCases > 0 ? +((passedCount / totalCases) * 100).toFixed(1) : 100.0;

          await saveTestRunToDatabase({
            url: data.url || testUrl,
            browser: data.browser || selectedBrowser,
            testing_types: data.testing_types || testingTypes,
            status: 'completed',
            success_rate: successRate,
            test_cases_count: totalCases,
            passed_count: passedCount,
            bugs_count: (data.bugs || []).length,
            test_results: results,
            bugs: data.bugs || [],
            plan: data.plan || {},
            report_url: data.report_url
          }, authUser?.id);

          await saveTestedWebsiteToDatabase(data.url || testUrl, {
            title: data.plan?.title || 'Audited Web App',
            site_type: data.plan?.site_type || 'Modern Web App',
            technologies: data.plan?.technologies || ['HTML5', 'CSS3'],
            success_rate: successRate
          }, authUser?.id);

          fetchHistory(authUser?.id);
          fetchWebsites(authUser?.id);
        } else if (data.status === 'failed') {
          setExecutionState('error');
          setErrorMessage(data.error || "The test execution pipeline encountered a fatal error.");
        }
      }
    } catch (e) {
      console.error("Polling error: ", e);
    }
  };

  const handleStartTesting = async () => {
    if (!testUrl) return;
    
    // Ensure URL has http/https protocol
    let formattedUrl = testUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
      setTestUrl(formattedUrl);
    }

    // Clear wizard state
    setExecutionState('running');
    setLiveLogs([
      'Initializing Testly AI autonomous QA agent workflow...',
      `Target URL: ${formattedUrl}`
    ]);
    setLiveStatus('planning');
    setActiveTestCases([]);
    setActiveBugs([]);
    setActiveReportUrl(null);
    setActivePlan({});
    setSelectedTestCase(null);
    setCarouselIndex(0);
    setErrorMessage(null);

    // Try backend API first, if available
    let backendHandled = false;
    try {
      const r = await fetch(`${API_BASE}/test/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formattedUrl,
          browser: selectedBrowser,
          testing_types: testingTypes
        })
      });
      
      if (r.ok) {
        const data = await r.json();
        setCurrentTaskId(data.task_id);
        setBackendConnected(true);
        backendHandled = true;
      }
    } catch (e) {
      // Backend not running / static deployment
      backendHandled = false;
    }

    // If backend did not handle, seamlessly run embedded Autonomous Agent Pipeline!
    if (!backendHandled) {
      try {
        const result = await runAutonomousAgentPipeline({
          url: formattedUrl,
          browser: selectedBrowser,
          testingTypes,
          geminiApiKey: profile.gemini_api_key,
          userId: authUser?.id,
          onLog: (newLog) => setLiveLogs(prev => [...prev, newLog]),
          onStatus: (st) => setLiveStatus(st)
        });
        setExecutionState('finished');
        setActiveTestCases(result.test_results);
        setActiveBugs(result.bugs);
        setActivePlan(result.plan);
        await fetchHistory(authUser?.id);
        await fetchWebsites(authUser?.id);
      } catch (agentErr) {
        setExecutionState('error');
        setErrorMessage(`Agent execution error: ${agentErr.message}`);
      }
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    saveStoredProfile(profile);
    try {
      await fetch(`${API_BASE}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
    } catch (err) {}
    alert("Settings saved successfully!");
    fetchProfile();
  };

  const toggleTestingType = (type) => {
    setTestingTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // Filter lists based on search
  const filteredHistory = history.filter(h => h.url.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredWebsites = websites.filter(w => w.url.toLowerCase().includes(searchQuery.toLowerCase()));

  // Stats calculation
  const totalRuns = history.length;
  const totalBugs = history.reduce((sum, h) => sum + (h.bugs_count || 0), 0);
  const avgSuccessRate = totalRuns > 0 
    ? Math.round(history.reduce((sum, h) => sum + h.success_rate, 0) / totalRuns) 
    : 100;

  // Carousel Helper
  const failureScreenshots = activeTestCases
    .filter(tc => tc.status === 'FAILED' && tc.screenshot)
    .map(tc => ({ id: tc.id, name: tc.name, url: tc.screenshot, error: tc.error_message }));

  const nextSlide = () => {
    setCarouselIndex(prev => (prev + 1) % failureScreenshots.length);
  };

  const generatePDF = (reportData = null) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date().toLocaleString();
    const WINE  = [142, 20, 50];  // Wine Red
    const BLACK = [30, 10, 18];   // Deep charcoal text

    const targetUrl = reportData?.url || testUrl || 'N/A';
    const targetPlan = reportData?.plan || activePlan || {};
    const rawTCs = reportData?.test_results || reportData?.test_cases || (activeTestCases.length > 0 ? activeTestCases : []);
    const targetTestCases = Array.isArray(rawTCs) ? rawTCs : [];
    const targetBugs = reportData?.bugs || activeBugs || [];

    // ── White background ──
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 297, 'F');

    // ── Title (Wine Red) + underline ──
    doc.setFontSize(20);
    doc.setTextColor(...WINE);
    doc.setFont('helvetica', 'bold');
    doc.text('Testly AI — Automated Test Report', 14, 18);
    doc.setDrawColor(...WINE);
    doc.setLineWidth(0.5);
    doc.line(14, 21, pageW - 14, 21);

    // Generated date
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${now}`, 14, 27);

    // ── Site Under Test heading ──
    doc.setFontSize(12);
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.text('Site Under Test', 14, 38);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text(`URL: ${targetUrl}`, 14, 45);
    doc.text(`Classification: ${targetPlan.site_type || 'Web Application'}   |   Title: ${targetPlan.title || 'Web Document'}`, 14, 52);

    // ── Summary boxes ──
    const total  = targetTestCases.length;
    const passed = targetTestCases.filter(tc => (tc.status || '').toUpperCase() === 'PASSED').length;
    const failed = targetTestCases.filter(tc => (tc.status || '').toUpperCase() === 'FAILED').length;
    const rate   = total > 0 ? Math.round((passed / total) * 100) : (reportData?.success_rate ?? 0);

    const boxes = [
      { label: 'Total Tests',  value: String(total || (reportData?.test_cases_count ?? 0)) },
      { label: 'Passed',       value: String(passed || (reportData?.passed_count ?? 0)) },
      { label: 'Failed',       value: String(failed || (reportData?.bugs_count ?? 0)) },
      { label: 'Success Rate', value: `${rate}%` },
    ];

    let bx = 14;
    boxes.forEach(b => {
      doc.setFillColor(253, 242, 245); // soft wine blush
      doc.setDrawColor(220, 180, 195);
      doc.setLineWidth(0.4);
      doc.roundedRect(bx, 58, 42, 22, 2, 2, 'FD');
      doc.setTextColor(...WINE);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text(b.value, bx + 21, 69, { align: 'center' });
      doc.setTextColor(...BLACK);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(b.label, bx + 21, 76, { align: 'center' });
      bx += 46;
    });

    // ── Test Cases Table ──
    doc.setFontSize(12);
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.text('Test Cases', 14, 90);

    autoTable(doc, {
      startY: 94,
      head: [['ID', 'Test Case Name', 'Category', 'Status']],
      body: targetTestCases.map(tc => [
        tc.id || 'TC',
        tc.name || 'Test Validation',
        tc.category || 'Functional',
        (tc.status || 'PASSED').toUpperCase(),
      ]),
      styles: { fontSize: 9, cellPadding: 3, textColor: BLACK, fillColor: [255, 255, 255] },
      headStyles: { fillColor: [142, 20, 50], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [253, 242, 245] },
      columnStyles: {
        0: { cellWidth: 22 },
        3: { cellWidth: 26, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw || '');
          if (val === 'PASSED') {
            data.cell.styles.textColor = [5, 150, 105]; // Green
          } else {
            data.cell.styles.textColor = [220, 38, 38]; // Red
          }
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // ── Bug Analysis Table ──
    if (targetBugs.length > 0) {
      const bugsY = doc.lastAutoTable.finalY + 12;
      doc.setFontSize(12);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text('Bug Analysis & Suggested Fixes', 14, bugsY);

      autoTable(doc, {
        startY: bugsY + 4,
        head: [['Bug ID', 'Name', 'Severity', 'Root Cause', 'Suggested Fix']],
        body: targetBugs.map(bug => [
          bug.id || 'BUG-001',
          bug.name || 'Validation Discrepancy',
          bug.severity || 'Medium',
          bug.possible_root_cause || '—',
          bug.suggested_fix || '—',
        ]),
        styles: { fontSize: 8, cellPadding: 3, textColor: BLACK, fillColor: [255, 255, 255] },
        headStyles: { fillColor: [142, 20, 50], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [253, 242, 245] },
        columnStyles: {
          0: { cellWidth: 20 },
          2: { cellWidth: 22, halign: 'center' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 2) {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    }

    // ── Footer ──
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(220, 180, 195);
      doc.setLineWidth(0.3);
      doc.line(14, 286, pageW - 14, 286);
      doc.setFontSize(8);
      doc.setTextColor(...BLACK);
      doc.text(`Testly AI  |  Page ${i} of ${pageCount}  |  ${targetUrl}`, pageW / 2, 291, { align: 'center' });
    }

    const filename = `testly_report_${(targetUrl || 'report').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    doc.save(filename);
  };

  // Loading state while verifying Supabase Auth session
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-deep)',
        color: 'var(--text-main)',
        fontFamily: 'var(--font-body)'
      }}>
        <div style={{
          width: 54,
          height: 54,
          borderRadius: 14,
          background: 'linear-gradient(135deg, var(--wine-700), var(--wine-500))',
          color: '#ffffff',
          fontSize: 26,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(142, 20, 50, 0.25)',
          marginBottom: 16
        }}>T</div>
        <h3 style={{ fontSize: 18, color: 'var(--wine-900)', marginBottom: 6 }}>Testly AI</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Connecting to Supabase Auth...</p>
      </div>
    );
  }

  // Gate application behind Supabase Auth (or Guest/Demo mode)
  if (!session && !isGuestMode) {
    return (
      <AuthPage
        onLoginSuccess={(newSession, user) => {
          setSession(newSession);
          setAuthUser(user || newSession?.user);
          if (user?.user_metadata?.full_name) {
            setProfile(prev => ({
              ...prev,
              name: user.user_metadata.full_name,
              role: user.user_metadata.role || prev.role
            }));
          }
        }}
        onContinueAsGuest={() => setIsGuestMode(true)}
      />
    );
  }

  return (

    <div className="app-container">

      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">T</div>
          <span className="logo-text">Testly AI</span>
        </div>
        
        <ul className="menu-list">
          <li 
            id="nav-dashboard"
            className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </li>
          <li 
            id="nav-testing"
            className={`menu-item ${activeTab === 'testing' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('testing');
              if (executionState === 'finished' || executionState === 'error') {
                setExecutionState('idle');
                setTestUrl('');
              }
            }}
          >
            Run Testing
          </li>
          <li 
            id="nav-history"
            className={`menu-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Execution History
          </li>
          <li 
            id="nav-websites"
            className={`menu-item ${activeTab === 'websites' ? 'active' : ''}`}
            onClick={() => setActiveTab('websites')}
          >
            Website Info
          </li>
          <li 
            id="nav-profile"
            className={`menu-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile & Settings
          </li>
        </ul>

        <div className="sidebar-footer">
          <div className="user-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {authUser?.user_metadata?.full_name || profile.name}
              </span>
              {session ? (
                <span style={{ fontSize: '10px', background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                  Supabase
                </span>
              ) : (
                <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.18)', color: '#fff', padding: '1px 6px', borderRadius: '4px' }}>
                  Demo
                </span>
              )}
            </div>
            <span className="user-role" style={{ fontSize: '11px', opacity: 0.8, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {authUser?.email || profile.role}
            </span>

            <button
              id="btn-sidebar-signout"
              onClick={handleSignOut}
              style={{
                marginTop: '10px',
                width: '100%',
                padding: '7px 10px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '11.5px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(220, 38, 38, 0.28)';
                e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
              }}
            >
              <span>{session ? 'Sign Out ⎋' : 'Exit Demo / Sign In →'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main-area">
        {/* Header */}
        <header className="header">
          <div className="header-title-sec">
            <h1 className="header-title" id="page-main-heading">
              {activeTab === 'dashboard' && 'QA Control Dashboard'}
              {activeTab === 'testing' && 'Automated Testing Hub'}
              {activeTab === 'history' && 'Audit History Log'}
              {activeTab === 'websites' && 'Tested Websites'}
              {activeTab === 'profile' && 'QA Engineer Settings'}
            </h1>
            <span className="header-subtitle">
              {activeTab === 'dashboard' && 'Track core metrics and recent runs'}
              {activeTab === 'testing' && 'Deploy AI agents to audit a live webpage'}
              {activeTab === 'history' && 'Review generated PDF reports and assertions'}
              {activeTab === 'websites' && 'Review crawled page metadata and stacks'}
              {activeTab === 'profile' && 'Manage keys and default configurations'}
            </span>
          </div>

          <div className="header-actions">
            {/* Search bar */}
            <div className="search-bar-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                id="global-search-bar"
                type="text" 
                className="search-bar-input" 
                placeholder="Search websites or logs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* Dynamic Pages */}
        <section className="page-content">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div style={{animation: 'fadeInUp 0.3s ease-out'}}>
              {/* Stats Cards grid */}
              <div className="stats-grid">
                <div className="card-panel stat-card">
                  <div className="stat-details">
                    <span className="stat-label">Total Audits</span>
                    <span className="stat-value">{totalRuns}</span>
                  </div>
                </div>
                <div className="card-panel stat-card">
                  <div className="stat-details">
                    <span className="stat-label">Avg Success</span>
                    <span className="stat-value">{avgSuccessRate}%</span>
                  </div>
                </div>
                <div className="card-panel stat-card">
                  <div className="stat-details">
                    <span className="stat-label">Discovered Bugs</span>
                    <span className="stat-value">{totalBugs}</span>
                  </div>
                </div>
                <div className="card-panel stat-card">
                  <div className="stat-details">
                    <span className="stat-label">Sites Tracked</span>
                    <span className="stat-value">{websites.length}</span>
                  </div>
                </div>
              </div>

              {/* Sub-panels layout */}
              <div className="dashboard-grid">
                {/* Recent runs */}
                <div className="card-panel glow-purple" style={{gridColumn: 'span 2'}}>
                  <div className="dashboard-panel-title">
                    <span>Recent Test Executions</span>
                    <span className="dashboard-view-all" onClick={() => setActiveTab('history')}>View history ➔</span>
                  </div>
                  <div className="data-table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Website Target</th>
                          <th>Browser</th>
                          <th>Success Rate</th>
                          <th>Bugs Found</th>
                          <th>Timestamp</th>
                          <th>Report</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.slice(0, 3).map(h => (
                          <tr key={h.id}>
                            <td style={{fontWeight: '600'}}>{h.url}</td>
                            <td>{h.browser}</td>
                            <td>
                              <span className={`badge ${h.success_rate >= 90 ? 'passed' : 'failed'}`}>
                                {h.success_rate}%
                              </span>
                            </td>
                            <td>{h.bugs_count} bugs</td>
                            <td>{new Date(h.timestamp).toLocaleString()}</td>
                            <td>
                              <button 
                                className="btn-secondary" 
                                style={{padding: '6px 12px', fontSize: '12px'}}
                                onClick={() => generatePDF(h)}
                              >
                                Download PDF
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredHistory.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{textAlign: 'center', color: 'var(--text-muted)', padding: '24px'}}>
                              No executions discovered. Deploy a test run to populate stats.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RUN TESTING */}
          {activeTab === 'testing' && (
            <div>
              {executionState === 'idle' && (
                <div className="executor-setup-container glow-purple" style={{animation: 'fadeInUp 0.3s'}}>
                  <div className="executor-header">
                    <div className="executor-badge">⚡ Autonomous QA Agent Orchestrator</div>
                    <h2 className="executor-title">Initiate Quality Assurance Audit</h2>
                    <p className="executor-desc">
                      Configure your target endpoint, select execution environment, and deploy autonomous agents to evaluate functional integrity, DOM responsiveness, and web standards.
                    </p>
                  </div>

                  <div className="executor-form">
                    {/* Target URL Input */}
                    <div className="input-group">
                      <div className="input-label-row">
                        <label className="input-label" htmlFor="testing-url-input">
                          Target Website URL <span className="input-label-required">*</span>
                        </label>
                        <span className="input-label-badge">Supports HTTP / HTTPS</span>
                      </div>
                      <div className="url-input-container">
                        <span className="url-input-prefix">🌐 URL:</span>
                        <input 
                          id="testing-url-input"
                          type="url" 
                          className="url-field" 
                          placeholder="https://example.com or http://localhost:3000" 
                          value={testUrl}
                          onChange={(e) => setTestUrl(e.target.value)}
                        />
                        {testUrl && (
                          <button 
                            type="button" 
                            className="url-clear-btn" 
                            onClick={() => setTestUrl('')}
                            title="Clear URL"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <span className="input-hint">
                        Provide the full domain or local dev URL to audit (e.g. <code>https://react.dev</code> or <code>http://localhost:5173</code>).
                      </span>
                    </div>

                    {/* Execution Browser Selection */}
                    <div className="input-group">
                      <div className="input-label-row">
                        <label className="input-label">Execution Environment / Browser</label>
                        <span className="input-label-badge">{selectedBrowser} selected</span>
                      </div>
                      <div className="browser-selector-grid">
                        {[
                          { id: 'Chrome', name: 'Google Chrome', tag: 'V8 Engine • Recommended', icon: '🌐' },
                          { id: 'Firefox', name: 'Mozilla Firefox', tag: 'Gecko Engine • Standard', icon: '🦊' },
                          { id: 'Safari', name: 'Apple Safari', tag: 'WebKit • macOS & iOS', icon: '🧭' }
                        ].map(b => (
                          <div 
                            key={b.id}
                            className={`browser-card ${selectedBrowser === b.id ? 'selected' : ''}`}
                            onClick={() => setSelectedBrowser(b.id)}
                          >
                            <span className="browser-card-icon">{b.icon}</span>
                            <div className="browser-card-info">
                              <span className="browser-card-name">{b.name}</span>
                              <span className="browser-card-tag">{b.tag}</span>
                            </div>
                            <div className="browser-card-radio">
                              {selectedBrowser === b.id && <div className="radio-inner" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Testing Capabilities Selection */}
                    <div className="input-group">
                      <div className="input-label-row">
                        <label className="input-label">Testing Capabilities & Scope</label>
                        <span className="input-label-badge">{testingTypes.length} of 4 enabled</span>
                      </div>
                      <div className="types-checkbox-grid">
                        {[
                          { id: 'Functional', label: 'Functional QA', desc: 'Forms, buttons, navigations & actions', icon: '⚙️' },
                          { id: 'UI/UX', label: 'UI / UX Design', desc: 'Layout hierarchy, responsiveness & badges', icon: '🎨' },
                          { id: 'Performance', label: 'Performance', desc: 'Page speed, render times & payload', icon: '⚡' },
                          { id: 'SEO', label: 'SEO & Security', desc: 'HTTPS protocols, meta tags & headers', icon: '🛡️' }
                        ].map(type => (
                          <div 
                            key={type.id} 
                            className={`type-checkbox-card ${testingTypes.includes(type.id) ? 'selected' : ''}`}
                            onClick={() => toggleTestingType(type.id)}
                          >
                            <div className="type-checkbox-header">
                              <span className="type-icon">{type.icon}</span>
                              <input 
                                type="checkbox" 
                                checked={testingTypes.includes(type.id)}
                                onChange={() => {}} 
                              />
                            </div>
                            <span className="type-checkbox-label">{type.label}</span>
                            <span className="type-checkbox-desc">{type.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Button & Trust Strip */}
                    <div className="executor-action-container">
                      <button 
                        id="btn-start-testing"
                        className="btn-primary" 
                        style={{
                          width: '100%', 
                          justifyContent: 'center', 
                          padding: '16px 24px',
                          fontSize: '16px',
                          fontWeight: '700',
                          borderRadius: '12px',
                          boxShadow: '0 6px 20px rgba(142, 20, 50, 0.3)'
                        }}
                        onClick={handleStartTesting}
                        disabled={!testUrl || testingTypes.length === 0}
                      >
                        <span>Deploy Autonomous Agents</span>
                        <span style={{fontSize: '18px', marginLeft: '6px'}}>➔</span>
                      </button>

                      <div className="executor-footer-tips">
                        <span>🔒 Sandboxed headless browser</span>
                        <span>•</span>
                        <span>⚡ Autonomous assertions</span>
                        <span>•</span>
                        <span>📄 Comprehensive PDF audit report</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Executing Tracker View */}
              {executionState === 'running' && (
                <div className="workflow-tracker-card glow-purple" style={{animation: 'fadeInUp 0.3s'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                    <h3 className="dashboard-panel-title" style={{margin: 0}}>Active Testing Pipeline</h3>
                    <span className="badge running" style={{fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      🌐 {testUrl}
                    </span>
                  </div>
                  
                  {/* Step trackers */}
                  <div className="workflow-steps-row">
                    <div className="workflow-progress-line">
                      <div 
                        className="workflow-progress-fill" 
                        style={{
                          width: 
                            liveStatus === 'planning' ? '12.5%' : 
                            liveStatus === 'generating' ? '37.5%' : 
                            liveStatus === 'executing' ? '62.5%' : 
                            liveStatus === 'analyzing' ? '87.5%' : 
                            liveStatus === 'reporting' ? '95%' : 
                            liveStatus === 'completed' ? '100%' : '0%'
                        }}
                      ></div>
                    </div>

                    {/* Nodes */}
                    {[
                      { name: 'Plan', agent: 'Planning Agent', key: 'planning' },
                      { name: 'Generate', agent: 'Generator Agent', key: 'generating' },
                      { name: 'Execute', agent: 'Execution Agent', key: 'executing' },
                      { name: 'Analyze', agent: 'Bug Analysis Agent', key: 'analyzing' },
                      { name: 'Report', agent: 'Report Agent', key: 'reporting' }
                    ].map((stepNode, idx) => {
                      const isCompleted = 
                        (liveStatus === 'completed') ||
                        (stepNode.key === 'planning' && ['generating', 'executing', 'analyzing', 'reporting'].includes(liveStatus)) ||
                        (stepNode.key === 'generating' && ['executing', 'analyzing', 'reporting'].includes(liveStatus)) ||
                        (stepNode.key === 'executing' && ['analyzing', 'reporting'].includes(liveStatus)) ||
                        (stepNode.key === 'analyzing' && ['reporting'].includes(liveStatus));
                      
                      const isActive = liveStatus === stepNode.key;
                      
                      return (
                        <div 
                          key={stepNode.name} 
                          className={`workflow-step-node ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                        >
                          <div className="workflow-step-icon">
                            {isCompleted ? '✓' : isActive ? '⚙️' : idx + 1}
                          </div>
                          <span className="workflow-step-name">{stepNode.name}</span>
                          <span className="workflow-step-agent">{stepNode.agent}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Terminal console logs */}
                  <h4 style={{fontSize: '14px', marginBottom: '10px', color: 'var(--text-main)', fontWeight: '700'}}>Live Execution Logs</h4>
                  <div className="console-logs-wrapper">
                    {liveLogs.map((log, i) => (
                      <div key={i} className="console-log-line">
                        [{new Date().toLocaleTimeString()}] {log}
                      </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>
                  
                  <div style={{display: 'flex', justifyContent: 'center'}}>
                    <div className="badge running">AI Agents orchestrating execution...</div>
                  </div>
                </div>
              )}

              {/* Execution Results View */}
              {executionState === 'finished' && (
                <div style={{animation: 'fadeInUp 0.3s'}}>
                  <div className="card-panel results-header-card glow-purple">
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px'}}>
                      <div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
                          <span className="badge passed" style={{fontSize: '11px'}}>Audit Complete</span>
                          <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{selectedBrowser} Browser</span>
                        </div>
                        <h2 style={{fontSize: '22px', fontWeight: '800', color: 'var(--text-main)', wordBreak: 'break-all'}}>{testUrl}</h2>
                        <p style={{color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px'}}>
                          Classification: <strong>{activePlan.site_type || 'Modern Web App'}</strong> | Stack: <strong>{Array.isArray(activePlan.technologies) ? activePlan.technologies.join(', ') : 'HTML5, CSS3'}</strong>
                        </p>
                      </div>
                      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
                        <button 
                          className="btn-secondary"
                          onClick={() => setExecutionState('idle')}
                        >
                          ← Test Another Site
                        </button>
                        <button
                          className="btn-primary"
                          onClick={(e) => {
                            e.preventDefault();
                            generatePDF();
                          }}
                        >
                          📥 Download PDF Report
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="results-grid-container">
                    {/* Left: Test Cases */}
                    <div className="card-panel">
                      <h3 className="dashboard-panel-title">Generated Test Cases</h3>
                      <div className="test-cases-list-panel">
                        {activeTestCases.map(tc => (
                          <div 
                            key={tc.id} 
                            className="test-case-item-card"
                            onClick={() => setSelectedTestCase(selectedTestCase?.id === tc.id ? null : tc)}
                          >
                            <div className="test-case-item-header">
                              <span className="test-case-name">{tc.id}: {tc.name}</span>
                              <span className={`badge ${(tc.status || 'PASSED') === 'PASSED' ? 'passed' : 'failed'}`}>
                                {tc.status || 'PASSED'}
                              </span>
                            </div>
                            <p className="test-case-desc">{tc.description}</p>
                            
                            {selectedTestCase?.id === tc.id && (
                              <div className="test-case-steps-details">
                                <p style={{fontSize: '12px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', color: 'var(--text-dim)'}}>Steps Evaluated:</p>
                                {tc.steps.map((step, idx) => (
                                  <div key={idx} className="step-row-bullet">
                                    <span>•</span>
                                    <span>{step}</span>
                                  </div>
                                ))}
                                {tc.error_message && (
                                  <div style={{marginTop: '12px', padding: '10px', backgroundColor: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', fontSize: '13px', color: 'var(--danger)'}}>
                                    <strong>Failure Root:</strong> {tc.error_message}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Screenshots & Bugs */}
                    <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
                      


                      {/* Bug Reports analysis */}
                      <div className="card-panel">
                        <h3 className="dashboard-panel-title">Bug Analysis & Suggested Fixes</h3>
                        {activeBugs.map(bug => (
                          <div key={bug.id} style={{padding: '16px', border: '1px solid rgba(142, 20, 50, 0.18)', backgroundColor: 'var(--wine-50)', borderRadius: '10px', marginBottom: '16px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                              <span style={{fontWeight: '700', fontSize: '15px'}}>{bug.id}: {bug.name}</span>
                              <span className="badge failed" style={{fontSize: '11px', textTransform: 'uppercase'}}>{bug.severity} Severity</span>
                            </div>
                            <p style={{fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4'}}>{bug.description}</p>
                            
                            <div style={{marginTop: '12px', fontSize: '13px'}}>
                              <p style={{fontWeight: '600', color: 'var(--text-main)'}}>Possible Root Cause:</p>
                              <p style={{color: 'var(--text-muted)', margin: '4px 0 10px 0'}}>{bug.possible_root_cause}</p>
                              
                              <p style={{fontWeight: '600', color: 'var(--text-main)'}}>Suggested Remedy:</p>
                              <p style={{color: 'var(--secondary)', marginTop: '4px'}}>{bug.suggested_fix}</p>
                            </div>
                          </div>
                        ))}
                        {activeBugs.length === 0 && (
                          <div style={{textAlign: 'center', padding: '24px', color: 'var(--text-muted)'}}>
                            🎉 Beautiful! No bugs or layout errors detected by analysis agents.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Error View */}
              {executionState === 'error' && (
                <div className="card-panel" style={{animation: 'fadeInUp 0.3s', border: '1px solid rgba(239, 68, 68, 0.4)'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px'}}>
                    <span style={{fontSize: '28px'}}>⚠️</span>
                    <div>
                      <h3 style={{color: '#ef4444', fontSize: '18px', fontWeight: '700'}}>Execution Pipeline Alert</h3>
                      <p style={{color: 'var(--text-muted)', fontSize: '13px'}}>
                        {errorMessage || 'The automated QA pipeline could not complete the operation.'}
                      </p>
                    </div>
                  </div>

                  <div className="console-logs-wrapper" style={{marginBottom: '20px'}}>
                    {liveLogs.map((log, i) => (
                      <div key={i} className="console-log-line" style={{color: log.includes('❌') || log.includes('ERROR') ? '#ef4444' : 'inherit'}}>
                        [{new Date().toLocaleTimeString()}] {log}
                      </div>
                    ))}
                  </div>

                  <div style={{display: 'flex', gap: '12px', justifyContent: 'flex-end'}}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => {
                        setExecutionState('idle');
                        setErrorMessage(null);
                      }}
                    >
                      ← Back to Form
                    </button>
                    <button 
                      className="btn-primary" 
                      onClick={handleStartTesting}
                    >
                      🔄 Retry Testing
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTORY LOGS */}
          {activeTab === 'history' && (
            <div className="card-panel glow-purple" style={{animation: 'fadeInUp 0.3s'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <h3 className="dashboard-panel-title" style={{margin: 0}}>Audit History Log</h3>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span className="badge passed" style={{fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                    ☁️ Supabase Cloud DB
                  </span>
                  <button
                    className="btn-secondary"
                    style={{padding: '4px 10px', fontSize: '11px'}}
                    onClick={() => fetchHistory(authUser?.id)}
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Target Website</th>
                      <th>Tested Browser</th>
                      <th>Success rate</th>
                      <th>Bugs Count</th>
                      <th>Completion Date</th>
                      <th>Details & Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map(h => (
                      <tr key={h.id}>
                        <td style={{fontWeight: '600'}}>{h.url}</td>
                        <td>{h.browser}</td>
                        <td>
                          <span className={`badge ${h.success_rate >= 90 ? 'passed' : 'failed'}`}>
                            {h.success_rate}%
                          </span>
                        </td>
                        <td>{h.bugs_count} bugs</td>
                        <td>{new Date(h.timestamp).toLocaleString()}</td>
                        <td>
                          <div style={{display: 'flex', gap: '8px'}}>
                            <button 
                              className="btn-secondary" 
                              style={{padding: '6px 12px', fontSize: '12px'}}
                              onClick={() => {
                                setActiveTestCases(h.test_results || []);
                                setActiveBugs(h.bugs || []);
                                setActivePlan(h.plan || {});
                                setActiveReportUrl(h.report_url);
                                setTestUrl(h.url);
                                setExecutionState('finished');
                                setActiveTab('testing');
                              }}
                            >
                              View Details
                            </button>
                            <button 
                              className="btn-secondary" 
                              style={{padding: '6px 12px', fontSize: '12px'}}
                              onClick={() => generatePDF(h)}
                            >
                              Download PDF
                            </button>
                            <button 
                              className="btn-secondary" 
                              style={{padding: '6px 10px', fontSize: '12px', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.4)'}}
                              onClick={(e) => handleDeleteHistoryItem(h.id, e)}
                              title="Delete permanently from Supabase database"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredHistory.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{textAlign: 'center', color: 'var(--text-muted)', padding: '24px'}}>
                          No audit histories match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: WEBSITES INFO */}
          {activeTab === 'websites' && (
            <div className="card-panel glow-purple" style={{animation: 'fadeInUp 0.3s'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <h3 className="dashboard-panel-title" style={{margin: 0}}>Website Crawl Details</h3>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span className="badge passed" style={{fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                    ☁️ Supabase Cloud DB
                  </span>
                  <button
                    className="btn-secondary"
                    style={{padding: '4px 10px', fontSize: '11px'}}
                    onClick={() => fetchWebsites(authUser?.id)}
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>URL Link</th>
                      <th>Crawled Title</th>
                      <th>Category</th>
                      <th>Framework / Tech Stack</th>
                      <th>Last Audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWebsites.map((web, idx) => {
                      const techList = web.technologies || web.info?.technologies || ['HTML5', 'CSS3'];
                      const title = web.title || web.info?.title || 'Audited Web App';
                      const siteType = web.site_type || web.info?.site_type || 'Landing Page';
                      const lastTested = web.last_tested || web.timestamp || new Date().toISOString();

                      return (
                        <tr key={web.id || idx}>
                          <td style={{fontWeight: '600', color: 'var(--secondary)'}}>{web.url}</td>
                          <td>{title}</td>
                          <td>{siteType}</td>
                          <td>
                            <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                              {Array.isArray(techList) && techList.length > 0 ? (
                                techList.map(t => (
                                  <span key={t} className="badge pending" style={{fontSize: '10px', padding: '2px 8px'}}>{t}</span>
                                ))
                              ) : (
                                <span className="badge pending" style={{fontSize: '10px', padding: '2px 8px'}}>HTML5 / CSS3</span>
                              )}
                            </div>
                          </td>
                          <td>{new Date(lastTested).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    {filteredWebsites.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{textAlign: 'center', color: 'var(--text-muted)', padding: '24px'}}>
                          No website profiles tracked. Run an audit to log structural metadata.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PROFILE & SETTINGS */}
          {activeTab === 'profile' && (
            <div className="card-panel glow-purple" style={{animation: 'fadeInUp 0.3s'}}>
              <div className="profile-form-grid">
                {/* Left side */}
                <div className="avatar-upload-box">
                  <div className="avatar-large">QA</div>
                  <h3 style={{fontSize: '18px', fontWeight: '700', marginBottom: '4px'}}>{profile.name}</h3>
                  <p style={{fontSize: '13px', color: 'var(--text-muted)'}}>{profile.role}</p>
                </div>

                {/* Right side form */}
                <form onSubmit={handleUpdateProfile}>
                  <div className="input-row">
                    <div className="input-group">
                      <label className="input-label" htmlFor="profile-name">Full Name</label>
                      <input 
                        id="profile-name"
                        type="text" 
                        className="input-field" 
                        value={profile.name}
                        onChange={(e) => setProfile({...profile, name: e.target.value})}
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" htmlFor="profile-role">Designated Role</label>
                      <input 
                        id="profile-role"
                        type="text" 
                        className="input-field" 
                        value={profile.role}
                        onChange={(e) => setProfile({...profile, role: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label" htmlFor="gemini-key">Google Gemini API Key (Optional)</label>
                    <input 
                      id="gemini-key"
                      type="password" 
                      className="input-field" 
                      placeholder="AI Agent API Key..." 
                      value={profile.gemini_api_key}
                      onChange={(e) => setProfile({...profile, gemini_api_key: e.target.value})}
                    />
                    <p style={{color: 'var(--text-dim)', fontSize: '11px', marginTop: '6px'}}>
                      Allows the Planning, Generator, and Bug Analysis Agents to run real dynamic reasoning instead of standard mock heuristics.
                    </p>
                  </div>

                  <div className="input-row">
                    <div className="input-group">
                      <label className="input-label" htmlFor="default-browser">Default Audit Browser</label>
                      <select 
                        id="default-browser"
                        className="select-field" 
                        value={profile.default_browser}
                        onChange={(e) => setProfile({...profile, default_browser: e.target.value})}
                      >
                        <option value="Chrome">Chrome</option>
                        <option value="Firefox">Firefox</option>
                        <option value="Safari">Safari</option>
                      </select>
                    </div>
                    
                    <div className="input-group">
                      <label className="input-label" htmlFor="screenshot-quality">Screenshot Render Quality</label>
                      <select 
                        id="screenshot-quality"
                        className="select-field" 
                        value={profile.screenshot_quality}
                        onChange={(e) => setProfile({...profile, screenshot_quality: e.target.value})}
                      >
                        <option value="High">High (PNG 100%)</option>
                        <option value="Medium">Medium (JPEG 80%)</option>
                        <option value="Low">Low (Compressed)</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    id="btn-save-settings"
                    type="submit" 
                    className="btn-primary" 
                    style={{marginTop: '12px'}}
                  >
                    Save Configuration Settings
                  </button>
                </form>
              </div>

              {/* Supabase Cloud Account Status */}
              <div style={{
                marginTop: '24px',
                padding: '18px 20px',
                background: 'var(--wine-50)',
                border: '1px solid rgba(142, 20, 50, 0.15)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--wine-900)' }}>Supabase Authentication</span>
                    {session ? (
                      <span className="badge passed" style={{ fontSize: '10px' }}>Active Session</span>
                    ) : (
                      <span className="badge pending" style={{ fontSize: '10px' }}>Guest Demo Mode</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
                    {session
                      ? `Connected as ${authUser?.email} • ID: ${authUser?.id?.slice(0, 12)}...`
                      : 'Operating in Guest Demo Mode. Sign in with Supabase to persist cloud test audits.'}
                  </p>
                </div>

                <div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSignOut}
                    style={{ fontSize: '12.5px', padding: '8px 16px', cursor: 'pointer' }}
                  >
                    {session ? 'Sign Out of Supabase ⎋' : 'Sign In with Supabase →'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
