// DOM Element Declarations
// In Java, this is similar to declaring GUI components (e.g., JButton, JTextField)
const settingsView = document.getElementById('settings-view');
const activeTimerView = document.getElementById('active-timer-view');
const modeBadge = document.getElementById('mode-badge');

const domainInput = document.getElementById('domain-input');
const btnAddDomain = document.getElementById('btn-add-domain');
const domainListContainer = document.getElementById('domain-list-container');

const timerSelect = document.getElementById('timer-select');
const btnStartFocus = document.getElementById('btn-start-focus');
const btnStopFocus = document.getElementById('btn-stop-focus');

const timeLeftDisplay = document.getElementById('time-left');
const progressBar = document.getElementById('progress-bar');
const statusMessage = document.getElementById('status-message');

// State Variables
let blockedDomains = [];
let countdownInterval = null;

// Initialize popup on load
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved domains and current timer state
  // In Java, this would be reading configurations from properties files or a local database
  const result = await chrome.storage.local.get(['blockedDomains', 'timerState']);
  
  if (result.blockedDomains) {
    blockedDomains = result.blockedDomains;
  }
  
  updateDomainListUI();
  checkTimerState(result.timerState);
});

// Watch for storage changes (e.g., when the background script stops the timer)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.timerState) {
    checkTimerState(changes.timerState.newValue);
  }
});

// Domain management function: sanitizes domain input
// Removes http://, https://, www., and paths/queries (e.g., https://www.facebook.com/home -> facebook.com)
function sanitizeDomain(url) {
  let cleanUrl = url.trim().toLowerCase();
  
  // Remove protocols
  if (cleanUrl.startsWith('http://')) {
    cleanUrl = cleanUrl.substring(7);
  } else if (cleanUrl.startsWith('https://')) {
    cleanUrl = cleanUrl.substring(8);
  }
  
  // Remove www.
  if (cleanUrl.startsWith('www.')) {
    cleanUrl = cleanUrl.substring(4);
  }
  
  // Remove path, query, hash (e.g. facebook.com/groups/abc -> facebook.com)
  const slashIndex = cleanUrl.indexOf('/');
  if (slashIndex !== -1) {
    cleanUrl = cleanUrl.substring(0, slashIndex);
  }
  
  // Basic validation: must contain a dot (e.g., example.com) and be at least 4 chars long
  if (!cleanUrl.includes('.') || cleanUrl.length < 4) {
    return null;
  }
  
  return cleanUrl;
}

// Add a domain to the blocklist
btnAddDomain.addEventListener('click', async () => {
  const rawInput = domainInput.value;
  const sanitized = sanitizeDomain(rawInput);
  
  if (!sanitized) {
    alert('Please enter a valid domain name (e.g., facebook.com or youtube.com).');
    return;
  }
  
  if (blockedDomains.includes(sanitized)) {
    alert('This domain is already in your blocklist.');
    return;
  }
  
  blockedDomains.push(sanitized);
  domainInput.value = '';
  
  // Save list to local storage
  await chrome.storage.local.set({ blockedDomains });
  updateDomainListUI();
});

// Add domain using the "Enter" key
domainInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    btnAddDomain.click();
  }
});

// Render the list of blocked domains in the UI
function updateDomainListUI() {
  domainListContainer.innerHTML = '';
  
  if (blockedDomains.length === 0) {
    domainListContainer.innerHTML = '<div class="empty-state">No websites blocked yet. Add some above!</div>';
    return;
  }
  
  // In Java, this loop is similar to an enhanced for loop: for (String domain : blockedDomains)
  blockedDomains.forEach((domain, index) => {
    const item = document.createElement('div');
    item.className = 'domain-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'domain-name';
    nameSpan.textContent = domain;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    `;
    
    // Attach deletion event listener to this specific delete button
    deleteBtn.addEventListener('click', async () => {
      blockedDomains.splice(index, 1); // remove item at index
      await chrome.storage.local.set({ blockedDomains });
      updateDomainListUI();
    });
    
    item.appendChild(nameSpan);
    item.appendChild(deleteBtn);
    domainListContainer.appendChild(item);
  });
}

// Check and render current state based on timer info in storage
function checkTimerState(timerState) {
  // If timerState is active, show the countdown screen, otherwise settings screen
  if (timerState && timerState.isActive) {
    settingsView.style.display = 'none';
    activeTimerView.style.display = 'flex';
    modeBadge.textContent = 'Focusing';
    modeBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    modeBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    modeBadge.style.color = '#34d399';
    
    // Start drawing the countdown clock ticks
    startCountdown(timerState.endTime, timerState.duration);
  } else {
    // Stop any existing intervals
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    
    settingsView.style.display = 'block';
    activeTimerView.style.display = 'none';
    modeBadge.textContent = 'Ready';
    modeBadge.style.background = 'rgba(99, 102, 241, 0.15)';
    modeBadge.style.borderColor = 'rgba(99, 102, 241, 0.4)';
    modeBadge.style.color = '#a5b4fc';
  }
}

// Start visual countdown display
function startCountdown(endTime, durationMinutes) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  const totalDurationMs = durationMinutes * 60 * 1000;
  
  const updateClock = () => {
    const now = Date.now();
    const timeLeftMs = endTime - now;
    
    if (timeLeftMs <= 0) {
      clearInterval(countdownInterval);
      timeLeftDisplay.textContent = '00:00';
      updateProgressCircle(0);
      return;
    }
    
    // Formatting minutes and seconds
    const minutes = Math.floor(timeLeftMs / (60 * 1000));
    const seconds = Math.floor((timeLeftMs % (60 * 1000)) / 1000);
    
    const displayMin = String(minutes).padStart(2, '0');
    const displaySec = String(seconds).padStart(2, '0');
    timeLeftDisplay.textContent = `${displayMin}:${displaySec}`;
    
    // Update progress circle offset (377 is total circumference)
    const progressFraction = timeLeftMs / totalDurationMs;
    updateProgressCircle(progressFraction);
  };
  
  // Run once immediately, then every second
  updateClock();
  countdownInterval = setInterval(updateClock, 1000);
}

// Set SVG circle progress dash offset based on percentage
function updateProgressCircle(fraction) {
  const maxOffset = 377; // full circumference of 2 * pi * r (60)
  const offset = maxOffset * (1 - fraction);
  progressBar.style.strokeDashoffset = offset;
}

// Start Timer Action Button
btnStartFocus.addEventListener('click', () => {
  if (blockedDomains.length === 0) {
    alert('Please add at least one website to your blocked list before starting a focus session!');
    return;
  }
  
  const minutes = parseInt(timerSelect.value, 10);
  
  // Send message to the background service worker (background.js)
  // In Java, this is analogous to message parsing or triggering an event dispatcher
  chrome.runtime.sendMessage({
    action: 'startTimer',
    duration: minutes
  });
});

// Stop Timer Action Button
btnStopFocus.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    action: 'stopTimer'
  });
});
