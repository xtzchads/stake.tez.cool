let allBakers = [];
let filteredBakers = [];
let client = new beacon.DAppClient({
   name: 'Staking Assistant'
});
let permissions;

async function fetchDelegateData() {
   const freeSpaceHeader = document.getElementById('freeSpaceHeader');
   const feeHeader = document.getElementById('feeHeader');
   const table = document.getElementById('delegateTable');
   //table.style.display = 'none';

   try {
      let bakers = await fetch('https://api.tzkt.io/v1/delegates?limit=10000&active=true');
      let data = await bakers.json();
      allBakers = [];
      data.forEach(delegate => {
         if (delegate.limitOfStakingOverBaking && delegate.limitOfStakingOverBaking > 0) {
            let address = delegate.address;
            let alias = delegate.alias || delegate.address;
            let balance = ((delegate.stakedBalance * delegate.limitOfStakingOverBaking / 1000000 - delegate.externalStakedBalance) / 1000000).toFixed(6);
            let edgeOfBakingOverStaking = (delegate.edgeOfBakingOverStaking / 10000000).toFixed(2);

            // Calculate progress bar values
            let maxValue = delegate.stakedBalance * delegate.limitOfStakingOverBaking / 1000000 / 1000000;
            let currentValue = delegate.externalStakedBalance / 1000000;

            // Determine color based on percentage
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

            allBakers.push({
               address: address,
               name: alias,
               alias: `<a href="https://tzkt.io/${DOMPurify.sanitize(address)}" target="_blank" rel="noopener noreferrer">${DOMPurify.sanitize(alias)}</a>`,
               balance: parseInt(balance),
               edgeOfBakingOverStaking: edgeOfBakingOverStaking + "%",
               progressBar: `<div class="progress">
                            <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${percentage}%" aria-valuenow="${currentValue}" aria-valuemin="0" aria-valuemax="${maxValue}"></div>
                         </div>`
            });
         }
      });

      // Sort the data by balance in descending order
      allBakers.sort((a, b) => b.balance - a.balance);

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
      applyFilter();
   });
      checkActiveSession();
}

function applyFilter() {
   const table = document.getElementById('delegateTable');
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

   const tableBody = table.querySelector('tbody');
   tableBody.innerHTML = '';

   filteredBakers.forEach(delegate => {
      let row = tableBody.insertRow();
      let cell1 = row.insertCell(0);
      let cell2 = row.insertCell(1);
      let cell3 = row.insertCell(2);
      let cell4 = row.insertCell(3);

      cell1.innerHTML = delegate.alias;
      cell2.innerHTML = delegate.balance.toLocaleString() + "<br>" + delegate.progressBar;
      cell3.textContent = delegate.edgeOfBakingOverStaking;
      cell4.innerHTML = "<button class=\"btn btn-primary btn-sm w-100\" onclick=\"delegateTez('" + DOMPurify.sanitize(delegate.address) + "', this)\">Delegate</button>";
   });
}

// Sort table by column index
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
      amountInput.value = '';
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
      amountInput.value = '';
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
   document.body.appendChild(notification);
   notification.offsetHeight;
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
        wallet.style.display = 'flex';
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
        //wallet.style.display = 'none'; // Hide walletInfo if no active session
        disconnectWalletBtn.style.display = 'none';
        connectWalletBtn.style.display = 'block';
    }
}

async function disconnectWallet() {
    await client.clearActiveAccount();
    const walletInfoDiv = document.getElementById('walletInfo');
    walletInfoDiv.innerHTML = '';
    permissions = null;
    document.getElementById('staking').style.display='none';
    checkActiveSession();
}


function displayWalletInfo(address, balance, stakedBalance, unstakedBalance, baker) {
   const walletInfoDiv = document.getElementById('walletInfo');
   const found = allBakers.find(bakerdata => bakerdata.address === baker?.address);
   if (found) document.getElementById('staking').style.display='flex';
   walletInfoDiv.innerHTML = `<span class="badge bg-secondary">${address}</span><span class="badge bg-primary">Balance: ${balance / 1000000} &#xA729;</span><span class="badge bg-primary">Staked: ${stakedBalance / 1000000} &#xA729;</span><span class="badge bg-primary">Unstaked: ${unstakedBalance / 1000000} &#xA729;</span><span class="badge ${baker?.address?(found?"bg-success":"bg-warning"):"bg-danger"}">Baker: ${found?"<a href=\"https://tzkt.io/"+found.address+"\" target=\"_blank\" style=\"color:white\" rel=\"noopener noreferrer\">"+found.name+"</a>":baker?.address}</span>`;
}


// Initial fetch and periodic update
fetchDelegateData();
setInterval(fetchDelegateData, 120000);
client.subscribeToEvent(beacon.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
    checkActiveSession();
});
