import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api');

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  
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

  // Check backend health & fetch initial data
  useEffect(() => {
    checkBackendHealth();
    fetchProfile();
    fetchHistory();
    fetchWebsites();

    const healthInterval = setInterval(checkBackendHealth, 4000);
    return () => clearInterval(healthInterval);
  }, []);

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
        setBackendConnected(true);
      }
    } catch (e) {
      setBackendConnected(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const r = await fetch(`${API_BASE}/test/history`);
      if (r.ok) {
        const data = await r.json();
        setHistory(data);
        setBackendConnected(true);
      } else {
        setHistory([]);
      }
    } catch (e) {
      setBackendConnected(false);
      setHistory([]);
    }
  };

  const fetchWebsites = async () => {
    try {
      const r = await fetch(`${API_BASE}/websites`);
      if (r.ok) {
        const data = await r.json();
        setWebsites(data);
        setBackendConnected(true);
      } else {
        setWebsites([]);
      }
    } catch (e) {
      setBackendConnected(false);
      setWebsites([]);
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
          fetchHistory();
          fetchWebsites();
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
      `Target URL: ${formattedUrl}`,
      'Contacting Agent Pipeline on backend API (http://localhost:8000)...'
    ]);
    setLiveStatus('planning');
    setActiveTestCases([]);
    setActiveBugs([]);
    setActiveReportUrl(null);
    setActivePlan({});
    setSelectedTestCase(null);
    setCarouselIndex(0);
    setErrorMessage(null);

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
      } else {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned status HTTP ${r.status}`);
      }
    } catch (e) {
      console.error('Backend connection failed:', e);
      setBackendConnected(false);
      setExecutionState('error');
      setErrorMessage(`Backend connection failed: ${e.message || 'Cannot reach http://localhost:8000'}`);
      setLiveLogs(prev => [
        ...prev,
        '❌ CONNECTION FAILED: Unable to communicate with FastAPI backend server.',
        'Please ensure the backend server is running on http://localhost:8000.',
        'To start it, run: cd backend && python -m uvicorn app.main:app --port 8000 --reload'
      ]);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      const r = await fetch(`${API_BASE}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (r.ok) {
        alert("Settings saved successfully!");
        fetchProfile();
      }
    } catch (err) {
      alert("Settings updated locally (Backend server disconnected).");
    }
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
          <div className="user-info">
            <span className="user-name">{profile.name}</span>
            <span className="user-role">{profile.role}</span>
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
                <div className="executor-setup-container card-panel glow-purple" style={{animation: 'fadeInUp 0.3s'}}>
                  <h2 className="executor-title">Initiate Quality Assurance Audit</h2>
                  <p className="executor-desc">
                    Input a target website URL. Our autonomous AI Agents will examine layout hierarchies, write assertions, trigger headless validations, and log code issues.
                  </p>
                  
                  <div className="input-group">
                    <label className="input-label" htmlFor="testing-url-input">Target Website URL</label>
                    <input 
                      id="testing-url-input"
                      type="url" 
                      className="input-field" 
                      placeholder="https://example.com" 
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                    />
                  </div>

                  <div className="input-row">
                    <div className="input-group">
                      <label className="input-label" htmlFor="testing-browser-select">Execution Browser</label>
                      <select 
                        id="testing-browser-select"
                        className="select-field" 
                        value={selectedBrowser} 
                        onChange={(e) => setSelectedBrowser(e.target.value)}
                      >
                        <option value="Chrome">Chrome (Recommended)</option>
                        <option value="Firefox">Firefox</option>
                        <option value="Safari">Safari</option>
                      </select>
                    </div>

                    <div className="input-group">
                      <label className="input-label">Testing Capabilities</label>
                      <div className="types-checkbox-grid">
                        {['Functional', 'UI/UX', 'Performance', 'SEO'].map(type => (
                          <div 
                            key={type} 
                            className={`type-checkbox-card ${testingTypes.includes(type) ? 'selected' : ''}`}
                            onClick={() => toggleTestingType(type)}
                          >
                            <input 
                              type="checkbox" 
                              checked={testingTypes.includes(type)}
                              onChange={() => {}} // click on card handles it
                            />
                            <span className="type-checkbox-label">{type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button 
                    id="btn-start-testing"
                    className="btn-primary" 
                    style={{marginTop: '20px', width: '100%', justifyContent: 'center', padding: '16px'}}
                    onClick={handleStartTesting}
                    disabled={!testUrl}
                  >
                    Deploy Autonomous Agents ➔
                  </button>
                </div>
              )}

              {/* Executing Tracker View */}
              {executionState === 'running' && (
                <div className="card-panel workflow-tracker-card" style={{animation: 'fadeInUp 0.3s'}}>
                  <h3 className="dashboard-panel-title">Active Testing Pipeline: {testUrl}</h3>
                  
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
                  <h4 style={{fontSize: '14px', marginBottom: '10px'}}>Pipeline Logs</h4>
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
                  <div className="card-panel" style={{marginBottom: '32px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div>
                        <h2 style={{fontSize: '24px', fontWeight: '800'}}>{testUrl}</h2>
                        <p style={{color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px'}}>
                          Classification: <strong>{activePlan.site_type || 'Landing Page'}</strong> | Title: <strong>{activePlan.title || 'Audited Web'}</strong>
                        </p>
                      </div>
                      <div style={{display: 'flex', gap: '12px'}}>
                        <button 
                          className="btn-secondary"
                          onClick={() => setExecutionState('idle')}
                        >
                          Test Another Site
                        </button>
                        <button
                          className="btn-primary"
                          onClick={(e) => {
                            e.preventDefault();
                            generatePDF();
                          }}
                        >
                          Download PDF Report
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
              <h3 className="dashboard-panel-title">Audit History Log</h3>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Target Website</th>
                      <th>Tested Browser</th>
                      <th>Success rate</th>
                      <th>Bugs Count</th>
                      <th>Completion Date</th>
                      <th>Details</th>
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
              <h3 className="dashboard-panel-title">Website Crawl Details</h3>
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
                    {filteredWebsites.map((web, idx) => (
                      <tr key={idx}>
                        <td style={{fontWeight: '600', color: 'var(--secondary)'}}>{web.url}</td>
                        <td>{web.info?.title || 'Unknown Title'}</td>
                        <td>{web.info?.site_type || 'Landing Page'}</td>
                        <td>
                          <div style={{display: 'flex', gap: '6px'}}>
                            {web.info?.technologies && web.info.technologies.length > 0 ? (
                              web.info.technologies.map(t => (
                                <span key={t} className="badge pending" style={{fontSize: '10px', padding: '2px 8px'}}>{t}</span>
                              ))
                            ) : (
                              <span className="badge pending" style={{fontSize: '10px', padding: '2px 8px'}}>HTML5 / CSS3</span>
                            )}
                          </div>
                        </td>
                        <td>{new Date(web.last_tested).toLocaleString()}</td>
                      </tr>
                    ))}
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
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
