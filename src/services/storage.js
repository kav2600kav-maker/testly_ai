// Local storage service for Testly AI

const DEFAULT_PROFILE = {
  name: "kavya",
  role: "Tester",
  avatar: "",
  gemini_api_key: import.meta.env.VITE_GEMINI_API_KEY || "",
  default_browser: "Chrome",
  screenshot_quality: "High",
  notifications_enabled: true
};

const INITIAL_HISTORY = [
  {
    id: "285d10e0-a400-49da-b7fe-241f34ee6240",
    url: "https://example.com",
    browser: "Chrome",
    testing_types: ["Functional", "UI/UX", "Performance", "SEO"],
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    completed_at: new Date(Date.now() - 3600000 * 2 + 5000).toISOString(),
    success_rate: 80.0,
    test_cases_count: 5,
    passed_count: 4,
    bugs_count: 1,
    test_results: [
      {
        id: "TC-001",
        name: "Verify Main Homepage Load and Responsive Structure",
        category: "Functional / SEO",
        steps: [
          "Sent HTTP request to target URL",
          "Received HTTP status: 200 OK",
          "Extracted page title and verified meta tags",
          "HTML Body structure verified: Present",
          "DOM audit completed successfully"
        ],
        status: "PASSED",
        error_message: null,
        duration_seconds: 0.2
      },
      {
        id: "TC-002",
        name: "Validate Link Integrity & Hyperlinks",
        category: "Functional / Navigation",
        steps: [
          "Scanning page for anchor tags (<a href>)...",
          "Discovered active hyperlink elements",
          "Tested sampled route URLs",
          "Link integrity check passed across all sampled routes"
        ],
        status: "PASSED",
        error_message: null,
        duration_seconds: 0.35
      },
      {
        id: "TC-003",
        name: "Verify Image Assets and Media Accessibility",
        category: "UI/UX / Accessibility",
        steps: [
          "Scanning page for image elements (<img>)...",
          "Audited primary images for accessibility alt attributes",
          "Found 1 image lacking descriptive 'alt' tag",
          "Flagged minor accessibility warning"
        ],
        status: "FAILED",
        error_message: "Accessibility warning: 1 image missing 'alt' attribute",
        duration_seconds: 0.28
      },
      {
        id: "TC-004",
        name: "Form Inputs and Interactive Elements Check",
        category: "Functional",
        steps: [
          "Auditing page for interactive input fields and buttons",
          "Verified form controls have associated labels and attributes",
          "Interactive element verification completed"
        ],
        status: "PASSED",
        error_message: null,
        duration_seconds: 0.19
      },
      {
        id: "TC-005",
        name: "Performance Latency and TTFB Audit",
        category: "Performance",
        steps: [
          "Measured Time To First Byte (TTFB)",
          "Audit duration: 0.42s (within recommended < 0.8s SLA)",
          "Performance benchmark satisfied"
        ],
        status: "PASSED",
        error_message: null,
        duration_seconds: 0.42
      }
    ],
    bugs: [
      {
        id: "BUG-001",
        test_case_id: "TC-003",
        name: "Missing Alternative Text on Image Elements",
        severity: "Medium",
        description: "Image element detected without required 'alt' attribute, impacting screen readers and SEO indexing score.",
        steps_to_reproduce: [
          "Navigate to target URL",
          "Inspect image elements on the main landing container",
          "Observe missing alt='' attribute on banner image"
        ],
        possible_root_cause: "Static asset rendered without fallback alt description tag.",
        suggested_fix: "Add descriptive alt='Company Banner' attribute to all <img> tags."
      }
    ]
  }
];

const INITIAL_WEBSITES = [
  {
    url: "https://example.com",
    last_tested: new Date(Date.now() - 3600000 * 2).toISOString(),
    info: {
      site_type: "Landing Page / Web App",
      technologies: ["React", "HTML5", "CSS3"],
      success_rate: 80.0
    }
  }
];

export const getStoredProfile = () => {
  try {
    const raw = localStorage.getItem("testly_profile");
    return raw ? JSON.parse(raw) : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
};

export const saveStoredProfile = (profile) => {
  try {
    localStorage.setItem("testly_profile", JSON.stringify(profile));
  } catch (e) {
    console.warn("Could not save profile to localStorage:", e);
  }
  return profile;
};

export const getStoredHistory = () => {
  try {
    const raw = localStorage.getItem("testly_history");
    return raw ? JSON.parse(raw) : INITIAL_HISTORY;
  } catch {
    return INITIAL_HISTORY;
  }
};

export const addStoredHistoryEntry = (entry) => {
  try {
    const history = getStoredHistory();
    const updated = [entry, ...history];
    localStorage.setItem("testly_history", JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn("Could not save history to localStorage:", e);
    return [entry];
  }
};

export const getStoredWebsites = () => {
  try {
    const raw = localStorage.getItem("testly_websites");
    return raw ? JSON.parse(raw) : INITIAL_WEBSITES;
  } catch {
    return INITIAL_WEBSITES;
  }
};

export const addStoredWebsite = (url, info) => {
  try {
    const websites = getStoredWebsites().filter(w => w.url !== url);
    const updated = [
      {
        url,
        last_tested: new Date().toISOString(),
        info
      },
      ...websites
    ];
    localStorage.setItem("testly_websites", JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn("Could not save websites to localStorage:", e);
    return [];
  }
};
