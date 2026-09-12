<div align="center">

  <img src="./assets/avva-logo.png" alt="AVVA Logo" width="280" />

  <h1>Agent-as-a-Service for Enterprise Transaction Intelligence</h1>

  <p>
    AVVA embeds an AI investigation agent directly into enterprise transaction dashboards to analyse activity, connect context, explain risk signals, and surface actionable insights.
  </p>

  <p>
    <strong>Browser Agent · Transaction Intelligence · Agentic Investigation · Human-in-the-Loop</strong>
  </p>

</div>

---

## Overview

**AVVA is an Agent-as-a-Service platform for enterprise transaction intelligence.**

Enterprise platforms already show teams transactions, balances, customers, beneficiaries, alerts, and risk indicators.

AVVA adds the intelligence layer on top.

Instead of asking analysts to leave their workflow, open a separate AI tool, copy transaction details, and manually explain the context, AVVA works directly inside the enterprise dashboard through a browser extension.

When an employee opens a transaction, AVVA can understand the approved transaction context, investigate surrounding activity, connect related evidence, and explain what may require attention.

The goal is simple:

> **Enterprise dashboards show the transaction. AVVA investigates it.**

---

## What We Built

For the AI Tinkerers hackathon, we built a working AVVA prototype consisting of two main components:

### 1. AVVA Browser Agent

A Chrome Manifest V3 extension that works alongside an enterprise transaction dashboard.

The extension can recognise explicitly approved transaction context such as:

```text
Transaction ID
Amount
Currency
Customer
Beneficiary
Risk
Status
Employee
Device
