let allBakers = [];
let filteredBakers = [];
let client = new beacon.DAppClient({
   name: 'Staking Assistant'
});
let flag = false;
let permissions;
let promoted = ["tz1Yjryh3tpFHQG73dofJNatR21KUdRDu7mH","tz1brWSr91ZygR4gi5o19yo8QMff926y2B5e","tz1bdTgmF8pzBH9chtJptsjjrh5UfSXp1SQ4","tz1cXUERthGxHcDVAdKsFiFa4sSWbuGorghY","tz1exWwgsENRgBQKrjvo4xdhG18mRov1kjJa","tz1i36vhJwdv75p4zfRu3TPyqhaXyxDWGoz9"];
let currentPage = 1;
let entriesPerPage = 25;
let totalBakers = 0;

function setMaxAmount() {
  const amountInput = document.getElementById('amountInput');
  const walletInfoDiv = document.getElementById('walletInfo');
  if (!permissions?.address || walletInfoDiv.style.display === 'none') {
    showNotification('Please connect your wallet first', true);
    return;
  }
  const walletStats = walletInfoDiv.querySelectorAll('.wallet-stat');
  let balance = 0;
  
  walletStats.forEach(stat => {
    const label = stat.querySelector('.wallet-stat-label');
    const value = stat.querySelector('.wallet-stat-value');
    
    if (label && label.textContent.trim() === 'Balance' && value) {
      const balanceText = value.textContent.replace('ꜩ', '').trim();
      balance = parseFloat(balanceText);
    }
  });
  
  if (balance > 0) {
    const maxAmount = Math.max(0, balance - 0.1);
    amountInput.value = maxAmount.toFixed(6);
  } else {
    showNotification('No balance available', true);
  }
}

function changeEntriesPerPage() {
  entriesPerPage = parseInt(document.getElementById('entriesPerPage').value);
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

function renderBakerTable() {
  const table = document.getElementById('delegateTable');
  const tableBody = table.querySelector('tbody');
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const pageData = filteredBakers.slice(startIndex, endIndex);
  
  tableBody.innerHTML = '';
  
  pageData.forEach(delegate => {
    let row = tableBody.insertRow();
    let cell1 = row.insertCell(0);
    let cell2 = row.insertCell(1);
    let cell3 = row.insertCell(2);
    let cell4 = row.insertCell(3);
    let cell5 = row.insertCell(4);

    cell1.innerHTML = delegate.alias;
    cell2.innerHTML = delegate.balance.toLocaleString() + "<br>" + delegate.progressBar;
    cell3.textContent = delegate.edgeOfBakingOverStaking;
    cell4.innerHTML = delegate.dalRewards;
    cell5.innerHTML = "<button class=\"btn btn-primary btn-sm w-100\" onclick=\"delegateTez('" + DOMPurify.sanitize(delegate.address) + "', this)\">Select</button>";
  });
}

function updatePagination() {
  const totalPages = Math.ceil(totalBakers / entriesPerPage);
  const startEntry = totalBakers > 0 ? (currentPage - 1) * entriesPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * entriesPerPage, totalBakers);
  
  // Update info
  document.getElementById('paginationInfo').textContent = 
    `${startEntry} to ${endEntry} of ${totalBakers}`;
  
  // Update buttons
  document.getElementById('prevBtn').disabled = currentPage === 1;
  document.getElementById('nextBtn').disabled = currentPage === totalPages || totalPages === 0;
  
  // Update pagination buttons
  const pagination = document.getElementById('pagination');
  const buttons = pagination.querySelectorAll('.page-btn:not(#prevBtn):not(#nextBtn)');
  buttons.forEach(btn => btn.remove());
  
  // Add page buttons
  const nextBtn = document.getElementById('nextBtn');
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    btn.textContent = i;
    btn.onclick = () => goToPage(i);
    pagination.insertBefore(btn, nextBtn);
  }
}

async function fetchDelegateData() {
   const freeSpaceHeader = document.getElementById('freeSpaceHeader');
   const feeHeader = document.getElementById('feeHeader');
   const table = document.getElementById('delegateTable');

   try {
      let bakers = await fetch('https://api.tzkt.io/v1/delegates?limit=10000&active=true');
      let data = await bakers.json();
      allBakers = [];
      data.forEach(delegate => {
         if (delegate.limitOfStakingOverBaking && delegate.limitOfStakingOverBaking > 0) {
            let address = delegate.address;
            let alias = delegate.alias || delegate.address;
            if (delegate.limitOfStakingOverBaking>9000000)
               delegate.limitOfStakingOverBaking=9000000;
            let balance = ((delegate.stakedBalance * delegate.limitOfStakingOverBaking / 1000000 - delegate.externalStakedBalance) / 1000000).toFixed(6);
            let edgeOfBakingOverStaking = (delegate.edgeOfBakingOverStaking / 10000000).toFixed(2);

            let maxValue = delegate.stakedBalance * delegate.limitOfStakingOverBaking / 1000000 / 1000000;
            let currentValue = delegate.externalStakedBalance / 1000000;

            let percentage = currentValue / maxValue * 100;
            if (maxValue==0)
               percentage=100;
            let colorClass = '';
            if (percentage <= 50) {
               colorClass = 'bg-success';
            } else if (percentage <= 75) {
               colorClass = 'bg-warning';
            } else {
               colorClass = 'bg-danger';
            }

            let dalRewards = '';
            if (delegate.dalAttestationRewardsCount && delegate.dalAttestationRewardsCount > 0) {
               dalRewards = '<span style="color: green; font-size: 16px;">✓</span>';
            } else {
               dalRewards = '<span style="color: red; font-size: 16px;">✗</span>';
            }

            allBakers.push({
               address: address,
               name: alias,
               alias: `<a style="text-decoration:none" href="https://tzkt.io/${DOMPurify.sanitize(address)}" target="_blank" rel="noopener noreferrer"><img src="https://services.tzkt.io/v1/avatars/${DOMPurify.sanitize(address)}" style="width:32px;height:32px;background:white;border-radius:50%"/> ${DOMPurify.sanitize(alias)}</a>`,
               balance: parseInt(balance),
               edgeOfBakingOverStaking: edgeOfBakingOverStaking + "%",
               dalRewards: dalRewards,
               progressBar: `<div class="progress" style="background-color: #1b172d;background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 100%), linear-gradient(0deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.02) 100%);">
                            <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${percentage}%" aria-valuenow="${currentValue}" aria-valuemin="0" aria-valuemax="${maxValue}"></div>
                         </div>`
            });
         }
      });

      allBakers.sort((a, b) => b.balance - a.balance);
      promoted.forEach(promotedAddress => {
   	 let specialAddressIndex = allBakers.findIndex(delegate => delegate.address === promotedAddress);
  	 if (specialAddressIndex !== -1) {
         let [specialDelegate] = allBakers.splice(specialAddressIndex, 1);
	 specialDelegate.alias = `<span class="text-warning">&#9733;</span> ${specialDelegate.alias}`;
         allBakers.unshift(specialDelegate);
   	 }
	});
      filteredBakers = allBakers;
      applyFilter();
   } catch (error) {
      console.error('Error fetching delegate data:', error);
   } finally {
      table.style.display = 'table';
   }
   let sortDirection = {
      freeSpace: 'desc',
      fee: 'desc'
   };
freeSpaceHeader.addEventListener('click', () => {
   if (sortDirection.freeSpace === 'desc') {
      allBakers.sort((a, b) => a.balance - b.balance);
      sortDirection.freeSpace = 'asc';
   } else {
      allBakers.sort((a, b) => b.balance - a.balance);
      sortDirection.freeSpace = 'desc';
   }
   currentPage = 1;
   applyFilter();
});

feeHeader.addEventListener('click', () => {
   if (sortDirection.fee === 'desc') {
      allBakers.sort((a, b) => a.edgeOfBakingOverStaking.slice(0, -1) - b.edgeOfBakingOverStaking.slice(0, -1));
      sortDirection.fee = 'asc';
   } else {
      allBakers.sort((a, b) => b.edgeOfBakingOverStaking.slice(0, -1) - a.edgeOfBakingOverStaking.slice(0, -1));
      sortDirection.fee = 'desc';
   }
   currentPage = 1;
   applyFilter();
});
      flag = true;
      checkActiveSession();
}

function applyFilter() {
   const showAllBakers = document.getElementById('toggleAllBakers').checked;
   const showAliasBakers = document.getElementById('toggleAliasBakers').checked;

   filteredBakers = allBakers;

   if (showAllBakers) {
      filteredBakers = filteredBakers.filter(delegate => parseFloat(delegate.edgeOfBakingOverStaking) <= 40);
   } else {
      filteredBakers = filteredBakers.filter(delegate => parseFloat(delegate.edgeOfBakingOverStaking) > 40);
   }

   if (showAliasBakers) {
      filteredBakers = filteredBakers.filter(delegate => delegate.name !== delegate.address);
   } else {
      filteredBakers = filteredBakers.filter(delegate => delegate.name === delegate.address);
   }

   totalBakers = filteredBakers.length;
   currentPage = 1;
   renderBakerTable();
   updatePagination();
}

function sortTable(columnIndex, isNumeric) {
   const table = document.getElementById('delegateTable');
   const tbody = table.querySelector('tbody');
   const rows = Array.from(tbody.rows);

   const compare = (a, b) => {
      const cellA = a.cells[columnIndex].textContent;
      const cellB = b.cells[columnIndex].textContent;
      return isNumeric ? parseFloat(cellA) - parseFloat(cellB) : cellA.localeCompare(cellB);
   };

   const currentOrder = table.getAttribute('data-sort-order') === 'asc' ? 'desc' : 'asc';
   table.setAttribute('data-sort-order', currentOrder);

   rows.sort((a, b) => currentOrder === 'asc' ? compare(a, b) : compare(b, a));

   rows.forEach(row => tbody.appendChild(row));
}

document.getElementById('toggleAllBakers').addEventListener('change', applyFilter);
document.getElementById('toggleAliasBakers').addEventListener('change', applyFilter);

async function stakeTez() {
   const amountInput = document.getElementById('amountInput');
   const amount = parseFloat(amountInput.value);

   try {
      if (!permissions?.address) {
         permissions = await client.requestPermissions();
         checkActiveSession();
      }
      const operation = [{
         amount: (amount * 1000000).toString(),
         kind: beacon.TezosOperationType.TRANSACTION,
         source: permissions.address,
         destination: permissions.address,
         parameters: {
            entrypoint: "stake",
            value: {
               "prim": "Unit"
            }
         }
      }];

      const response = await client.requestOperation({
         operationDetails: operation
      });
      showNotification(`Successfully staked ${amount} tez. Transaction hash: ${response.transactionHash}`);
      setTimeout(checkActiveSession, 15000);
   } catch (error) {
      console.error('Error staking tez:', error);
      showNotification('Failed to stake tez. Please try again.', true);
   }
}

async function unstakeTez() {
   const amountInput = document.getElementById('amountInput');
   const amount = parseFloat(amountInput.value);

   try {
      if (!permissions?.address) {
         permissions = await client.requestPermissions();
         checkActiveSession();
      }
      const operation = [{
         amount: (amount * 1000000).toString(),
         kind: beacon.TezosOperationType.TRANSACTION,
         source: permissions.address,
         destination: permissions.address,
         parameters: {
            entrypoint: "unstake",
            value: {
               "prim": "Unit"
            }
         }
      }];

      const response = await client.requestOperation({
         operationDetails: operation
      });
      showNotification(`Successfully unstaked ${amount} tez. Transaction hash: ${response.transactionHash}`);
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
      const operation = [{
         amount: "0",
         kind: beacon.TezosOperationType.TRANSACTION,
         source: permissions.address,
         destination: permissions.address,
         parameters: {
            entrypoint: "finalize_unstake",
            value: {
               "prim": "Unit"
            }
         }
      }];

      const response = await client.requestOperation({
         operationDetails: operation
      });
      showNotification(`Successfully finalized unstake. Transaction hash: ${response.transactionHash}`);
      setTimeout(checkActiveSession, 15000);
   } catch (error) {
      console.error('Error unstaking tez:', error);
      showNotification('Failed. Please try again.', true);
   }
}

async function delegateTez(address) {
   try {
      if (!permissions?.address) {
         permissions = await client.requestPermissions();
         checkActiveSession();
      }
      const operation = [{
         kind: beacon.TezosOperationType.DELEGATION,
         delegate: address,
      }];

      const response = await client.requestOperation({
         operationDetails: operation
      });
      showNotification(`Successfully delegated tez to ${address}. Transaction hash: ${response.transactionHash}`);
      setTimeout(checkActiveSession, 15000);
   } catch (error) {
      console.error('Error delegating tez:', error);
      showNotification('Failed to delegate tez. Please try again.', true);
   }
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.classList.add('notification', isError ? 'error' : 'success');
    notification.textContent = message;

    const container = document.getElementById("staking-body");
        container.appendChild(notification);
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 10000);
}

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
    const disconnectWalletBtn = document.getElementById('disconnectWalletBtn');
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    const activeAccount = await client.getActiveAccount();
    if (activeAccount) {
        // Active session found
        permissions = {
            address: activeAccount.address
        };
        walletInfoDiv.style.display = 'block';
	const apiUrl = `https://api.tzkt.io/v1/accounts/${activeAccount.address}`;
        try {
            const response = await fetch(apiUrl);
            const accountData = await response.json();
            const { balance, stakedBalance, unstakedBalance, delegate} = accountData;
			displayWalletInfo(DOMPurify.sanitize(activeAccount.address), balance, stakedBalance, unstakedBalance, delegate);
        } catch (error) {
            console.error('Error fetching account data:', error);
            showNotification('Failed to fetch account data. Please try again.', true);
        }
        disconnectWalletBtn.style.display = 'block';
        connectWalletBtn.style.display = 'none';
    } else {
        walletInfoDiv.style.display = 'none'; // Hide walletInfo if no active session
        disconnectWalletBtn.style.display = 'none';
        connectWalletBtn.style.display = 'block';
    }
}

async function disconnectWallet() {
    await client.clearActiveAccount();
    const walletInfoDiv = document.getElementById('walletInfo');
    walletInfoDiv.innerHTML = '';
    walletInfoDiv.style.display='none';
    permissions = null;
    document.getElementById('staking').style.display='none';
    checkActiveSession();
}


function displayWalletInfo(address, balance, stakedBalance, unstakedBalance, baker) {
   const walletInfoDiv = document.getElementById('walletInfo');
   const found = allBakers.find(bakerdata => bakerdata.address === baker?.address);
   document.getElementById('staking').style.display='block';
   
   const shortAddress = `${address.slice(0, 7)}...${address.slice(-4)}`;
   const bakerClass = baker?.address ? (found ? "" : "warning") : "danger";
   const bakerText = found ? found.name : (baker?.address || "No baker selected");
   const bakerLink = found ? `<a href="https://tzkt.io/${found.address}" target="_blank" rel="noopener noreferrer">${DOMPurify.sanitize(found.name)}</a>` : DOMPurify.sanitize(bakerText);
   
   walletInfoDiv.innerHTML = `
     <div class="wallet-address" title="${DOMPurify.sanitize(address)}">${DOMPurify.sanitize(shortAddress)}</div>
     
     <div class="wallet-stat">
       <span class="wallet-stat-label">Balance</span>
       <span class="wallet-stat-value">${(balance / 1000000).toFixed(2)} ꜩ</span>
     </div>
     
     <div class="wallet-stat">
       <span class="wallet-stat-label">Staked</span>
       <span class="wallet-stat-value">${(stakedBalance / 1000000).toFixed(2)} ꜩ</span>
     </div>
     
     <div class="wallet-stat">
       <span class="wallet-stat-label">Unstaked</span>
       <span class="wallet-stat-value">${(unstakedBalance / 1000000).toFixed(2)} ꜩ</span>
     </div>
     
     <div class="wallet-baker ${bakerClass}">
       <span class="wallet-stat-label">Baker</span>
       <span class="wallet-baker-value">${bakerLink}</span>
     </div>
   `;
}


// Initial fetch and periodic update
fetchDelegateData();
setInterval(fetchDelegateData, 120000);
client.subscribeToEvent(beacon.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
    if (flag)
    checkActiveSession();
});
