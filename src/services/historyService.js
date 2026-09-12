import { supabase } from './supabaseClient';
import {
  getStoredHistory,
  saveStoredHistory,
  getStoredWebsites,
  saveStoredWebsites
} from './storage';

/**
 * Fetch execution history from Supabase database with localStorage fallback and auto-sync
 * @param {string} [userId]
 */
export async function fetchTestHistory(userId = null) {
  try {
    let query = supabase
      .from('test_history')
      .select('*')
      .order('timestamp', { ascending: false });

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (!error && Array.isArray(data)) {
      if (data.length > 0) {
        // Sync to local cache
        saveStoredHistory(data);
        return data;
      } else {
        // Supabase returned empty array. Check if user has local history to migrate to Supabase
        const local = getStoredHistory();
        if (Array.isArray(local) && local.length > 0) {
          setTimeout(() => {
            local.forEach(item => {
              saveTestRunToDatabase(item, userId).catch(() => {});
            });
          }, 100);
          return local;
        }
        return [];
      }
    } else if (error) {
      console.warn('Supabase history fetch query error:', error);
    }
  } catch (err) {
    console.warn('Supabase history fetch error, using local storage:', err);
  }

  // Fallback to local storage
  return getStoredHistory();
}

/**
 * Check if string is a valid UUID
 */
function isValidUUID(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Save a completed test execution run to Supabase database
 * @param {Object} runRecord
 * @param {string} [userId]
 */
export async function saveTestRunToDatabase(runRecord, userId = null) {
  const payload = {
    user_id: userId || null,
    url: runRecord.url,
    browser: runRecord.browser || 'Chrome',
    testing_types: runRecord.testing_types || ['Functional'],
    status: runRecord.status || 'completed',
    success_rate: typeof runRecord.success_rate === 'number' ? runRecord.success_rate : 100.0,
    test_cases_count: runRecord.test_cases_count || (runRecord.test_results?.length || 0),
    passed_count: runRecord.passed_count || 0,
    bugs_count: runRecord.bugs_count || 0,
    test_results: runRecord.test_results || [],
    bugs: runRecord.bugs || [],
    plan: runRecord.plan || {},
    report_url: runRecord.report_url || null,
    timestamp: runRecord.timestamp || new Date().toISOString(),
    completed_at: runRecord.completed_at || new Date().toISOString()
  };

  if (isValidUUID(runRecord.id)) {
    payload.id = runRecord.id;
  }

  try {
    const { data, error } = await supabase
      .from('test_history')
      .insert([payload])
      .select();

    if (!error && data && data.length > 0) {
      const savedRecord = data[0];
      // Update local storage cache
      const current = getStoredHistory();
      saveStoredHistory([savedRecord, ...current.filter(h => h.id !== savedRecord.id)]);
      return { success: true, record: savedRecord };
    } else if (error) {
      console.warn('Supabase test_history insert error:', error);
    }
  } catch (err) {
    console.error('Failed to save test run to Supabase:', err);
  }

  // Fallback to local storage if Supabase insert fails
  const localRecord = { ...payload, id: runRecord.id || crypto.randomUUID() };
  const current = getStoredHistory();
  saveStoredHistory([localRecord, ...current.filter(h => h.id !== localRecord.id)]);
  return { success: true, record: localRecord, fallback: true };
}

/**
 * Fetch tested websites from Supabase database with localStorage fallback and auto-sync
 * @param {string} [userId]
 */
export async function fetchTestedWebsites(userId = null) {
  try {
    let query = supabase
      .from('tested_websites')
      .select('*')
      .order('last_tested', { ascending: false });

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (!error && Array.isArray(data)) {
      if (data.length > 0) {
        // Sync to local cache
        saveStoredWebsites(data);
        return data;
      } else {
        // Check local storage for existing websites to migrate
        const local = getStoredWebsites();
        if (Array.isArray(local) && local.length > 0) {
          setTimeout(() => {
            local.forEach(site => {
              saveTestedWebsiteToDatabase(site.url, site.info || site, userId).catch(() => {});
            });
          }, 100);
          return local;
        }
        return [];
      }
    } else if (error) {
      console.warn('Supabase websites fetch query error:', error);
    }
  } catch (err) {
    console.warn('Supabase websites fetch error, using local storage:', err);
  }

  return getStoredWebsites();
}

/**
 * Save or update crawled website metadata in Supabase database
 * @param {string} url
 * @param {Object} siteInfo
 * @param {string} [userId]
 */
export async function saveTestedWebsiteToDatabase(url, siteInfo, userId = null) {
  const cleanUrl = url.trim();
  const technologies = Array.isArray(siteInfo?.technologies) && siteInfo.technologies.length > 0
    ? siteInfo.technologies
    : ['HTML5', 'CSS3'];

  try {
    // Check if website already exists
    const { data: existing } = await supabase
      .from('tested_websites')
      .select('id')
      .eq('url', cleanUrl)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing entry
      await supabase
        .from('tested_websites')
        .update({
          title: siteInfo.title || siteInfo.site_type || 'Audited Page',
          site_type: siteInfo.site_type || 'Landing Page',
          technologies,
          info: siteInfo,
          last_tested: new Date().toISOString()
        })
        .eq('id', existing[0].id);
    } else {
      // Insert new entry
      await supabase
        .from('tested_websites')
        .insert([{
          user_id: userId || null,
          url: cleanUrl,
          title: siteInfo.title || siteInfo.site_type || 'Audited Page',
          site_type: siteInfo.site_type || 'Landing Page',
          technologies,
          info: siteInfo,
          last_tested: new Date().toISOString()
        }]);
    }
  } catch (err) {
    console.warn('Failed to upsert website in Supabase:', err);
  }

  // Also update local storage cache
  const localWebsites = getStoredWebsites();
  const index = localWebsites.findIndex(w => w.url === cleanUrl);
  if (index >= 0) {
    localWebsites[index].last_tested = new Date().toISOString();
    localWebsites[index].info = siteInfo;
    saveStoredWebsites(localWebsites);
  } else {
    saveStoredWebsites([
      {
        url: cleanUrl,
        last_tested: new Date().toISOString(),
        info: siteInfo
      },
      ...localWebsites
    ]);
  }
}

/**
 * Delete a test history entry from Supabase database
 * @param {string} id
 */
export async function deleteTestHistoryItem(id) {
  try {
    await supabase
      .from('test_history')
      .delete()
      .eq('id', id);
  } catch (err) {
    console.warn('Failed to delete history item in Supabase:', err);
  }

  const current = getStoredHistory();
  saveStoredHistory(current.filter(h => h.id !== id));
}
