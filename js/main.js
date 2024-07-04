let allBakers = [];
let filteredBakers = [];
let client = new beacon.DAppClient({
   name: 'Staking Assistant'
});
let permissions;
client.subscribeToEvent(beacon.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
   // An active account has been set, update the dApp UI
   checkActiveSession();
});

async function fetchDelegateData() {
   const freeSpaceHeader = document.getElementById('freeSpaceHeader');
   const feeHeader = document.getElementById('feeHeader');
   const table = document.getElementById('delegateTable');

   try {
      let bakers = await fetch('https://api.tzkt.io/v1/delegates?limit=10000&active=true');
      let data = await bakers.json();

      // Update existing entries in allBakers or add new entries
      data.forEach(delegateData => {
         let existingBaker = allBakers.find(baker => baker.address === delegateData.address);
         if (existingBaker) {
            // Update existing entry
            existingBaker.balance = parseInt((delegateData.stakedBalance * delegateData.limitOfStakingOverBaking / 1000000 - delegateData.externalStakedBalance) / 1000000);
            existingBaker.edgeOfBakingOverStaking = (delegateData.edgeOfBakingOverStaking / 10000000).toFixed(2)+"%";

            // Calculate progress bar values
            let maxValue = delegateData.stakedBalance * delegateData.limitOfStakingOverBaking / 1000000 / 1000000;
            let currentValue = delegateData.externalStakedBalance / 1000000;

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

            existingBaker.progressBar = `<div class="progress">
                                          <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${percentage}%" aria-valuenow="${currentValue}" aria-valuemin="0" aria-valuemax="${maxValue}"></div>
                                       </div>`;
         } else {
            // Add new entry if not already in allBakers
            if (delegateData.limitOfStakingOverBaking && delegateData.limitOfStakingOverBaking > 0) {
               let balance = ((delegateData.stakedBalance * delegateData.limitOfStakingOverBaking / 1000000 - delegateData.externalStakedBalance) / 1000000).toFixed(6);
               let edgeOfBakingOverStaking = (delegateData.edgeOfBakingOverStaking / 10000000).toFixed(2);

               // Calculate progress bar values
               let maxValue = delegateData.stakedBalance * delegateData.limitOfStakingOverBaking / 1000000 / 1000000;
               let currentValue = delegateData.externalStakedBalance / 1000000;

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
                  address: delegateData.address,
                  name: delegateData.alias || 'No alias',
                  alias: `<a href="https://tzkt.io/${DOMPurify.sanitize(delegateData.address)}" target="_blank" rel="noopener noreferrer">${DOMPurify.sanitize(delegateData.alias || 'No alias')}</a>`,
                  balance: parseInt(balance),
                  edgeOfBakingOverStaking: edgeOfBakingOverStaking + "%",
                  progressBar: `<div class="progress">
                                 <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${percentage}%" aria-valuenow="${currentValue}" aria-valuemin="0" aria-valuemax="${maxValue}"></div>
                              </div>`
               });
            }
         }
      });

      // Sort the data by balance in descending order
      allBakers.sort((a, b) => b.balance - a.balance);

      // Apply current filters and sorting
      applyFilter();
   } catch (error) {
      console.error('Error fetching delegate data:', error);
   } finally {
      table.style.display = 'table';
   }
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
      filteredBakers = filteredBakers.filter(delegate => delegate.name !== 'No alias');
   } else {
      filteredBakers = filteredBakers.filter(delegate => delegate.name === 'No alias');
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

async function checkActiveSession() {
   const walletInfoDiv = document.getElementById('wallet');
   const activeAccount = await client.getActiveAccount();
   if (activeAccount) {
      // Active session found
      permissions = {
         address: activeAccount.address
      };
      wallet.style.display = 'flex';
      displayWalletInfo(DOMPurify.sanitize(activeAccount.address));
   } else
      wallet.style.display = 'none'; // Hide walletInfo if no active session

}

function displayWalletInfo(address) {
   const walletInfoDiv = document.getElementById('walletInfo');
   walletInfoDiv.innerHTML = `<span>${address}</span>`;
}

async function disconnectWallet() {
   await client.clearActiveAccount();
   const walletInfoDiv = document.getElementById('walletInfo');
   walletInfoDiv.innerHTML = '';
   permissions = null;
}

// Initial fetch and periodic update
fetchDelegateData();
setInterval(fetchDelegateData, 120000);

document.addEventListener('DOMContentLoaded', checkActiveSession);
