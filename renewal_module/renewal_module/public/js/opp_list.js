// opp_list.js — Custom Opportunity UX
// Provides: card-grid list, slide-in detail panel, multi-step wizard
// Loaded via: doctype_list_js = {"Opportunity": "public/js/opp_list.js"}

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────

  const STATUS_CFG = {
    Open:      { color: '#2490ef', bg: '#dbeafe', dot: '🔵' },
    Quotation: { color: '#d97706', bg: '#fef3c7', dot: '🟡' },
    Converted: { color: '#059669', bg: '#d1fae5', dot: '🟢' },
    Lost:      { color: '#dc2626', bg: '#fee2e2', dot: '🔴' },
    Replied:   { color: '#7c3aed', bg: '#ede9fe', dot: '🟣' },
    Closed:    { color: '#6b7280', bg: '#f3f4f6', dot: '⚫' },
  };

  const STAGES = [
    'Prospecting', 'Qualification', 'Needs Analysis',
    'Value Proposition', 'Proposal/Price Quote',
    'Negotiation/Review', 'Closed Won',
  ];

  const LIST_FIELDS = [
    'name', 'title', 'customer_name', 'party_name', 'opportunity_from',
    'status', 'opportunity_amount', 'currency', 'sales_stage',
    'expected_closing', 'opportunity_owner', 'company', 'probability',
    'contact_email', 'contact_mobile', 'transaction_date', 'modified',
  ];

  const PAGE_SIZE = 20;

  // ── CSS ───────────────────────────────────────────────────────────────────

  function inject_styles() {
    if ($('#opp-ux-styles').length) return;
    $('<style id="opp-ux-styles">').text(`
      /* ── Filter Bar ───────────────────────────────────────── */
      .opp-filter-bar {
        display: flex; flex-wrap: wrap; align-items: center;
        gap: 8px; padding: 10px 16px;
        background: var(--fg-color, #fff);
        border-bottom: 1px solid var(--border-color, #e2e8f0);
        position: sticky; top: 0; z-index: 100;
      }
      .opp-pills { display: flex; flex-wrap: wrap; gap: 4px; }
      .opp-pill {
        padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border-color, #e2e8f0);
        background: white; font-size: 12px; font-weight: 500; cursor: pointer;
        color: var(--text-muted, #6b7280); white-space: nowrap;
        transition: all .15s;
      }
      .opp-pill:hover { border-color: var(--primary, #2490ef); color: var(--primary, #2490ef); }
      .opp-pill.active { background: var(--primary, #2490ef); color: #fff; border-color: var(--primary, #2490ef); }

      .opp-search-wrap {
        position: relative; flex: 1; min-width: 160px; max-width: 280px;
      }
      .opp-search {
        width: 100%; padding: 6px 10px 6px 30px;
        border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px;
        font-size: 12px; outline: none; background: white;
        transition: border-color .15s; box-sizing: border-box;
      }
      .opp-search:focus { border-color: var(--primary, #2490ef); }
      .opp-search-icon {
        position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
        font-size: 13px; color: var(--text-muted, #6b7280); pointer-events: none;
      }
      .opp-sort {
        padding: 5px 8px; border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 6px; font-size: 12px; color: var(--text-muted, #6b7280);
        background: white; cursor: pointer;
      }
      .opp-count { font-size: 12px; color: var(--text-muted, #6b7280); margin-left: auto; }

      /* ── Card Grid ────────────────────────────────────────── */
      .opp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
        gap: 12px; padding: 14px 16px;
      }
      .opp-card {
        background: #fff; border-radius: 10px; padding: 14px 14px 10px;
        border: 1px solid var(--border-color, #e2e8f0); border-left-width: 4px;
        cursor: pointer; position: relative;
        transition: box-shadow .15s, transform .15s;
        display: flex; flex-direction: column; gap: 8px;
      }
      .opp-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,.1); transform: translateY(-1px); }

      .opp-card-head { display: flex; justify-content: space-between; align-items: center; }
      .opp-badge {
        font-size: 10px; font-weight: 600; padding: 2px 9px;
        border-radius: 20px; letter-spacing: .3px;
      }
      .opp-card-menu { position: relative; }
      .opp-menu-btn {
        width: 24px; height: 24px; border-radius: 50%; border: none;
        background: transparent; font-size: 16px; cursor: pointer;
        color: var(--text-muted, #6b7280); line-height: 1;
        display: flex; align-items: center; justify-content: center;
        transition: background .1s;
      }
      .opp-menu-btn:hover { background: var(--gray-100, #f3f4f6); }
      .opp-menu-dd {
        display: none; position: absolute; right: 0; top: 28px;
        background: white; border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.12);
        min-width: 160px; z-index: 200;
      }
      .opp-card-menu:hover .opp-menu-dd { display: block; }
      .opp-menu-item {
        padding: 8px 14px; font-size: 12px; cursor: pointer; white-space: nowrap;
        color: var(--text-color, #1a1a1a); transition: background .1s;
      }
      .opp-menu-item:first-child { border-radius: 8px 8px 0 0; }
      .opp-menu-item:last-child { border-radius: 0 0 8px 8px; }
      .opp-menu-item:hover { background: var(--gray-50, #f9fafb); }
      .opp-menu-item.danger { color: #dc2626; }

      .opp-card-name { font-size: 14px; font-weight: 600; color: var(--text-color, #1a1a1a); line-height: 1.3; }
      .opp-card-id { font-size: 10px; color: var(--text-muted, #6b7280); }
      .opp-card-amount { font-size: 18px; font-weight: 700; color: var(--text-color, #1a1a1a); }
      .opp-card-amount.empty { font-size: 12px; color: var(--text-muted, #6b7280); font-weight: 400; }

      .opp-stage-row { margin-top: 2px; }
      .opp-stage-name { font-size: 10px; color: var(--text-muted, #6b7280); margin-bottom: 4px; }
      .opp-stage-track {
        height: 4px; background: var(--gray-200, #e5e7eb); border-radius: 2px; overflow: hidden;
      }
      .opp-stage-fill {
        height: 100%; border-radius: 2px;
        background: linear-gradient(90deg, var(--primary, #2490ef), #7c3aed);
        transition: width .5s ease;
      }

      .opp-card-foot {
        display: flex; justify-content: space-between; align-items: center;
        padding-top: 8px; border-top: 1px solid var(--border-color, #e2e8f0);
        font-size: 11px; color: var(--text-muted, #6b7280);
      }
      .opp-avatar-row { display: flex; align-items: center; gap: 5px; }
      .opp-avatar {
        width: 20px; height: 20px; border-radius: 50%;
        background: var(--primary, #2490ef); color: #fff;
        font-size: 9px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .opp-closing { font-size: 11px; }
      .opp-closing.overdue { color: #dc2626; font-weight: 600; }

      .opp-empty {
        grid-column: 1 / -1; text-align: center; padding: 60px 20px;
        color: var(--text-muted, #6b7280);
      }
      .opp-empty-icon { font-size: 48px; margin-bottom: 12px; }
      .opp-empty h5 { font-size: 16px; margin-bottom: 6px; }
      .opp-empty p { font-size: 13px; }

      .opp-loadmore-wrap { text-align: center; padding: 12px 0 20px; }
      .opp-loadmore-btn {
        padding: 7px 22px; border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 6px; font-size: 12px; background: white; cursor: pointer;
        color: var(--text-muted, #6b7280); transition: all .15s;
      }
      .opp-loadmore-btn:hover { border-color: var(--primary, #2490ef); color: var(--primary, #2490ef); }

      /* ── Detail Panel ─────────────────────────────────────── */
      .opp-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 1040;
        opacity: 0; transition: opacity .25s; pointer-events: none;
      }
      .opp-overlay.visible { opacity: 1; pointer-events: all; }

      .opp-panel {
        position: fixed; top: 0; right: -56%; width: 56%; max-width: 740px;
        height: 100vh; background: var(--bg-color, #f8f9fa); z-index: 1050;
        box-shadow: -6px 0 28px rgba(0,0,0,.15);
        display: flex; flex-direction: column;
        transition: right .28s cubic-bezier(.4,0,.2,1);
        overflow: hidden;
      }
      .opp-panel.open { right: 0; }

      /* Panel header */
      .opp-panel-hdr {
        background: white; padding: 12px 16px;
        border-bottom: 1px solid var(--border-color, #e2e8f0);
        display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      }
      .opp-back-btn {
        font-size: 12px; color: var(--text-muted, #6b7280); cursor: pointer;
        padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border-color, #e2e8f0);
        background: white; transition: all .15s; white-space: nowrap;
      }
      .opp-back-btn:hover { border-color: var(--primary, #2490ef); color: var(--primary, #2490ef); }
      .opp-panel-id { font-size: 13px; font-weight: 600; color: var(--text-muted, #6b7280); flex: 1; }
      .opp-panel-hdr-acts { display: flex; gap: 6px; }

      /* Shared button style */
      .opp-btn {
        padding: 6px 13px; border-radius: 6px; font-size: 12px; font-weight: 500;
        cursor: pointer; border: 1px solid; white-space: nowrap; transition: all .15s;
      }
      .opp-btn-primary { background: var(--primary, #2490ef); color: #fff; border-color: var(--primary, #2490ef); }
      .opp-btn-primary:hover { opacity: .9; }
      .opp-btn-default { background: white; color: var(--text-color, #1a1a1a); border-color: var(--border-color, #e2e8f0); }
      .opp-btn-default:hover { border-color: var(--primary, #2490ef); color: var(--primary, #2490ef); }
      .opp-btn-danger { background: white; color: #dc2626; border-color: #fca5a5; }
      .opp-btn-danger:hover { background: #fee2e2; }
      .opp-btn-success { background: #059669; color: #fff; border-color: #059669; }
      .opp-btn-success:hover { background: #047857; }

      /* Panel scroll area */
      .opp-panel-scroll { flex: 1; overflow-y: auto; }

      /* Hero section */
      .opp-panel-hero {
        background: white; padding: 16px 20px; margin-bottom: 10px;
      }
      .opp-hero-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
      .opp-hero-name { font-size: 20px; font-weight: 700; color: var(--text-color, #1a1a1a); }
      .opp-hero-id { font-size: 11px; color: var(--text-muted, #6b7280); margin-top: 2px; }

      .opp-hero-metrics {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 10px; padding-top: 14px;
        border-top: 1px solid var(--border-color, #e2e8f0);
      }
      .opp-metric { display: flex; flex-direction: column; gap: 2px; }
      .opp-metric-lbl { font-size: 10px; color: var(--text-muted, #6b7280); text-transform: uppercase; letter-spacing: .5px; }
      .opp-metric-val { font-size: 14px; font-weight: 600; color: var(--text-color, #1a1a1a); }
      .opp-metric-val.amount { color: #059669; font-size: 16px; }
      .opp-metric-val.overdue { color: #dc2626; }

      .opp-stage-progress { margin-top: 12px; }
      .opp-stage-lbl { font-size: 11px; color: var(--text-muted, #6b7280); margin-bottom: 5px; }

      /* Tabs */
      .opp-tabs {
        background: white; border-bottom: 1px solid var(--border-color, #e2e8f0);
        padding: 0 20px; display: flex; gap: 0;
        position: sticky; top: 0; z-index: 20;
      }
      .opp-tab {
        padding: 10px 14px; font-size: 12px; font-weight: 500;
        color: var(--text-muted, #6b7280); border: none; background: none; cursor: pointer;
        border-bottom: 2px solid transparent; margin-bottom: -1px;
        transition: all .15s; white-space: nowrap;
      }
      .opp-tab:hover { color: var(--text-color, #1a1a1a); }
      .opp-tab.active { color: var(--primary, #2490ef); border-bottom-color: var(--primary, #2490ef); }

      .opp-tab-pane { padding: 14px 16px; display: none; }
      .opp-tab-pane.active { display: block; }

      /* Info cards */
      .opp-info-card {
        background: white; border-radius: 8px; padding: 12px 14px;
        margin-bottom: 10px; border: 1px solid var(--border-color, #e2e8f0);
      }
      .opp-info-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .7px; color: var(--text-muted, #6b7280); margin-bottom: 10px;
      }
      .opp-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
      .opp-info-row { display: flex; flex-direction: column; gap: 2px; }
      .opp-info-row.full { grid-column: 1 / -1; }
      .opp-info-lbl { font-size: 10px; color: var(--text-muted, #6b7280); }
      .opp-info-val { font-size: 12px; font-weight: 500; color: var(--text-color, #1a1a1a); word-break: break-word; }
      .opp-info-val.muted { font-weight: 400; color: var(--text-muted, #6b7280); font-style: italic; }

      /* Contact block */
      .opp-contact-block {
        display: flex; gap: 12px; align-items: flex-start;
        background: white; border-radius: 8px; padding: 14px;
        margin-bottom: 10px; border: 1px solid var(--border-color, #e2e8f0);
      }
      .opp-contact-avatar {
        width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
        background: linear-gradient(135deg, var(--primary, #2490ef), #7c3aed);
        color: white; font-size: 16px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
      }
      .opp-contact-name { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
      .opp-contact-line {
        display: flex; align-items: center; gap: 6px;
        font-size: 12px; color: var(--text-muted, #6b7280); margin-bottom: 3px;
      }
      .opp-contact-line a { color: var(--primary, #2490ef); text-decoration: none; }

      /* Items table */
      .opp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .opp-table th {
        text-align: left; padding: 7px 10px;
        background: var(--gray-50, #f9fafb);
        border-bottom: 1px solid var(--border-color, #e2e8f0);
        font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
        color: var(--text-muted, #6b7280); font-weight: 600;
      }
      .opp-table td { padding: 9px 10px; border-bottom: 1px solid var(--border-color, #e2e8f0); }
      .opp-table tr:last-child td { border-bottom: none; }
      .opp-table .total-row td { font-weight: 700; background: var(--gray-50, #f9fafb); border-top: 2px solid var(--border-color, #e2e8f0); }
      .text-right { text-align: right !important; }

      /* Panel footer */
      .opp-panel-ftr {
        background: white; padding: 12px 16px;
        border-top: 1px solid var(--border-color, #e2e8f0);
        display: flex; gap: 8px; flex-shrink: 0;
      }

      /* Empty state sm */
      .opp-empty-sm {
        text-align: center; padding: 30px 20px;
        color: var(--text-muted, #6b7280); font-size: 13px;
      }

      /* ── Wizard ───────────────────────────────────────────── */
      .opp-wiz-steps {
        display: flex; justify-content: space-between; align-items: flex-start;
        position: relative; padding: 4px 8px 18px; border-bottom: 1px solid var(--border-color, #e2e8f0);
        margin-bottom: 20px;
      }
      .opp-wiz-steps::before {
        content: ''; position: absolute; top: 14px;
        left: calc(12.5%); right: calc(12.5%);
        height: 2px; background: var(--border-color, #e2e8f0); z-index: 0;
      }
      .opp-wiz-step { display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; position: relative; z-index: 1; }
      .opp-wiz-circle {
        width: 28px; height: 28px; border-radius: 50%; background: white;
        border: 2px solid var(--border-color, #e2e8f0);
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; color: var(--text-muted, #6b7280);
        transition: all .2s;
      }
      .opp-wiz-step.active .opp-wiz-circle { background: var(--primary, #2490ef); border-color: var(--primary, #2490ef); color: white; }
      .opp-wiz-step.done .opp-wiz-circle { background: #059669; border-color: #059669; color: white; }
      .opp-wiz-lbl { font-size: 10px; font-weight: 500; color: var(--text-muted, #6b7280); text-align: center; }
      .opp-wiz-step.active .opp-wiz-lbl { color: var(--primary, #2490ef); font-weight: 700; }
      .opp-wiz-step.done .opp-wiz-lbl { color: #059669; }

      .opp-wiz-content { display: none; }
      .opp-wiz-content.active { display: block; }
      .opp-wiz-content h6 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-color, #1a1a1a); }

      /* Party type cards */
      .opp-pt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .opp-pt-card {
        border: 2px solid var(--border-color, #e2e8f0); border-radius: 10px;
        padding: 18px 12px; text-align: center; cursor: pointer;
        transition: all .15s;
      }
      .opp-pt-card:hover { border-color: var(--primary, #2490ef); background: #eff6ff; }
      .opp-pt-card.selected { border-color: var(--primary, #2490ef); background: #eff6ff; }
      .opp-pt-icon { font-size: 28px; margin-bottom: 6px; }
      .opp-pt-name { font-size: 14px; font-weight: 600; }
      .opp-pt-desc { font-size: 11px; color: var(--text-muted, #6b7280); margin-top: 3px; }

      /* Party search */
      .opp-party-search { margin-top: 14px; }
      .opp-party-search label { font-size: 12px; font-weight: 600; margin-bottom: 5px; display: block; }

      /* Wizard form grid */
      .opp-wiz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .opp-wiz-field { display: flex; flex-direction: column; gap: 4px; }
      .opp-wiz-field.full { grid-column: 1 / -1; }
      .opp-lbl { font-size: 11px; font-weight: 600; color: var(--text-color, #1a1a1a); }
      .opp-lbl.req::after { content: ' *'; color: #dc2626; }
      .opp-input, .opp-select, .opp-textarea {
        padding: 6px 10px; border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 6px; font-size: 12px; color: var(--text-color, #1a1a1a);
        background: white; width: 100%; outline: none;
        transition: border-color .15s; box-sizing: border-box;
      }
      .opp-input:focus, .opp-select:focus, .opp-textarea:focus { border-color: var(--primary, #2490ef); }
      .opp-textarea { resize: vertical; min-height: 60px; }
      .opp-range { width: 100%; margin-top: 4px; }
      .opp-prob-val { font-size: 18px; font-weight: 700; color: var(--primary, #2490ef); text-align: center; }

      /* Link field dropdown */
      .opp-link-wrap { position: relative; }
      .opp-link-dd {
        position: absolute; top: 100%; left: 0; right: 0; z-index: 300;
        background: white; border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.1);
        max-height: 180px; overflow-y: auto; margin-top: 2px;
      }
      .opp-dd-item {
        padding: 7px 12px; font-size: 12px; cursor: pointer;
        color: var(--text-color, #1a1a1a); transition: background .1s;
      }
      .opp-dd-item:hover { background: var(--gray-50, #f9fafb); }
      .opp-dd-item.muted { color: var(--text-muted, #6b7280); cursor: default; }

      /* Wizard nav */
      .opp-wiz-nav {
        display: flex; justify-content: space-between; align-items: center;
        padding-top: 16px; border-top: 1px solid var(--border-color, #e2e8f0);
        margin-top: 16px;
      }
      .opp-step-ind { font-size: 11px; color: var(--text-muted, #6b7280); }

      /* Review */
      .opp-review-card {
        background: var(--gray-50, #f9fafb); border-radius: 8px; padding: 14px;
        border: 1px solid var(--border-color, #e2e8f0);
      }
      .opp-review-section { margin-bottom: 14px; }
      .opp-review-section:last-child { margin-bottom: 0; }
      .opp-review-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted, #6b7280); margin-bottom: 8px; }
      .opp-review-row {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 4px 0; border-bottom: 1px solid var(--border-color, #e2e8f0);
        font-size: 12px;
      }
      .opp-review-row:last-child { border-bottom: none; }
      .opp-review-row span:first-child { color: var(--text-muted, #6b7280); }
      .opp-review-row span:last-child { font-weight: 500; text-align: right; max-width: 55%; }

      /* Responsive */
      @media (max-width: 800px) {
        .opp-panel { width: 100%; right: -100%; }
        .opp-hero-metrics { grid-template-columns: repeat(2, 1fr); }
        .opp-wiz-grid { grid-template-columns: 1fr; }
        .opp-pt-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 600px) {
        .opp-grid { grid-template-columns: 1fr; }
      }
    `).appendTo('head');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function esc(s) { return frappe.utils.escape_html(String(s || '')); }

  function fmt_currency(amount, currency) {
    if (!amount) return '';
    try { return format_currency(flt(amount), currency); }
    catch (e) { return `${currency || ''} ${flt(amount).toFixed(2)}`; }
  }

  function days_from_today(date_str) {
    if (!date_str) return null;
    return frappe.datetime.get_day_diff(date_str, frappe.datetime.get_today());
  }

  function closing_html(date_str) {
    if (!date_str) return '';
    const diff = days_from_today(date_str);
    const label = frappe.datetime.str_to_user(date_str);
    const cls = diff < 0 ? 'overdue' : '';
    const prefix = diff < 0 ? '⚠ ' : '📅 ';
    return `<span class="opp-closing ${cls}">${prefix}${label}</span>`;
  }

  function owner_initials(owner) {
    const name = (owner || '').split('@')[0];
    return name.substring(0, 2).toUpperCase() || '?';
  }

  function stage_pct(stage) {
    const idx = STAGES.indexOf(stage);
    return idx < 0 ? 5 : Math.round((idx + 1) / STAGES.length * 100);
  }

  // Create a simple link field (input + live-search dropdown)
  function make_link_field($parent, doctype, on_select, placeholder) {
    $parent.addClass('opp-link-wrap').empty();
    const $input = $('<input type="text" class="opp-input">');
    const hint = placeholder || __('Type to find') + ' ' + __(doctype);
    $input.attr('placeholder', hint + '...');
    $parent.append($input);

    let timer;
    $input.on('input', function () {
      clearTimeout(timer);
      const q = $(this).val().trim();
      let $dd = $parent.find('.opp-link-dd');
      if (!q) { $dd.remove(); on_select(''); return; }
      timer = setTimeout(async () => {
        const rows = await frappe.db.get_list(doctype, {
          filters: [['name', 'like', `%${q}%`]],
          fields: ['name'], limit: 8,
        });
        if (!$dd.length) $dd = $('<div class="opp-link-dd"></div>').appendTo($parent);
        if (rows.length) {
          $dd.html(rows.map(r => `<div class="opp-dd-item" data-val="${esc(r.name)}">${esc(r.name)}</div>`).join(''));
        } else {
          $dd.html(`<div class="opp-dd-item muted">${__('No results')}</div>`);
        }
        $dd.off('click').on('click', '.opp-dd-item[data-val]', function () {
          const val = $(this).data('val');
          $input.val(val);
          $(this).closest('.opp-link-dd').remove();
          on_select(val);
        });
      }, 240);
    });

    $input.on('blur', function () {
      setTimeout(() => $parent.find('.opp-link-dd').remove(), 200);
    });

    return {
      get_value: () => $input.val(),
      set_value: (v) => { $input.val(v); on_select(v); },
    };
  }

  // ── List Controller ───────────────────────────────────────────────────────

  class OppListView {
    constructor(lv) {
      this.lv = lv;
      this.page = lv.page;
      this.status_filter = 'All';
      this.search_val = '';
      this.sort_val = 'creation desc';
      this.limit_start = 0;
      this.has_more = false;
    }

    init() {
      this._setup_page();
      this._inject_ui();
      this._bind();
      this._load();
    }

    _setup_page() {
      // Override primary button → wizard
      this.page.set_primary_action(__('New Opportunity'), () => new OppWizard(this).show(), 'octicon octicon-plus');

      // Standard menu items (same as ERPNext)
      this.page.add_menu_item(__('Set as Open'), () => {
        this.lv.call_for_selected_items(
          'erpnext.crm.doctype.opportunity.opportunity.set_multiple_status',
          { status: 'Open' }
        );
      });
      this.page.add_menu_item(__('Set as Closed'), () => {
        this.lv.call_for_selected_items(
          'erpnext.crm.doctype.opportunity.opportunity.set_multiple_status',
          { status: 'Closed' }
        );
      });

      // Hide Frappe's standard list result (we render our own)
      this.lv.$result.hide();
    }

    _inject_ui() {
      const statuses = ['All', 'Open', 'Quotation', 'Converted', 'Lost', 'Replied', 'Closed'];
      const pills = statuses.map(s =>
        `<button class="opp-pill${s === 'All' ? ' active' : ''}" data-status="${s}">${__(s)}</button>`
      ).join('');

      const html = `
        <div class="opp-filter-bar">
          <div class="opp-pills">${pills}</div>
          <div class="opp-search-wrap">
            <span class="opp-search-icon">🔍</span>
            <input class="opp-search" placeholder="${__('Find customer or title...')}">
          </div>
          <select class="opp-sort">
            <option value="creation desc">${__('Newest First')}</option>
            <option value="opportunity_amount desc">${__('Highest Amount')}</option>
            <option value="expected_closing asc">${__('Closing Soon')}</option>
            <option value="modified desc">${__('Recently Updated')}</option>
          </select>
          <span class="opp-count"></span>
        </div>
        <div class="opp-grid"></div>
        <div class="opp-loadmore-wrap" style="display:none">
          <button class="opp-loadmore-btn">${__('Load More')}</button>
        </div>
      `;
      $(html).insertAfter(this.lv.$result);
      this.$bar     = $('.opp-filter-bar');
      this.$grid    = $('.opp-grid');
      this.$more    = $('.opp-loadmore-wrap');
      this.$count   = $('.opp-count');
    }

    _bind() {
      // Status pills
      this.$bar.on('click', '.opp-pill', (e) => {
        this.$bar.find('.opp-pill').removeClass('active');
        const $p = $(e.currentTarget).addClass('active');
        this.status_filter = $p.data('status');
        this.limit_start = 0;
        this._load();
      });

      // Search (debounced)
      let st;
      this.$bar.on('input', '.opp-search', (e) => {
        clearTimeout(st);
        st = setTimeout(() => {
          this.search_val = $(e.target).val().trim();
          this.limit_start = 0;
          this._load();
        }, 360);
      });

      // Sort
      this.$bar.on('change', '.opp-sort', (e) => {
        this.sort_val = $(e.target).val();
        this.limit_start = 0;
        this._load();
      });

      // Load more
      this.$more.on('click', '.opp-loadmore-btn', () => {
        this.limit_start += PAGE_SIZE;
        this._load(true);
      });

      // Card click → detail panel
      this.$grid.on('click', '.opp-card', (e) => {
        if (!$(e.target).closest('.opp-card-menu').length) {
          new OppDetailPanel($(e.currentTarget).data('name'), this).open();
        }
      });

      // Card menu actions
      this.$grid.on('click', '.opp-menu-item', (e) => {
        e.stopPropagation();
        const action = $(e.currentTarget).data('action');
        const name   = $(e.currentTarget).closest('.opp-card').data('name');
        this._card_action(action, name);
      });
    }

    _build_filters() {
      const f = [];
      if (this.status_filter !== 'All') f.push(['status', '=', this.status_filter]);
      if (this.search_val) {
        f.push(['customer_name', 'like', `%${this.search_val}%`]);
      }
      return f;
    }

    async _load(append = false) {
      this.$grid.css('opacity', append ? 1 : 0.55);
      try {
        const data = await frappe.db.get_list('Opportunity', {
          filters: this._build_filters(),
          fields: LIST_FIELDS,
          limit: PAGE_SIZE,
          limit_start: this.limit_start,
          order_by: this.sort_val,
        });

        if (!append) this.$grid.empty();

        this.has_more = data.length === PAGE_SIZE;
        this.$more.toggle(this.has_more);

        if (data.length) {
          data.forEach(doc => this.$grid.append(this._card_html(doc)));
        } else if (!append) {
          this.$grid.html(this._empty_html());
        }

        const total = this.limit_start + data.length;
        this.$count.text(total ? `${total} ${__('opportunities')}` : '');
      } catch (err) {
        frappe.show_alert({ message: __('Error loading opportunities'), indicator: 'red' });
      } finally {
        this.$grid.css('opacity', 1);
      }
    }

    _card_html(doc) {
      const s   = STATUS_CFG[doc.status] || STATUS_CFG.Open;
      const pct = stage_pct(doc.sales_stage);
      const amt = doc.opportunity_amount
        ? `<span class="opp-card-amount">${fmt_currency(doc.opportunity_amount, doc.currency)}</span>`
        : `<span class="opp-card-amount empty">${__('No amount set')}</span>`;

      return `
        <div class="opp-card" data-name="${esc(doc.name)}" style="border-left-color:${s.color}">
          <div class="opp-card-head">
            <span class="opp-badge" style="background:${s.bg};color:${s.color}">${__(doc.status)}</span>
            <div class="opp-card-menu">
              <button class="opp-menu-btn" title="${__('Actions')}">⋮</button>
              <div class="opp-menu-dd">
                <div class="opp-menu-item" data-action="view">${__('View Details')}</div>
                <div class="opp-menu-item" data-action="edit">${__('Edit in ERPNext')}</div>
                <div class="opp-menu-item" data-action="quotation">${__('Create Quotation')}</div>
                <div class="opp-menu-item danger" data-action="lost">${__('Mark as Lost')}</div>
              </div>
            </div>
          </div>
          <div class="opp-card-name">${esc(doc.customer_name || doc.party_name || doc.name)}</div>
          <div class="opp-card-id">${esc(doc.name)}</div>
          ${amt}
          ${doc.sales_stage ? `
            <div class="opp-stage-row">
              <div class="opp-stage-name">${__(doc.sales_stage)}</div>
              <div class="opp-stage-track"><div class="opp-stage-fill" style="width:${pct}%"></div></div>
            </div>` : ''}
          <div class="opp-card-foot">
            <div class="opp-avatar-row">
              <span class="opp-avatar">${owner_initials(doc.opportunity_owner)}</span>
              <span>${esc((doc.opportunity_owner || '').split('@')[0])}</span>
            </div>
            ${closing_html(doc.expected_closing)}
          </div>
        </div>`;
    }

    _empty_html() {
      return `
        <div class="opp-empty">
          <div class="opp-empty-icon">📋</div>
          <h5>${__('No Opportunities Found')}</h5>
          <p>${__('Try adjusting your filters or create a new opportunity.')}</p>
        </div>`;
    }

    _card_action(action, name) {
      if (action === 'view') {
        new OppDetailPanel(name, this).open();
      } else if (action === 'edit') {
        frappe.set_route('Form', 'Opportunity', name);
      } else if (action === 'quotation') {
        frappe.model.open_mapped_doc({
          method: 'erpnext.crm.doctype.opportunity.opportunity.make_quotation',
          source_name: name,
        });
      } else if (action === 'lost') {
        this._show_lost_dialog(name);
      }
    }

    _show_lost_dialog(name) {
      frappe.call({
        method: 'frappe.client.get_list',
        args: {
          doctype: 'Opportunity Lost Reason',
          fields: ['name'],
          limit: 50,
        },
        callback: (r) => {
          const reasons = (r.message || []).map(x => x.name);
          const d = new frappe.ui.Dialog({
            title: __('Mark as Lost'),
            fields: [
              {
                fieldname: 'lost_reasons', label: __('Lost Reasons'),
                fieldtype: 'MultiSelectList',
                get_data: () => reasons.map(r => ({ label: r, value: r, description: '' })),
                reqd: 1,
              },
              {
                fieldname: 'competitors', label: __('Competitors'),
                fieldtype: 'Small Text',
              },
              {
                fieldname: 'detailed_reason', label: __('Detailed Reason'),
                fieldtype: 'Small Text',
              },
            ],
            primary_action_label: __('Mark Lost'),
            primary_action: (vals) => {
              const lost_reasons = (vals.lost_reasons || []).map(r => ({ lost_reason: r }));
              frappe.call({
                method: 'erpnext.crm.doctype.opportunity.opportunity.Opportunity.declare_enquiry_lost',
                args: {
                  doc: name,
                  lost_reasons_list: lost_reasons,
                  competitors: [],
                  detailed_reason: vals.detailed_reason,
                },
                callback: () => {
                  d.hide();
                  frappe.show_alert({ message: __('Marked as Lost'), indicator: 'red' });
                  this._load();
                },
              });
            },
          });
          d.show();
        },
      });
    }

    refresh() { this.limit_start = 0; this._load(); }
  }

  // ── Detail Panel ──────────────────────────────────────────────────────────

  class OppDetailPanel {
    constructor(name, list_ctrl) {
      this.name = name;
      this.lc   = list_ctrl;
      this.doc  = null;
    }

    async open() {
      this._create_dom();
      requestAnimationFrame(() => {
        this._overlay.addClass('visible');
        this._panel.addClass('open');
      });
      await this._load();
    }

    close() {
      this._panel.removeClass('open');
      this._overlay.removeClass('visible');
      setTimeout(() => { this._overlay.remove(); this._panel.remove(); }, 300);
    }

    _create_dom() {
      this._overlay = $('<div class="opp-overlay"></div>').appendTo('body');
      this._panel   = $(`
        <div class="opp-panel">
          <div class="opp-panel-hdr">
            <button class="opp-back-btn">← ${__('Back')}</button>
            <span class="opp-panel-id"></span>
            <div class="opp-panel-hdr-acts">
              <button class="opp-btn opp-btn-default opp-p-edit">${__('Edit')}</button>
              <button class="opp-btn opp-btn-danger opp-p-lost">${__('Mark Lost')}</button>
            </div>
          </div>
          <div class="opp-panel-scroll">
            <div class="opp-panel-hero">
              <div style="padding:24px;text-align:center;color:var(--text-muted)">${__('Loading...')}</div>
            </div>
            <div class="opp-tabs">
              <button class="opp-tab active" data-tab="overview">${__('Overview')}</button>
              <button class="opp-tab" data-tab="contact">${__('Contacts')}</button>
              <button class="opp-tab" data-tab="items">${__('Items')}</button>
              <button class="opp-tab" data-tab="activity">${__('Activity')}</button>
            </div>
            <div class="opp-tab-pane active" data-pane="overview"></div>
            <div class="opp-tab-pane" data-pane="contact"></div>
            <div class="opp-tab-pane" data-pane="items"></div>
            <div class="opp-tab-pane" data-pane="activity"></div>
          </div>
          <div class="opp-panel-ftr">
            <button class="opp-btn opp-btn-success opp-p-quotation">${__('Create Quotation')}</button>
            <button class="opp-btn opp-btn-default opp-p-close">${__('Close Opportunity')}</button>
            <button class="opp-btn opp-btn-default opp-p-reopen" style="display:none">${__('Reopen')}</button>
          </div>
        </div>`).appendTo('body');

      // Events
      this._overlay.on('click', () => this.close());
      this._panel.find('.opp-back-btn').on('click', () => this.close());
      this._panel.find('.opp-p-edit').on('click', () => frappe.set_route('Form', 'Opportunity', this.name));
      this._panel.find('.opp-p-lost').on('click', () => this.lc._show_lost_dialog(this.name));
      this._panel.find('.opp-p-quotation').on('click', () => {
        frappe.model.open_mapped_doc({
          method: 'erpnext.crm.doctype.opportunity.opportunity.make_quotation',
          source_name: this.name,
        });
      });
      this._panel.find('.opp-p-close').on('click', () => this._set_status('Closed'));
      this._panel.find('.opp-p-reopen').on('click', () => this._set_status('Open'));

      // Tab switching
      this._panel.on('click', '.opp-tab', (e) => {
        const tab = $(e.currentTarget).data('tab');
        this._panel.find('.opp-tab').removeClass('active');
        $(e.currentTarget).addClass('active');
        this._panel.find('.opp-tab-pane').removeClass('active');
        this._panel.find(`[data-pane="${tab}"]`).addClass('active');
      });
    }

    async _load() {
      try {
        this.doc = await frappe.db.get_doc('Opportunity', this.name);
        this._render();
      } catch (e) {
        this._panel.find('.opp-panel-hero').html(
          `<div style="padding:20px;color:#dc2626">${__('Could not load opportunity.')}</div>`
        );
      }
    }

    _render() {
      const d   = this.doc;
      const s   = STATUS_CFG[d.status] || STATUS_CFG.Open;
      const pct = stage_pct(d.sales_stage);
      const diff = days_from_today(d.expected_closing);

      this._panel.find('.opp-panel-id').text(d.name);

      // Show/hide Reopen vs Close
      const is_closed = ['Closed', 'Lost', 'Converted'].includes(d.status);
      this._panel.find('.opp-p-close').toggle(!is_closed);
      this._panel.find('.opp-p-reopen').toggle(is_closed);

      // ── Hero
      this._panel.find('.opp-panel-hero').html(`
        <div class="opp-hero-top">
          <div>
            <div class="opp-hero-name">${esc(d.customer_name || d.party_name)}</div>
            <div class="opp-hero-id">${esc(d.name)} &nbsp;·&nbsp; ${esc(d.opportunity_from || '')}</div>
          </div>
          <span class="opp-badge" style="background:${s.bg};color:${s.color};font-size:11px;padding:4px 12px">${__(d.status)}</span>
        </div>
        <div class="opp-hero-metrics">
          <div class="opp-metric">
            <span class="opp-metric-lbl">${__('Amount')}</span>
            <span class="opp-metric-val amount">${d.opportunity_amount ? fmt_currency(d.opportunity_amount, d.currency) : '—'}</span>
          </div>
          <div class="opp-metric">
            <span class="opp-metric-lbl">${__('Probability')}</span>
            <span class="opp-metric-val">${d.probability || 0}%</span>
          </div>
          <div class="opp-metric">
            <span class="opp-metric-lbl">${__('Closing')}</span>
            <span class="opp-metric-val${diff !== null && diff < 0 ? ' overdue' : ''}">
              ${d.expected_closing ? frappe.datetime.str_to_user(d.expected_closing) : '—'}
            </span>
          </div>
          <div class="opp-metric">
            <span class="opp-metric-lbl">${__('Owner')}</span>
            <span class="opp-metric-val">${esc((d.opportunity_owner || '').split('@')[0] || '—')}</span>
          </div>
        </div>
        ${d.sales_stage ? `
          <div class="opp-stage-progress">
            <div class="opp-stage-lbl">${__(d.sales_stage)} &nbsp; ${pct}%</div>
            <div class="opp-stage-track"><div class="opp-stage-fill" style="width:${pct}%"></div></div>
          </div>` : ''}
      `);

      // ── Overview tab
      this._panel.find('[data-pane="overview"]').html(`
        <div class="opp-info-card">
          <div class="opp-info-title">${__('Deal Details')}</div>
          <div class="opp-info-grid">
            ${this._row(__('Type'), d.opportunity_type)}
            ${this._row(__('Source'), d.utm_source)}
            ${this._row(__('Company'), d.company)}
            ${this._row(__('Date'), d.transaction_date ? frappe.datetime.str_to_user(d.transaction_date) : null)}
            ${this._row(__('Opportunity Owner'), d.opportunity_owner)}
            ${this._row(__('Team'), d.team)}
            ${this._row(__('Territory'), d.territory)}
            ${this._row(__('Customer Group'), d.customer_group)}
            ${d.description ? this._row(__('Description'), d.description, true) : ''}
          </div>
        </div>
        <div class="opp-info-card">
          <div class="opp-info-title">${__('Organization')}</div>
          <div class="opp-info-grid">
            ${this._row(__('Industry'), d.industry)}
            ${this._row(__('Market Segment'), d.market_segment)}
            ${this._row(__('Employees'), d.no_of_employees)}
            ${this._row(__('Annual Revenue'), d.annual_revenue ? fmt_currency(d.annual_revenue) : null)}
            ${this._row(__('City'), d.city)}
            ${this._row(__('Country'), d.country)}
            ${d.website ? `<div class="opp-info-row">
              <span class="opp-info-lbl">${__('Website')}</span>
              <span class="opp-info-val"><a href="${esc(d.website)}" target="_blank">${esc(d.website)}</a></span>
            </div>` : ''}
          </div>
        </div>
        ${d.utm_source || d.utm_medium || d.utm_campaign ? `
        <div class="opp-info-card">
          <div class="opp-info-title">${__('Analytics (UTM)')}</div>
          <div class="opp-info-grid">
            ${this._row(__('Source'), d.utm_source)}
            ${this._row(__('Medium'), d.utm_medium)}
            ${this._row(__('Campaign'), d.utm_campaign)}
            ${this._row(__('Content'), d.utm_content)}
          </div>
        </div>` : ''}
        ${d.status === 'Lost' ? `
        <div class="opp-info-card" style="border-color:#fca5a5">
          <div class="opp-info-title" style="color:#dc2626">${__('Lost Details')}</div>
          <div class="opp-info-grid">
            ${this._row(__('Reason'), d.order_lost_reason)}
            ${d.competitors && d.competitors.length ? this._row(__('Competitors'), d.competitors.map(c => c.competitor).join(', ')) : ''}
          </div>
        </div>` : ''}
      `);

      // ── Contacts tab
      this._panel.find('[data-pane="contact"]').html(`
        ${d.contact_person ? `
          <div class="opp-contact-block">
            <div class="opp-contact-avatar">${esc(d.contact_person[0] || '?').toUpperCase()}</div>
            <div>
              <div class="opp-contact-name">${esc(d.contact_person)}</div>
              ${d.contact_email ? `<div class="opp-contact-line">📧 <a href="mailto:${esc(d.contact_email)}">${esc(d.contact_email)}</a></div>` : ''}
              ${d.contact_mobile ? `<div class="opp-contact-line">📱 ${esc(d.contact_mobile)}</div>` : ''}
              ${d.whatsapp ? `<div class="opp-contact-line">💬 ${esc(d.whatsapp)}</div>` : ''}
              ${d.phone ? `<div class="opp-contact-line">📞 ${esc(d.phone)}${d.phone_ext ? ' x' + esc(d.phone_ext) : ''}</div>` : ''}
            </div>
          </div>` : `<div class="opp-empty-sm">${__('No primary contact')}</div>`}
        ${d.contact_list && d.contact_list.length ? `
          <div class="opp-info-card">
            <div class="opp-info-title">${__('Contact List')}</div>
            <table class="opp-table">
              <thead><tr><th>${__('Contact')}</th><th>${__('Email')}</th><th>${__('Mobile')}</th></tr></thead>
              <tbody>${d.contact_list.map(c => `
                <tr>
                  <td>${esc(c.contact || '')}</td>
                  <td>${esc(c.email_id || '')}</td>
                  <td>${esc(c.mobile_no || '')}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
      `);

      // ── Items tab
      this._panel.find('[data-pane="items"]').html(
        d.items && d.items.length ? `
          <div class="opp-info-card">
            <table class="opp-table">
              <thead>
                <tr>
                  <th>${__('Item')}</th><th>${__('Qty')}</th>
                  <th>${__('UOM')}</th>
                  <th class="text-right">${__('Rate')}</th>
                  <th class="text-right">${__('Amount')}</th>
                </tr>
              </thead>
              <tbody>${d.items.map(item => `
                <tr>
                  <td>
                    <div style="font-weight:600">${esc(item.item_name || item.item_code)}</div>
                    ${item.description ? `<div style="font-size:10px;color:var(--text-muted)">${esc(item.description)}</div>` : ''}
                  </td>
                  <td>${item.qty}</td>
                  <td>${esc(item.uom || '')}</td>
                  <td class="text-right">${fmt_currency(item.rate, d.currency)}</td>
                  <td class="text-right">${fmt_currency(item.amount, d.currency)}</td>
                </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="4" class="text-right"><strong>${__('Total')}</strong></td>
                  <td class="text-right"><strong>${fmt_currency(d.total, d.currency)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>` : `<div class="opp-empty-sm">${__('No items added to this opportunity')}</div>`
      );

      // ── Activity tab (load async)
      this._panel.find('[data-pane="activity"]').html(
        `<div class="opp-info-card">
          <div class="opp-info-title">${__('Communications & Activity')}</div>
          <div class="opp-activity-feed"><div class="opp-empty-sm">${__('Loading...')}</div></div>
        </div>`
      );
      this._load_activity();
    }

    _row(label, value, full = false) {
      const val_html = value
        ? `<span class="opp-info-val">${esc(value)}</span>`
        : `<span class="opp-info-val muted">${__('—')}</span>`;
      return `<div class="opp-info-row${full ? ' full' : ''}">
        <span class="opp-info-lbl">${label}</span>${val_html}
      </div>`;
    }

    async _load_activity() {
      try {
        const comms = await frappe.db.get_list('Communication', {
          filters: { reference_doctype: 'Opportunity', reference_name: this.name },
          fields: ['sender', 'subject', 'creation', 'sent_or_received', 'communication_type'],
          limit: 15, order_by: 'creation desc',
        });
        const $feed = this._panel.find('.opp-activity-feed');
        if (!comms.length) {
          $feed.html(`<div class="opp-empty-sm">${__('No communications yet')}</div>`);
          return;
        }
        $feed.html(comms.map(c => `
          <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color,#e2e8f0)">
            <div class="opp-avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0">
              ${esc((c.sender || 'S')[0]).toUpperCase()}
            </div>
            <div>
              <div style="font-size:12px;font-weight:500">${esc(c.subject || c.sender || __('Communication'))}</div>
              <div style="font-size:10px;color:var(--text-muted)">${frappe.datetime.prettyDate(c.creation)}</div>
            </div>
          </div>`).join(''));
      } catch (e) { /* silent */ }
    }

    _set_status(status) {
      frappe.call({
        method: 'frappe.client.set_value',
        args: { doctype: 'Opportunity', name: this.name, fieldname: 'status', value: status },
        callback: () => {
          frappe.show_alert({ message: __(`Status set to ${status}`), indicator: status === 'Closed' ? 'grey' : 'green' });
          this.lc.refresh();
          this.close();
        },
      });
    }
  }

  // ── Wizard ────────────────────────────────────────────────────────────────

  class OppWizard {
    constructor(list_ctrl) {
      this.lc   = list_ctrl;
      this.step = 0;
      this.data = {
        opportunity_from: '', party_name: '',
        company: frappe.defaults.get_user_default('Company') || '',
        currency: frappe.defaults.get_user_default('Currency') || '',
        opportunity_type: 'Sales',
        sales_stage: 'Prospecting',
        opportunity_amount: '', expected_closing: '',
        opportunity_owner: frappe.session.user,
        probability: 100,
        description: '',
        contact_person: '', contact_email: '', contact_mobile: '', whatsapp: '',
      };
      this._link_controls = {};
    }

    show() {
      this.dialog = new frappe.ui.Dialog({
        title: __('New Opportunity'),
        size: 'large',
      });
      // Remove default footer buttons; we manage nav ourselves
      this.dialog.get_close_btn().show();
      this.dialog.$wrapper.find('.modal-footer .btn-primary, .modal-footer .btn-secondary').remove();

      this._build($(this.dialog.$wrapper.find('.modal-body')));
      this.dialog.show();
    }

    _build($body) {
      const steps_html = [
        __('Party'), __('Deal Details'), __('Contact'), __('Review'),
      ].map((lbl, i) => `
        <div class="opp-wiz-step${i === 0 ? ' active' : ''}" data-step="${i}">
          <div class="opp-wiz-circle">${i + 1}</div>
          <div class="opp-wiz-lbl">${lbl}</div>
        </div>`).join('');

      $body.html(`
        <div class="opp-wiz-steps">${steps_html}</div>

        <!-- Step 0: Party -->
        <div class="opp-wiz-content active" data-step="0">
          <h6>${__('Who is this opportunity for?')}</h6>
          <div class="opp-pt-grid">
            <div class="opp-pt-card" data-type="Lead">
              <div class="opp-pt-icon">👤</div>
              <div class="opp-pt-name">${__('Lead')}</div>
              <div class="opp-pt-desc">${__('Prospect not yet a customer')}</div>
            </div>
            <div class="opp-pt-card" data-type="Customer">
              <div class="opp-pt-icon">🏢</div>
              <div class="opp-pt-name">${__('Customer')}</div>
              <div class="opp-pt-desc">${__('Existing customer in your database')}</div>
            </div>
            <div class="opp-pt-card" data-type="Prospect">
              <div class="opp-pt-icon">🎯</div>
              <div class="opp-pt-name">${__('Prospect')}</div>
              <div class="opp-pt-desc">${__('Qualified prospect in the pipeline')}</div>
            </div>
          </div>
          <div class="opp-party-search" style="display:none">
            <label class="opp-lbl req" id="opp-party-lbl">${__('Party')}</label>
            <div id="opp-party-link-wrap" class="opp-link-wrap"></div>
          </div>
        </div>

        <!-- Step 1: Deal -->
        <div class="opp-wiz-content" data-step="1">
          <div class="opp-wiz-grid">
            <div class="opp-wiz-field">
              <label class="opp-lbl req">${__('Company')}</label>
              <div id="opp-company-wrap"></div>
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('Currency')}</label>
              <div id="opp-currency-wrap"></div>
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('Opportunity Type')}</label>
              <div id="opp-type-wrap"></div>
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('Sales Stage')}</label>
              <div id="opp-stage-wrap"></div>
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('Opportunity Amount')}</label>
              <input type="number" class="opp-input" id="opp-amount" placeholder="0.00" min="0">
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('Expected Closing Date')}</label>
              <input type="date" class="opp-input" id="opp-closing">
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('Opportunity Owner')}</label>
              <div id="opp-owner-wrap"></div>
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('Probability')} (<span id="opp-prob-val">100</span>%)</label>
              <input type="range" class="opp-range" id="opp-prob" min="0" max="100" value="100">
            </div>
            <div class="opp-wiz-field full">
              <label class="opp-lbl">${__('Description')}</label>
              <textarea class="opp-textarea" id="opp-desc" rows="3"></textarea>
            </div>
          </div>
        </div>

        <!-- Step 2: Contact -->
        <div class="opp-wiz-content" data-step="2">
          <div class="opp-wiz-grid">
            <div class="opp-wiz-field">
              <label class="opp-lbl req">${__('Contact Person')}</label>
              <div id="opp-contact-wrap"></div>
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl req">${__('Contact Email')}</label>
              <input type="email" class="opp-input" id="opp-email" placeholder="email@example.com">
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl req">${__('Contact Mobile')}</label>
              <input type="tel" class="opp-input" id="opp-mobile" placeholder="+91 ...">
            </div>
            <div class="opp-wiz-field">
              <label class="opp-lbl">${__('WhatsApp')}</label>
              <input type="tel" class="opp-input" id="opp-whatsapp" placeholder="+91 ...">
            </div>
          </div>
        </div>

        <!-- Step 3: Review -->
        <div class="opp-wiz-content" data-step="3">
          <h6>${__('Review & Create')}</h6>
          <div id="opp-review"></div>
        </div>

        <!-- Navigation -->
        <div class="opp-wiz-nav">
          <button class="opp-btn opp-btn-default" id="opp-prev" style="visibility:hidden">${__('← Back')}</button>
          <span class="opp-step-ind">1 / 4</span>
          <button class="opp-btn opp-btn-primary" id="opp-next">${__('Next →')}</button>
        </div>
      `);

      this._init_controls($body);
      this._bind_wizard($body);
    }

    _init_controls($body) {
      // Link controls for deal step
      this._link_controls.company  = make_link_field($body.find('#opp-company-wrap'),  'Company',          (v) => { this.data.company = v; }, this.data.company);
      this._link_controls.currency = make_link_field($body.find('#opp-currency-wrap'), 'Currency',         (v) => { this.data.currency = v; });
      this._link_controls.opp_type = make_link_field($body.find('#opp-type-wrap'),    'Opportunity Type', (v) => { this.data.opportunity_type = v; });
      this._link_controls.stage    = make_link_field($body.find('#opp-stage-wrap'),   'Sales Stage',      (v) => { this.data.sales_stage = v; });
      this._link_controls.owner    = make_link_field($body.find('#opp-owner-wrap'),   'User',             (v) => { this.data.opportunity_owner = v; });

      // Pre-fill defaults
      if (this.data.company)  this._link_controls.company.set_value(this.data.company);
      if (this.data.currency) this._link_controls.currency.set_value(this.data.currency);
      this._link_controls.opp_type.set_value(this.data.opportunity_type);
      this._link_controls.stage.set_value(this.data.sales_stage);
      this._link_controls.owner.set_value(this.data.opportunity_owner);

      // Contact link (step 3) — initialized when step becomes visible
      this._link_controls.contact = make_link_field($body.find('#opp-contact-wrap'), 'Contact', (v) => { this.data.contact_person = v; });
    }

    _bind_wizard($body) {
      // Party type selection
      $body.on('click', '.opp-pt-card', (e) => {
        $body.find('.opp-pt-card').removeClass('selected');
        const $c = $(e.currentTarget).addClass('selected');
        this.data.opportunity_from = $c.data('type');
        $body.find('.opp-party-search').show();
        $body.find('#opp-party-lbl').text(__(this.data.opportunity_from));
        // Re-init party link for the selected type
        this._link_controls.party = make_link_field(
          $body.find('#opp-party-link-wrap'), this.data.opportunity_from,
          (v) => { this.data.party_name = v; }
        );
      });

      // Probability slider
      $body.on('input', '#opp-prob', (e) => {
        this.data.probability = parseInt($(e.target).val());
        $body.find('#opp-prob-val').text(this.data.probability);
      });

      // Prev / Next
      $body.find('#opp-prev').on('click', () => this._goto(this.step - 1, $body));
      $body.find('#opp-next').on('click', () => {
        if (this.step === 3) {
          this._submit($body);
        } else if (this._validate($body)) {
          this._goto(this.step + 1, $body);
        }
      });
    }

    _goto(n, $body) {
      // Mark circles
      $body.find('.opp-wiz-step').removeClass('active done');
      for (let i = 0; i < n; i++) $body.find(`.opp-wiz-step[data-step="${i}"]`).addClass('done');
      $body.find(`.opp-wiz-step[data-step="${n}"]`).addClass('active');

      // Show content
      $body.find('.opp-wiz-content').removeClass('active');
      $body.find(`.opp-wiz-content[data-step="${n}"]`).addClass('active');

      // Nav buttons
      $body.find('#opp-prev').css('visibility', n > 0 ? 'visible' : 'hidden');
      const $next = $body.find('#opp-next');
      if (n === 3) {
        $next.text(__('✓ Create Opportunity')).css('background', '#059669').css('border-color', '#059669');
        this._render_review($body);
      } else {
        $next.text(__('Next →')).css('background', '').css('border-color', '');
      }
      $body.find('.opp-step-ind').text(`${n + 1} / 4`);
      this.step = n;
    }

    _validate($body) {
      if (this.step === 0) {
        if (!this.data.opportunity_from) {
          frappe.show_alert({ message: __('Please select who this opportunity is for'), indicator: 'orange' });
          return false;
        }
        if (!this.data.party_name) {
          frappe.show_alert({ message: __(`Please select a ${this.data.opportunity_from}`), indicator: 'orange' });
          return false;
        }
      }
      if (this.step === 1) {
        this.data.company          = this._link_controls.company.get_value();
        this.data.currency         = this._link_controls.currency.get_value();
        this.data.opportunity_type = this._link_controls.opp_type.get_value();
        this.data.sales_stage      = this._link_controls.stage.get_value();
        this.data.opportunity_owner = this._link_controls.owner.get_value();
        this.data.opportunity_amount = $body.find('#opp-amount').val();
        this.data.expected_closing   = $body.find('#opp-closing').val();
        this.data.description        = $body.find('#opp-desc').val();
        if (!this.data.company) {
          frappe.show_alert({ message: __('Company is required'), indicator: 'orange' });
          return false;
        }
      }
      if (this.step === 2) {
        this.data.contact_person = this._link_controls.contact.get_value();
        this.data.contact_email  = $body.find('#opp-email').val().trim();
        this.data.contact_mobile = $body.find('#opp-mobile').val().trim();
        this.data.whatsapp       = $body.find('#opp-whatsapp').val().trim();
        if (!this.data.contact_person) {
          frappe.show_alert({ message: __('Contact Person is required'), indicator: 'orange' });
          return false;
        }
        if (!this.data.contact_email) {
          frappe.show_alert({ message: __('Contact Email is required'), indicator: 'orange' });
          return false;
        }
        if (!this.data.contact_mobile) {
          frappe.show_alert({ message: __('Contact Mobile is required'), indicator: 'orange' });
          return false;
        }
      }
      return true;
    }

    _render_review($body) {
      const d = this.data;
      $body.find('#opp-review').html(`
        <div class="opp-review-card">
          <div class="opp-review-section">
            <div class="opp-review-title">👤 ${__('Party')}</div>
            <div class="opp-review-row"><span>${__('Type')}</span><span>${esc(d.opportunity_from || '—')}</span></div>
            <div class="opp-review-row"><span>${__('Name')}</span><span>${esc(d.party_name || '—')}</span></div>
          </div>
          <div class="opp-review-section">
            <div class="opp-review-title">💼 ${__('Deal')}</div>
            <div class="opp-review-row"><span>${__('Company')}</span><span>${esc(d.company || '—')}</span></div>
            <div class="opp-review-row"><span>${__('Amount')}</span><span>${d.opportunity_amount ? fmt_currency(d.opportunity_amount, d.currency) : '—'}</span></div>
            <div class="opp-review-row"><span>${__('Stage')}</span><span>${esc(d.sales_stage || 'Prospecting')}</span></div>
            <div class="opp-review-row"><span>${__('Closing Date')}</span><span>${d.expected_closing ? frappe.datetime.str_to_user(d.expected_closing) : '—'}</span></div>
            <div class="opp-review-row"><span>${__('Probability')}</span><span>${d.probability}%</span></div>
            <div class="opp-review-row"><span>${__('Owner')}</span><span>${esc((d.opportunity_owner || '').split('@')[0])}</span></div>
          </div>
          <div class="opp-review-section">
            <div class="opp-review-title">📞 ${__('Contact')}</div>
            <div class="opp-review-row"><span>${__('Person')}</span><span>${esc(d.contact_person || '—')}</span></div>
            <div class="opp-review-row"><span>${__('Email')}</span><span>${esc(d.contact_email || '—')}</span></div>
            <div class="opp-review-row"><span>${__('Mobile')}</span><span>${esc(d.contact_mobile || '—')}</span></div>
          </div>
        </div>
      `);
    }

    async _submit($body) {
      if (!this._validate($body)) return;
      const $btn = $body.find('#opp-next').prop('disabled', true).text(__('Creating...'));
      try {
        const resp = await frappe.call({
          method: 'frappe.client.insert',
          args: {
            doc: {
              doctype: 'Opportunity',
              opportunity_from:   this.data.opportunity_from,
              party_name:         this.data.party_name,
              status:             'Open',
              company:            this.data.company,
              currency:           this.data.currency || frappe.defaults.get_user_default('Currency'),
              opportunity_type:   this.data.opportunity_type || 'Sales',
              sales_stage:        this.data.sales_stage || 'Prospecting',
              opportunity_amount: flt(this.data.opportunity_amount || 0),
              expected_closing:   this.data.expected_closing || null,
              opportunity_owner:  this.data.opportunity_owner || frappe.session.user,
              probability:        cint(this.data.probability || 100),
              contact_person:     this.data.contact_person,
              contact_email:      this.data.contact_email,
              contact_mobile:     this.data.contact_mobile,
              whatsapp:           this.data.whatsapp,
              description:        this.data.description,
              transaction_date:   frappe.datetime.get_today(),
            },
          },
        });

        this.dialog.hide();
        const new_name = resp.message && resp.message.name;
        frappe.show_alert({ message: __('Opportunity {0} created', [new_name || '']), indicator: 'green' });
        this.lc.refresh();
        if (new_name) setTimeout(() => new OppDetailPanel(new_name, this.lc).open(), 400);
      } catch (e) {
        $btn.prop('disabled', false).text(__('✓ Create Opportunity'));
        frappe.msgprint({ title: __('Error'), message: e.message || __('Could not create opportunity'), indicator: 'red' });
      }
    }
  }

  // ── Register listview settings ────────────────────────────────────────────

  frappe.listview_settings['Opportunity'] = {
    add_fields: LIST_FIELDS,

    get_indicator(doc) {
      const map = {
        Open: 'blue', Quotation: 'orange', Converted: 'green',
        Lost: 'red', Replied: 'purple', Closed: 'grey',
      };
      return [__(doc.status), map[doc.status] || 'blue', `status,=,${doc.status}`];
    },

    onload(lv) {
      inject_styles();

      // Keep standard opportunity_from filter query
      if (lv.page.fields_dict.opportunity_from) {
        lv.page.fields_dict.opportunity_from.get_query = () => ({
          filters: { name: ['in', ['Customer', 'Lead', 'Prospect']] },
        });
      }

      // Boot custom list controller
      const ctrl = new OppListView(lv);
      ctrl.init();

      // Expose on lv so page refresh re-uses it
      lv.__opp_ctrl = ctrl;
    },
  };

})();
