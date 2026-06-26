// Background Service Worker
// In Java, this acts like a background listener or a daemon thread waiting for events.

// Listener for runtime messages from popup.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'startTimer') {
    const duration = message.duration; // in minutes
    const endTime = Date.now() + duration * 60 * 1000;
    
    // Save timer state to storage
    const timerState = {
      isActive: true,
      endTime: endTime,
      duration: duration
    };
    await chrome.storage.local.set({ timerState });
    
    // Create chrome alarm to wake us up when time is up
    // In Java, this is similar to scheduling a task using ScheduledExecutorService
    chrome.alarms.create('focusTimer', { delayInMinutes: duration });
    
    // Start blocking websites
    const result = await chrome.storage.local.get('blockedDomains');
    const domains = result.blockedDomains || [];
    await enableWebsiteBlocking(domains);
    
  } else if (message.action === 'stopTimer') {
    // Manually stop the timer
    chrome.alarms.clear('focusTimer');
    
    const timerState = { isActive: false };
    await chrome.storage.local.set({ timerState });
    
    // Disable blocking rules
    await disableWebsiteBlocking();
  }
});

// Listener for when the Chrome Alarm fires
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'focusTimer') {
    // Alarm fired! Timer is complete.
    const timerState = { isActive: false };
    await chrome.storage.local.set({ timerState });
    
    // Disable blocking rules
    await disableWebsiteBlocking();
    
    // Optional: Send feedback to popup if open (handled automatically via storage listener in popup.js)
  }
});

// Helper function to register Declarative Net Request rules
// This instructs the browser's native network request engine to block specified websites.
async function enableWebsiteBlocking(domains) {
  // 1. Get and delete any existing dynamic rules to clear the slate
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map(rule => rule.id);
  
  // 2. Create the rules array
  // We use urlFilter `||domain` which matches http, https, www, etc., and subdomains
  const newRules = domains.map((domain, index) => {
    return {
      id: index + 1, // Rule IDs must be unique integers >= 1
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { extensionPath: '/blocked.html' }
      },
      condition: {
        urlFilter: `||${domain}`,
        resourceTypes: ['main_frame'] // Blocks top-level page navigations
      }
    };
  });
  
  // 3. Commit changes to Chrome
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRuleIds,
    addRules: newRules
  });
}

// Helper function to remove all active dynamic blocking rules
async function disableWebsiteBlocking() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map(rule => rule.id);
  
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRuleIds
  });
}

// Clean up rules on startup to ensure we don't accidentally leave sites blocked
// if Chrome was closed unexpectedly.
chrome.runtime.onStartup.addListener(async () => {
  const result = await chrome.storage.local.get('timerState');
  if (!result.timerState || !result.timerState.isActive) {
    await disableWebsiteBlocking();
  }
});
