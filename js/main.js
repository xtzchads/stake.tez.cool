let allBakers = [];
let filteredBakers = [];
let client = new beacon.DAppClient({
  name: 'Staking Assistant'
});
let flag = false;
let permissions = null;
let promoted = [
  'tz1Yjryh3tpFHQG73dofJNatR21KUdRDu7mH',
  'tz1brWSr91ZygR4gi5o19yo8QMff926y2B5e',
  'tz1bdTgmF8pzBH9chtJptsjjrh5UfSXp1SQ4',
  'tz1cXUERthGxHcDVAdKsFiFa4sSWbuGorghY',
  'tz1exWwgsENRgBQKrjvo4xdhG18mRov1kjJa',
  'tz1i36vhJwdv75p4zfRu3TPyqhaXyxDWGoz9'
];
let currentPage = 1;
let entriesPerPage = 25;
let totalBakers = 0;

// Connected / inspected account state
let currentAccountState = {
  address: null,
  balanceMutez: 0,
  stakedMutez: 0,
  unstakedMutez: 0,
  delegateAddress: null,
  delegateAlias: null,
  isWatchOnly: false
};

// Sorting state
let sortState = {
  field: 'promoted', // 'promoted' | 'fee' | 'freeSpace' | 'dal' | 'alias'
  direction: 'asc'   // 'asc' | 'desc'
};

let listenersBound = false;
let toastTimer = null;

// ============================================================================
// Formatting & Sanitization Helpers
// ============================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeText(str) {
  return escapeHtml(str);
}

function shortenAddress(addr) {
  if (!addr || addr.length < 14) return addr || '';
  return `${addr.slice(0, 7)}...${addr.slice(-4)}`;
}

function formatTezCompact(amount) {
  const num = Number(amount) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M ꜩ`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K ꜩ`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 2 })} ꜩ`;
}

function buildFallbackAvatarDataUri(label) {
  const clean = String(label || 'T').replace(/^[^a-zA-Z0-9]+/, '');
  const initial = (clean.charAt(0) || 'T').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#312e81"/><text x="50%" y="54%" font-family="Inter,sans-serif" font-size="28" font-weight="700" fill="#c7d2fe" text-anchor="middle" dominant-baseline="middle">${encodeURIComponent(initial)}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

function handleAvatarError(imgEl, fallbackLabel) {
  if (!imgEl || imgEl.dataset.fallbackApplied) return;
  imgEl.dataset.fallbackApplied = 'true';
  imgEl.src = buildFallbackAvatarDataUri(fallbackLabel);
}

function copyToClipboard(text, label = 'Address') {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showNotification(`Copied ${label}: ${shortenAddress(text)}`);
    })
    .catch(() => {
      showNotification(`Copied ${label}`, false);
    });
}

// ============================================================================
// Amount Helpers (MAX & Quick Percentages)
// ============================================================================

function getSpendableBalanceTez() {
  if (currentAccountState.balanceMutez > 0) {
    // In TzKT, account.balance includes stakedBalance and unstakedBalance
    const liquidMutez = Math.max(
      0,
      currentAccountState.balanceMutez - currentAccountState.stakedMutez - currentAccountState.unstakedMutez
    );
    const effectiveMutez = liquidMutez > 0 ? liquidMutez : currentAccountState.balanceMutez;
    return effectiveMutez / 1_000_000;
  }

  // Fallback: read from DOM .wallet-stat if populated externally
  const walletInfoDiv = document.getElementById('walletInfo');
  if (!walletInfoDiv) return 0;
  let balance = 0;
  walletInfoDiv.querySelectorAll('.wallet-stat').forEach((stat) => {
    const label = stat.querySelector('.wallet-stat-label');
    const value = stat.querySelector('.wallet-stat-value');
    if (label && (label.textContent.trim() === 'Balance' || label.textContent.trim() === 'Spendable') && value) {
      const balanceText = value.textContent.replace(/[,ꜩ\s]/g, '').trim();
      balance = parseFloat(balanceText) || 0;
    }
  });
  return balance;
}

function setPercentageAmount(pct) {
  const amountInput = document.getElementById('amountInput');
  const walletInfoDiv = document.getElementById('walletInfo');
  if ((!permissions?.address && !currentAccountState.address) || !walletInfoDiv || walletInfoDiv.style.display === 'none') {
    showNotification('Please connect your wallet first', true);
    return;
  }

  const spendable = getSpendableBalanceTez();
  if (spendable <= 0) {
    showNotification('No spendable balance available', true);
    return;
  }

  const reserve = pct >= 1 ? 0.1 : 0;
  const targetAmount = Math.max(0, spendable * pct - reserve);
  amountInput.value = targetAmount > 0 ? Number(targetAmount.toFixed(6)) : '';
  amountInput.focus();
}

function setMaxAmount() {
  setPercentageAmount(1);
}

// ============================================================================
// Pagination Controls
// ============================================================================

function changeEntriesPerPage() {
  const selectEl = document.getElementById('entriesPerPage');
  if (selectEl) {
    entriesPerPage = parseInt(selectEl.value, 10) || 25;
  }
  currentPage = 1;
  renderBakerTable();
  updatePagination();
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    renderBakerTable();
    updatePagination();
  }
}

function nextPage() {
  const totalPages = Math.ceil(totalBakers / entriesPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderBakerTable();
    updatePagination();
  }
}

function goToPage(page) {
  currentPage = page;
  renderBakerTable();
  updatePagination();
}

function updatePagination() {
  const totalPages = Math.ceil(totalBakers / entriesPerPage);
  const startEntry = totalBakers > 0 ? (currentPage - 1) * entriesPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * entriesPerPage, totalBakers);

  const infoEl = document.getElementById('paginationInfo');
  if (infoEl) {
    infoEl.textContent =
      totalBakers > 0
        ? `Showing ${startEntry}–${endEntry} of ${totalBakers} bakers`
        : 'No matching bakers';
  }

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages || totalPages === 0;

  const pagination = document.getElementById('pagination');
  if (!pagination) return;

  pagination.querySelectorAll('.page-btn:not(#prevBtn):not(#nextBtn), .page-ellipsis').forEach((el) => el.remove());

  if (totalPages <= 0) return;

  // Build compact page list with ellipsis if many pages
  const pagesToShow = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
  } else {
    pagesToShow.push(1);
    if (currentPage > 3) pagesToShow.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pagesToShow.push(i);
    if (currentPage < totalPages - 2) pagesToShow.push('...');
    pagesToShow.push(totalPages);
  }

  pagesToShow.forEach((item) => {
    if (item === '...') {
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '…';
      pagination.insertBefore(span, nextBtn);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-btn ${item === currentPage ? 'active' : ''}`;
      btn.textContent = item;
      btn.onclick = () => goToPage(item);
      pagination.insertBefore(btn, nextBtn);
    }
  });
}

// ============================================================================
// Baker Table Rendering & KPI Stats
// ============================================================================

function updateKpiStats() {
  const countValEl = document.getElementById('stat-bakers-val');
  const countMetaEl = document.getElementById('stat-bakers-meta');
  const spaceValEl = document.getElementById('stat-space-val');
  const spaceMetaEl = document.getElementById('stat-space-meta');
  const feeValEl = document.getElementById('stat-fee-val');
  const feeMetaEl = document.getElementById('stat-fee-meta');
  const stakedValEl = document.getElementById('stat-staked-val');
  const stakedMetaEl = document.getElementById('stat-staked-meta');

  const sourceList = filteredBakers.length > 0 ? filteredBakers : allBakers;
  const totalFreeSpace = sourceList.reduce((acc, b) => acc + Math.max(0, b.balance || 0), 0);
  const avgFee =
    sourceList.length > 0
      ? sourceList.reduce((acc, b) => acc + b.feeNum, 0) / sourceList.length
      : 0;
  const totalExternalStaked = sourceList.reduce((acc, b) => acc + Math.max(0, b.externalStaked || 0), 0);

  if (countValEl) countValEl.textContent = `${filteredBakers.length} Bakers`;
  if (countMetaEl) countMetaEl.textContent = `Out of ${allBakers.length} active staking bakers`;

  if (spaceValEl) spaceValEl.textContent = formatTezCompact(totalFreeSpace);
  if (spaceMetaEl) spaceMetaEl.textContent = 'Available external stake capacity';

  if (feeValEl) feeValEl.textContent = `${avgFee.toFixed(2)}%`;
  if (feeMetaEl) feeMetaEl.textContent = 'Average baker staking fee';

  if (stakedValEl) stakedValEl.textContent = formatTezCompact(totalExternalStaked);
  if (stakedMetaEl) stakedMetaEl.textContent = 'Total XTZ staked by delegators';
}

function renderBakerTable() {
  const table = document.getElementById('delegateTable');
  if (!table) return;
  const tableBody = table.querySelector('tbody');
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const pageData = filteredBakers.slice(startIndex, endIndex);

  tableBody.innerHTML = '';

  if (pageData.length === 0) {
    const emptyRow = tableBody.insertRow();
    const cell = emptyRow.insertCell(0);
    cell.colSpan = 4;
    cell.innerHTML = `
      <div class="table-state-box">
        <i class="fa-solid fa-filter-circle-xmark" style="font-size:1.6rem;color:var(--accent-primary);margin-bottom:8px;"></i>
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">No bakers match your current filters</div>
        <div style="font-size:0.76rem;">Try clearing the search query or toggling off "Low fees" / "Public bakers".</div>
      </div>
    `;
    return;
  }

  const currentUserBaker = currentAccountState.delegateAddress;

  pageData.forEach((delegate) => {
    const isCurrentBaker = currentUserBaker && delegate.address === currentUserBaker;
    const row = tableBody.insertRow();
    if (delegate.isPromoted) row.classList.add('promoted-row');
    if (isCurrentBaker) row.classList.add('current-baker-row');

    const cell1 = row.insertCell(0);
    const cell2 = row.insertCell(1);
    const cell3 = row.insertCell(2);
    const cell4 = row.insertCell(3);

    const safeAddr = sanitizeText(delegate.address);
    const safeName = sanitizeText(delegate.name);
    const shortAddr = shortenAddress(delegate.address);
    const avatarUrl = `https://services.tzkt.io/v1/avatars/${encodeURIComponent(delegate.address)}`;

    // Column 1: Baker Identity (Avatar, Name, Featured/Your Baker Tags, Short Address + Copy)
    cell1.innerHTML = `
      <div class="baker-cell">
        <div class="baker-avatar-wrap">
          <img class="baker-avatar" src="${avatarUrl}" alt="${safeName}" loading="lazy" />
          ${delegate.isPromoted ? '<span class="promoted-star-badge" title="Featured Baker">&#9733;</span>' : ''}
        </div>
        <div class="baker-info">
          <div class="baker-name-line">
            <a class="baker-name-link" href="https://tzkt.io/${safeAddr}" target="_blank" rel="noopener noreferrer" title="View ${safeName} on TzKT">
              ${safeName}
            </a>
            ${delegate.isPromoted ? '<span class="baker-tag featured">&#9733; Featured</span>' : ''}
            ${isCurrentBaker ? '<span class="baker-tag yours">Your Baker</span>' : ''}
          </div>
          <div class="baker-address-sub">
            <span>${escapeHtml(shortAddr)}</span>
            <button type="button" class="copy-mini-btn" data-copy="${safeAddr}" title="Copy baker address">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    const imgEl = cell1.querySelector('.baker-avatar');
    if (imgEl) {
      imgEl.addEventListener('error', () => handleAvatarError(imgEl, delegate.name));
    }
    const copyBtn = cell1.querySelector('.copy-mini-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(delegate.address, delegate.name);
      });
    }

    // Column 2: Free Space & Capacity Bar
    const usedPctClamped = Math.max(0, Math.min(100, delegate.usedPercentage || 0));
    const freeSpaceFormatted = `${delegate.balance.toLocaleString()} ꜩ`;
    cell2.className = 'space-cell';
    cell2.innerHTML = `
      <div class="space-top-line">
        <span class="space-amount">${escapeHtml(freeSpaceFormatted)}</span>
        <span class="space-pct" title="External stake capacity used: ${usedPctClamped.toFixed(1)}%">${usedPctClamped.toFixed(0)}% full</span>
      </div>
      ${delegate.progressBar}
    `;

    // Column 3: Fee (%)
    const isLowFee = delegate.feeNum <= 15;
    cell3.innerHTML = `<span class="fee-badge ${isLowFee ? 'low-fee' : ''}">${escapeHtml(delegate.edgeOfBakingOverStaking)}</span>`;

    // Column 4: Select / Delegate Action
    cell4.style.textAlign = 'right';
    if (isCurrentBaker && !currentAccountState.isWatchOnly) {
      cell4.innerHTML = `
        <button type="button" class="btn-select-baker active-baker" onclick="delegateTez('${safeAddr}', this)" title="Already delegated to this baker">
          <i class="fa-solid fa-check"></i>
          <span>Active</span>
        </button>
      `;
    } else {
      cell4.innerHTML = `
        <button type="button" class="btn-select-baker" onclick="delegateTez('${safeAddr}', this)">
          <i class="fa-solid fa-hand-pointer"></i>
          <span>Select</span>
        </button>
      `;
    }
  });
}

// ============================================================================
// Sorting & Filtering
// ============================================================================

function sortBakersList(list) {
  const sorted = [...list];
  const dir = sortState.direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    if (sortState.field === 'promoted') {
      if (a.isPromoted !== b.isPromoted) {
        return a.isPromoted ? -1 : 1;
      }
      return a.feeNum - b.feeNum;
    }
    if (sortState.field === 'fee') {
      if (a.feeNum !== b.feeNum) return (a.feeNum - b.feeNum) * dir;
      return b.balance - a.balance;
    }
    if (sortState.field === 'freeSpace') {
      if (a.balance !== b.balance) return (a.balance - b.balance) * dir;
      return a.feeNum - b.feeNum;
    }
    if (sortState.field === 'alias') {
      return a.name.localeCompare(b.name) * dir;
    }
    return 0;
  });

  return sorted;
}

function updateSortIndicatorsUI() {
  const headers = {
    alias: document.getElementById('aliasHeader'),
    freeSpace: document.getElementById('freeSpaceHeader'),
    fee: document.getElementById('feeHeader')
  };

  Object.entries(headers).forEach(([key, th]) => {
    if (!th) return;
    const isActive = sortState.field === key;
    th.classList.toggle('active-sort', isActive);
    const ind = th.querySelector('.sort-indicator');
    if (ind) {
      if (!isActive) {
        ind.innerHTML = '<i class="fa-solid fa-sort"></i>';
      } else {
        ind.innerHTML =
          sortState.direction === 'asc'
            ? '<i class="fa-solid fa-sort-up"></i>'
            : '<i class="fa-solid fa-sort-down"></i>';
      }
    }
  });

  document.querySelectorAll('#sort-mode-control .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sort === sortState.field);
  });
}

function setSortField(field, explicitDirection = null) {
  if (explicitDirection) {
    sortState.field = field;
    sortState.direction = explicitDirection;
  } else if (sortState.field === field) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.field = field;
    sortState.direction = field === 'freeSpace' ? 'desc' : 'asc';
  }
  updateSortIndicatorsUI();
  currentPage = 1;
  applyFilter();
}

function applyFilter() {
  const lowFeesToggle = document.getElementById('toggleAllBakers');
  const publicToggle = document.getElementById('toggleAliasBakers');
  const searchInput = document.getElementById('bakerSearchInput');

  const onlyLowFees = lowFeesToggle ? lowFeesToggle.checked : true;
  const onlyPublicBakers = publicToggle ? publicToggle.checked : true;
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) {
    clearBtn.style.display = searchQuery.length > 0 ? 'inline-flex' : 'none';
  }

  let result = [...allBakers];

  if (onlyLowFees) {
    result = result.filter((delegate) => delegate.feeNum <= 40);
  }

  if (onlyPublicBakers) {
    result = result.filter((delegate) => delegate.name !== delegate.address);
  }

  if (searchQuery) {
    result = result.filter(
      (delegate) =>
        delegate.name.toLowerCase().includes(searchQuery) ||
        delegate.address.toLowerCase().includes(searchQuery)
    );
  }

  filteredBakers = sortBakersList(result);
  totalBakers = filteredBakers.length;
  currentPage = 1;

  updateKpiStats();
  renderBakerTable();
  updatePagination();
}

// ============================================================================
// Fetch Baker Data from TzKT
// ============================================================================

async function fetchDelegateData() {
  const table = document.getElementById('delegateTable');
  const refreshBtn = document.getElementById('refreshBakersBtn');
  if (refreshBtn) {
    const icon = refreshBtn.querySelector('i');
    if (icon) icon.classList.add('fa-spin');
  }

  try {
    const response = await fetch('https://api.tzkt.io/v1/delegates?limit=10000&active=true');
    const data = await response.json();
    const parsedBakers = [];

    data.forEach((delegate) => {
      if (delegate.limitOfStakingOverBaking && delegate.limitOfStakingOverBaking > 0) {
        const address = delegate.address;
        const alias = delegate.alias || delegate.address;
        const capLimit = Math.min(9_000_000, delegate.limitOfStakingOverBaking);

        const freeBalanceFloat =
          (delegate.stakedBalance * (capLimit / 1_000_000) - delegate.externalStakedBalance) / 1_000_000;
        const feeFloat = delegate.edgeOfBakingOverStaking / 10_000_000;
        const edgeOfBakingOverStaking = feeFloat.toFixed(2);

        const maxValue = (delegate.stakedBalance * (capLimit / 1_000_000)) / 1_000_000;
        const currentValue = delegate.externalStakedBalance / 1_000_000;

        let percentage = maxValue > 0 ? (currentValue / maxValue) * 100 : 100;
        const clampedWidth = Math.max(0, Math.min(100, percentage));

        let colorClass = 'bg-success';
        if (percentage > 75) {
          colorClass = 'bg-danger';
        } else if (percentage > 50) {
          colorClass = 'bg-warning';
        }

        const isPromoted = promoted.includes(address);

        parsedBakers.push({
          address,
          name: alias,
          isPromoted,
          feeNum: parseFloat(edgeOfBakingOverStaking),
          usedPercentage: percentage,
          externalStaked: currentValue,
          alias: `<a style="text-decoration:none" href="https://tzkt.io/${sanitizeText(address)}" target="_blank" rel="noopener noreferrer"><img src="https://services.tzkt.io/v1/avatars/${sanitizeText(address)}" style="width:32px;height:32px;background:white;border-radius:50%"/> ${sanitizeText(alias)}</a>`,
          balance: parseInt(freeBalanceFloat.toFixed(6), 10),
          edgeOfBakingOverStaking: `${edgeOfBakingOverStaking}%`,
          progressBar: `<div class="progress">
            <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${clampedWidth.toFixed(1)}%" aria-valuenow="${currentValue}" aria-valuemin="0" aria-valuemax="${maxValue}"></div>
          </div>`
        });
      }
    });

    // Sort by fee ascending and place promoted bakers in their defined order at the front
    parsedBakers.sort((a, b) => a.feeNum - b.feeNum);
    for (let i = promoted.length - 1; i >= 0; i--) {
      const promotedAddress = promoted[i];
      const idx = parsedBakers.findIndex((d) => d.address === promotedAddress);
      if (idx !== -1) {
        const [specialDelegate] = parsedBakers.splice(idx, 1);
        parsedBakers.unshift(specialDelegate);
      }
    }

    allBakers = parsedBakers;
    filteredBakers = allBakers;
    applyFilter();
  } catch (error) {
    console.error('Error fetching delegate data:', error);
    showNotification('Error loading bakers from TzKT API', true);
  } finally {
    if (table) table.style.display = 'table';
    if (refreshBtn) {
      const icon = refreshBtn.querySelector('i');
      if (icon) icon.classList.remove('fa-spin');
    }
  }

  bindUIListenersOnce();
  flag = true;
  checkActiveSession();
}

function bindUIListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const aliasHeader = document.getElementById('aliasHeader');
  const freeSpaceHeader = document.getElementById('freeSpaceHeader');
  const feeHeader = document.getElementById('feeHeader');

  if (aliasHeader) aliasHeader.addEventListener('click', () => setSortField('alias'));
  if (freeSpaceHeader) freeSpaceHeader.addEventListener('click', () => setSortField('freeSpace'));
  if (feeHeader) feeHeader.addEventListener('click', () => setSortField('fee'));

  document.querySelectorAll('#sort-mode-control .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sortKey = btn.dataset.sort;
      if (sortKey) setSortField(sortKey);
    });
  });

  const lowFeesEl = document.getElementById('toggleAllBakers');
  const aliasEl = document.getElementById('toggleAliasBakers');

  if (lowFeesEl) lowFeesEl.addEventListener('change', applyFilter);
  if (aliasEl) aliasEl.addEventListener('change', applyFilter);

  const searchInput = document.getElementById('bakerSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
  }
  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      applyFilter();
      searchInput.focus();
    });
  }

  const inspectForm = document.getElementById('inspectAddressForm');
  if (inspectForm) {
    inspectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      inspectCustomAddress();
    });
  }
}

// ============================================================================
// Beacon Wallet Operations (Stake, Unstake, Finalize, Delegate)
// ============================================================================

async function stakeTez() {
  const amountInput = document.getElementById('amountInput');
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) {
    showNotification('Enter a valid XTZ amount to stake', true);
    if (amountInput) amountInput.focus();
    return;
  }

  try {
    if (!permissions?.address) {
      permissions = await client.requestPermissions();
      checkActiveSession();
    }
    const operation = [
      {
        amount: Math.round(amount * 1_000_000).toString(),
        kind: beacon.TezosOperationType.TRANSACTION,
        source: permissions.address,
        destination: permissions.address,
        parameters: {
          entrypoint: 'stake',
          value: {
            prim: 'Unit'
          }
        }
      }
    ];

    const response = await client.requestOperation({
      operationDetails: operation
    });
    showNotification(
      `Successfully staked ${amount} ꜩ! Tx: ${shortenAddress(response.transactionHash)}`,
      false,
      response.transactionHash
    );
    setTimeout(checkActiveSession, 15000);
  } catch (error) {
    console.error('Error staking tez:', error);
    showNotification('Failed to stake tez. Please try again.', true);
  }
}

async function unstakeTez() {
  const amountInput = document.getElementById('amountInput');
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) {
    showNotification('Enter a valid XTZ amount to unstake', true);
    if (amountInput) amountInput.focus();
    return;
  }

  try {
    if (!permissions?.address) {
      permissions = await client.requestPermissions();
      checkActiveSession();
    }
    const operation = [
      {
        amount: Math.round(amount * 1_000_000).toString(),
        kind: beacon.TezosOperationType.TRANSACTION,
        source: permissions.address,
        destination: permissions.address,
        parameters: {
          entrypoint: 'unstake',
          value: {
            prim: 'Unit'
          }
        }
      }
    ];

    const response = await client.requestOperation({
      operationDetails: operation
    });
    showNotification(
      `Successfully unstaked ${amount} ꜩ! Tx: ${shortenAddress(response.transactionHash)}`,
      false,
      response.transactionHash
    );
    setTimeout(checkActiveSession, 15000);
  } catch (error) {
    console.error('Error unstaking tez:', error);
    showNotification('Failed to unstake tez. Please try again.', true);
    setTimeout(checkActiveSession, 15000);
  }
}

async function finalunstakeTez() {
  try {
    if (!permissions?.address) {
      permissions = await client.requestPermissions();
      checkActiveSession();
    }
    const operation = [
      {
        amount: '0',
        kind: beacon.TezosOperationType.TRANSACTION,
        source: permissions.address,
        destination: permissions.address,
        parameters: {
          entrypoint: 'finalize_unstake',
          value: {
            prim: 'Unit'
          }
        }
      }
    ];

    const response = await client.requestOperation({
      operationDetails: operation
    });
    showNotification(
      `Successfully finalized unstake! Tx: ${shortenAddress(response.transactionHash)}`,
      false,
      response.transactionHash
    );
    setTimeout(checkActiveSession, 15000);
  } catch (error) {
    console.error('Error finalizing unstake:', error);
    showNotification('Failed to finalize unstake. Please try again.', true);
  }
}

async function delegateTez(address) {
  try {
    if (!permissions?.address) {
      permissions = await client.requestPermissions();
      checkActiveSession();
    }
    const operation = [
      {
        kind: beacon.TezosOperationType.DELEGATION,
        delegate: address
      }
    ];

    const response = await client.requestOperation({
      operationDetails: operation
    });
    showNotification(
      `Delegated to ${shortenAddress(address)}! Tx: ${shortenAddress(response.transactionHash)}`,
      false,
      response.transactionHash
    );
    setTimeout(checkActiveSession, 15000);
  } catch (error) {
    console.error('Error delegating tez:', error);
    showNotification('Failed to delegate tez. Please try again.', true);
  }
}

// ============================================================================
// Notification Toast System
// ============================================================================

function showNotification(message, isError = false, txHash = null) {
  let toast = document.getElementById('notification-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'notification-toast';
    document.body.appendChild(toast);
  }

  toast.classList.toggle('error', Boolean(isError));
  const iconClass = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
  const safeMsg = escapeHtml(message);
  const txLinkHtml = txHash
    ? `<a href="https://tzkt.io/${encodeURIComponent(txHash)}" target="_blank" rel="noopener noreferrer">View on TzKT ↗</a>`
    : '';

  toast.innerHTML = `
    <i class="${iconClass}"></i>
    <span>${safeMsg}${txLinkHtml}</span>
  `;

  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 6500);
}

// ============================================================================
// Wallet Session & Account Inspection
// ============================================================================

async function connectWallet() {
  try {
    if (!permissions?.address) {
      permissions = await client.requestPermissions();
      checkActiveSession();
    }
  } catch (error) {
    console.error('Error connecting wallet:', error);
    showNotification('Failed to connect wallet. Please try again.', true);
  }
}

async function checkActiveSession() {
  const walletInfoDiv = document.getElementById('walletInfo');
  const walletEmptyDiv = document.getElementById('walletEmptyState');
  const disconnectWalletBtn = document.getElementById('disconnectWalletBtn');
  const connectWalletBtn = document.getElementById('connectWalletBtn');
  const headerConnectBtn = document.getElementById('headerConnectBtn');

  const activeAccount = await client.getActiveAccount();
  if (activeAccount) {
    permissions = {
      address: activeAccount.address
    };
    if (walletInfoDiv) walletInfoDiv.style.display = 'flex';
    if (walletEmptyDiv) walletEmptyDiv.style.display = 'none';

    const apiUrl = `https://api.tzkt.io/v1/accounts/${encodeURIComponent(activeAccount.address)}`;
    try {
      const response = await fetch(apiUrl);
      const accountData = await response.json();
      const { balance = 0, stakedBalance = 0, unstakedBalance = 0, delegate = null } = accountData;
      currentAccountState = {
        address: activeAccount.address,
        balanceMutez: balance,
        stakedMutez: stakedBalance,
        unstakedMutez: unstakedBalance,
        delegateAddress: delegate?.address || null,
        delegateAlias: delegate?.alias || null,
        isWatchOnly: false
      };
      displayWalletInfo(
        activeAccount.address,
        balance,
        stakedBalance,
        unstakedBalance,
        delegate
      );
      renderBakerTable();
    } catch (error) {
      console.error('Error fetching account data:', error);
      showNotification('Failed to fetch account data. Please try again.', true);
    }

    if (disconnectWalletBtn) disconnectWalletBtn.style.display = 'inline-flex';
    if (connectWalletBtn) connectWalletBtn.style.display = 'none';
    if (headerConnectBtn) {
      headerConnectBtn.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--inflow-light);"></i> <span>${escapeHtml(shortenAddress(activeAccount.address))}</span>`;
    }
  } else {
    if (!currentAccountState.isWatchOnly) {
      if (walletInfoDiv) walletInfoDiv.style.display = 'none';
      if (walletEmptyDiv) walletEmptyDiv.style.display = 'block';
      const stakingCard = document.getElementById('staking');
      if (stakingCard) stakingCard.style.display = 'none';
    }
    if (disconnectWalletBtn) disconnectWalletBtn.style.display = 'none';
    if (connectWalletBtn) connectWalletBtn.style.display = 'inline-flex';
    if (headerConnectBtn) {
      headerConnectBtn.innerHTML = `<i class="fa-solid fa-wallet"></i> <span>Connect Wallet</span>`;
    }
  }
}

async function disconnectWallet() {
  await client.clearActiveAccount();
  const walletInfoDiv = document.getElementById('walletInfo');
  if (walletInfoDiv) {
    walletInfoDiv.innerHTML = '';
    walletInfoDiv.style.display = 'none';
  }
  permissions = null;
  currentAccountState = {
    address: null,
    balanceMutez: 0,
    stakedMutez: 0,
    unstakedMutez: 0,
    delegateAddress: null,
    delegateAlias: null,
    isWatchOnly: false
  };
  const stakingCard = document.getElementById('staking');
  if (stakingCard) stakingCard.style.display = 'none';
  checkActiveSession();
  renderBakerTable();
  showNotification('Wallet disconnected');
}

async function inspectCustomAddress() {
  const inputEl = document.getElementById('inspectAddressInput');
  if (!inputEl) return;
  const addr = inputEl.value.trim();
  if (!addr || addr.length < 36) {
    showNotification('Enter a valid Tezos address (tz1 / tz2 / tz3 / KT1)', true);
    return;
  }

  try {
    const response = await fetch(`https://api.tzkt.io/v1/accounts/${encodeURIComponent(addr)}`);
    if (!response.ok) throw new Error('Account not found');
    const accountData = await response.json();
    const { balance = 0, stakedBalance = 0, unstakedBalance = 0, delegate = null } = accountData;

    currentAccountState = {
      address: addr,
      balanceMutez: balance,
      stakedMutez: stakedBalance,
      unstakedMutez: unstakedBalance,
      delegateAddress: delegate?.address || null,
      delegateAlias: delegate?.alias || null,
      isWatchOnly: !permissions?.address
    };

    const walletEmptyDiv = document.getElementById('walletEmptyState');
    if (walletEmptyDiv) walletEmptyDiv.style.display = 'none';

    displayWalletInfo(addr, balance, stakedBalance, unstakedBalance, delegate);
    renderBakerTable();
    showNotification(`Loaded staking profile for ${shortenAddress(addr)}`);
  } catch (err) {
    console.error('Error inspecting address:', err);
    showNotification('Could not fetch Tezos account from TzKT', true);
  }
}

function displayWalletInfo(address, balance = 0, stakedBalance = 0, unstakedBalance = 0, baker = null) {
  const walletInfoDiv = document.getElementById('walletInfo');
  if (!walletInfoDiv) return;

  const found = allBakers.find((bakerdata) => bakerdata.address === baker?.address);
  const stakingCard = document.getElementById('staking');
  if (stakingCard) stakingCard.style.display = 'block';
  walletInfoDiv.style.display = 'flex';

  const finalizeBtn = document.getElementById('finalize');
  if (finalizeBtn) {
    finalizeBtn.disabled = !(unstakedBalance > 0);
  }

  const shortAddress = shortenAddress(address);
  const bakerClass = baker?.address ? (found ? '' : 'warning') : 'danger';
  const bakerText = found ? found.name : baker?.alias || baker?.address || 'No baker selected';
  const bakerLink = baker?.address
    ? `<a href="https://tzkt.io/${sanitizeText(baker.address)}" target="_blank" rel="noopener noreferrer">${sanitizeText(bakerText)} ↗</a>`
    : sanitizeText(bakerText);

  const spendableMutez = Math.max(0, balance - stakedBalance - unstakedBalance);
  const avatarUrl = `https://services.tzkt.io/v1/avatars/${encodeURIComponent(address)}`;

  walletInfoDiv.innerHTML = `
    <div class="wallet-address-bar">
      <div class="wallet-addr-left">
        <img class="wallet-avatar" src="${avatarUrl}" alt="Wallet" />
        <div class="wallet-address" title="${sanitizeText(address)}">${sanitizeText(shortAddress)}</div>
      </div>
      <div class="wallet-addr-actions">
        <button type="button" class="wallet-icon-btn" id="copyWalletAddrBtn" title="Copy address">
          <i class="fa-regular fa-copy"></i>
        </button>
        <a class="wallet-icon-btn" href="https://tzkt.io/${sanitizeText(address)}" target="_blank" rel="noopener noreferrer" title="View on TzKT">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </a>
      </div>
    </div>

    <div class="wallet-stat">
      <span class="wallet-stat-label">Balance</span>
      <span class="wallet-stat-value">${(spendableMutez / 1_000_000).toFixed(6)} ꜩ</span>
    </div>

    <div class="wallet-stat">
      <span class="wallet-stat-label">Staked</span>
      <span class="wallet-stat-value" style="color:var(--inflow-light);">${(stakedBalance / 1_000_000).toFixed(6)} ꜩ</span>
    </div>

    <div class="wallet-stat">
      <span class="wallet-stat-label">Unstaked</span>
      <span class="wallet-stat-value">${(unstakedBalance / 1_000_000).toFixed(6)} ꜩ</span>
    </div>

    <div class="wallet-baker ${bakerClass}">
      <span class="wallet-stat-label">Baker</span>
      <span class="wallet-baker-value">${bakerLink}</span>
    </div>
  `;

  const avatarImg = walletInfoDiv.querySelector('.wallet-avatar');
  if (avatarImg) {
    avatarImg.addEventListener('error', () => handleAvatarError(avatarImg, address));
  }
  const copyBtn = walletInfoDiv.querySelector('#copyWalletAddrBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyToClipboard(address, 'Wallet address'));
  }
}

// Initial fetch and periodic update every 2 minutes
fetchDelegateData();
setInterval(fetchDelegateData, 120000);
client.subscribeToEvent(beacon.BeaconEvent.ACTIVE_ACCOUNT_SET, () => {
  if (flag) {
    checkActiveSession();
  }
});
