# TezStake — Tezos Staking Assistant

**TezStake** (`stake.tez.cool`) is a fast, zero-backend client-side web application for exploring Tezos bakers, comparing staking fees and available external staking capacity, and managing Tezos native staking (`stake`, `unstake`, `finalize_unstake`, and `delegation`) via the Beacon SDK and TzKT API.

---

## ✨ Features

- **Native Tezos Staking Management**:
  - **Stake** (`stake` entrypoint), **Unstake** (`unstake` entrypoint), and **Finalize Unstake** (`finalize_unstake` entrypoint) directly from your self-custodial Tezos wallet.
  - **Quick Amount Presets**: One-click `25%`, `50%`, `75%`, and `MAX` buttons calculated from your spendable balance (reserving `0.1 ꜩ` for network fees on `MAX`).
  - **One-Click Baker Delegation**: Select any baker from the table to broadcast a Beacon delegation operation.
- **Interactive Baker Explorer**:
  - **Live Baker Search**: Instant filtering by baker alias or `tz1 / tz2 / tz3` address.
  - **Smart Filter Toggles**: Filter by **Low fees ($\le 40\%$)** and **Public bakers** (with registered TzKT aliases).
  - **Multi-Column Sorting**: Sort bakers by **Featured (`★`)**, **Fee (%)**, **Free Space (`ꜩ`)**, or **Baker Alias** using either the toolbar segmented control or table column headers.
  - **Capacity Utilization Bars**: Visual color-coded progress bars (`≤50%` emerald, `50–75%` amber, `>75%` rose) showing how much external stake capacity each baker has remaining.
- **Live Network Staking KPI Strip**:
  - Displays real-time aggregate metrics across active staking bakers: **Accepting Bakers**, **Total Free Space (`ꜩ`)**, **Average Staking Fee (`%`)**, and **External Staked (`ꜩ`)**.
- **Read-Only Address Inspector**:
  - Paste any Tezos address (`tz1 / tz2 / tz3 / KT1`) to inspect its liquid balance, staked balance, unstaked balance, and current baker status without needing to connect a wallet.
- **Auto-Refresh & Embed Mode**:
  - Automatically refreshes delegate data from the TzKT API every 2 minutes (or on demand via the **Refresh** button).
  - Includes `frame.html` (`body.frame-mode`) with a transparent background and preserved top indentation (`120px` desktop/tablet, `160px` mobile) for seamless iframe embedding.

---

## 📁 Project Structure

```text
├── index.html               # Standalone application entry point
├── frame.html               # Embed-friendly transparent frame entry point
├── css/
│   └── main.css             # Unified dark glassmorphism stylesheet & responsive layout
├── js/
│   ├── main.js              # Baker fetching, filtering/sorting, Beacon wallet & staking logic
│   ├── purify.min.js        # DOMPurify HTML sanitizer
│   └── walletbeacon.min.js  # AirGap Beacon SDK bundle for Tezos wallet connectivity
└── icons/                   # Brand and social icons
```

---

## 🚀 Deployment

No build step or backend server is required. Host the repository root directly on **GitHub Pages**, **Cloudflare Pages**, **Vercel**, **Netlify**, or any static file server.

---

## 📄 License

This project is open-source and available under the **MIT License**.
