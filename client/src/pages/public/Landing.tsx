import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Armchair, ArrowRight, BadgeCheck, Bell, BellRing, BookOpenCheck, ChefHat, Clock3, Database, LayoutDashboard, Layers3, Leaf, Menu as MenuIcon, Monitor, MonitorSmartphone, Play, Printer, ReceiptText, ShieldCheck, Smartphone, Sparkles, Utensils, UsersRound, UserRoundCog, X, Zap } from 'lucide-react';
import Login from '../Login';
import heroScene from '../../assets/hero-nepal.webp';
import { get } from '../../lib/api';
import { getMenuImageUrl } from '../../lib/menuImages';

const copyrightYear = new Date().getFullYear();

interface LandingMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  priceMinor: number;
  discountPercent: number;
  imageUrl?: string | null;
  available: boolean;
  soldOut: boolean;
}

interface LandingMenuResponse {
  restaurant?: { name: string };
  categories: { id: string; name: string }[];
  items: LandingMenuItem[];
}

const CSS = `
:root { --bg:#eef7f2; --bg-alt:#e2f1e9; --surface:#ffffff; --ink:#163026; --ink-soft:#4a6b5a; --line:#cfe6da; --accent:#2f8f6b; --accent-soft:#d9efe4; --sage:#2f7a5a; --sage-soft:#e1f0e8; --gold:#6fb39a; --gold-soft:#eaf6f0; --radius:18px; --shadow:0 1px 2px rgba(22,48,38,.06),0 12px 32px -12px rgba(22,48,38,.18); }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:inherit; background:var(--bg); color:var(--ink); line-height:1.6; -webkit-font-smoothing:antialiased; }
.landing-page { background-color:#edf3ed; background-image:linear-gradient(rgba(248,249,244,.84),rgba(239,247,241,.91)),url("${heroScene}"); background-position:center top; background-size:cover; background-attachment:fixed; background-repeat:no-repeat; overflow-x:clip; }
h1,h2,h3 { font-family:inherit; font-weight:700; letter-spacing:-.025em; line-height:1.12; }
a { color:inherit; text-decoration:none; }
img,svg { display:block; max-width:100%; }
.wrap { max-width:1180px; margin:0 auto; padding:0 24px; }
section { padding:96px 0; }
.eyebrow { display:inline-block; font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); margin-bottom:14px; }
.lead { color:var(--ink-soft); font-size:1.08rem; max-width:620px; }
.btn { display:inline-flex; align-items:center; gap:8px; padding:14px 24px; border-radius:999px; font-weight:600; font-size:15px; border:1.5px solid transparent; transition:transform .15s ease,background .15s ease,box-shadow .15s ease; cursor:pointer; font-family:inherit; }
.btn:hover { transform:translateY(-1px); }
.btn-primary { background:var(--accent); color:#fff; box-shadow:0 8px 20px -8px rgba(47,143,107,.5); }
.btn-primary:hover { background:#257a5a; }
.btn-ghost { background:transparent; border-color:var(--ink); color:var(--ink); }
.btn-ghost:hover { background:var(--ink); color:var(--bg); }
.nav { position:sticky; top:0; z-index:50; background:rgba(238,247,242,.85); backdrop-filter:blur(10px); border-bottom:0; }
.nav-inner { display:flex; align-items:center; justify-content:space-between; height:56px; }
.brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:1.35rem; letter-spacing:-.035em; }
.brand-mark { width:34px; height:34px; border-radius:10px; background:var(--accent); display:grid; place-items:center; color:#fff; font-size:16px; }
.nav-links { display:flex; gap:24px; font-size:13px; color:var(--ink-soft); }
.nav-links a:hover { color:var(--ink); }
.live-pill { display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; background:var(--sage-soft); color:var(--sage); padding:6px 12px; border-radius:999px; }
.dot { width:8px; height:8px; border-radius:50%; background:var(--sage); box-shadow:0 0 0 0 rgba(47,122,90,.6); animation:pulse 2s infinite; }
@keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(47,122,90,.5);} 70%{box-shadow:0 0 0 10px rgba(47,122,90,0);} 100%{box-shadow:0 0 0 0 rgba(47,122,90,0);} }
.nav .wrap,.hero .wrap { max-width:1320px; }
.nav { background:linear-gradient(180deg,rgba(250,249,244,.9),rgba(250,249,244,.52)); backdrop-filter:none; }
.nav::after { content:""; position:absolute; z-index:0; right:0; bottom:-40px; left:0; height:40px; background:linear-gradient(180deg,rgba(250,249,244,.52),rgba(250,249,244,0)); pointer-events:none; }
.nav-inner { position:relative; z-index:1; height:80px; }
.brand { color:#0d3028; gap:12px; font-size:1.5rem; }
.brand-mark { width:38px; height:38px; border-radius:9px; background:#006a52; }
.nav-links { gap:30px; color:#4c6059; font-size:14px; }
.nav-links a { padding:29px 0; border-bottom:0; }
.nav-links a:hover,.nav-links a.is-active { color:#173b32; }
.nav-actions { display:flex; gap:16px; align-items:center; }
.nav-actions .btn { min-width:118px; justify-content:center; background:#064d3e; box-shadow:none; }
.menu-toggle { display:none; }
.hero { min-height:100svh; margin-top:-80px; padding:80px 0 48px; display:flex; align-items:center; position:relative; overflow:hidden; isolation:isolate; background:#f5f2e9; }
.hero-backdrop { position:absolute; z-index:-2; inset:0; width:100%; height:100%; object-fit:cover; object-position:center center; }
.hero::before { content:""; position:absolute; z-index:-1; inset:0; background:linear-gradient(180deg,transparent 55%,rgba(239,247,241,.91) 100%),linear-gradient(90deg,rgba(250,249,243,.9) 0%,rgba(250,249,243,.86) 31%,rgba(250,249,243,.68) 46%,rgba(250,249,243,.24) 65%,rgba(250,249,243,.02) 100%); }
.hero::after { content:none; }
.hero-grid { display:block; width:100%; }
.hero-copy { width:min(100%,740px); margin:0; text-align:left; }
.hero .eyebrow { display:inline-flex; align-items:center; gap:8px; margin-bottom:19px; border:1px solid rgba(35,132,103,.09); border-radius:999px; background:rgba(224,244,233,.82); color:#176c55; padding:6px 13px; font-size:12px; letter-spacing:0; text-transform:none; }
.hero .eyebrow svg { width:15px; height:15px; }
.hero h1 { max-width:760px; margin:0 0 22px; font-size:clamp(2.7rem,4vw,4rem); line-height:1.03; letter-spacing:-.045em; color:#0b211d; }
.hero h1 em { font-style:italic; color:var(--accent); font-weight:500; }
.hero .lead { max-width:580px; margin:0; font-size:clamp(.98rem,1vw,1.02rem); line-height:1.55; color:#64756e; }
.hero-actions { display:flex; justify-content:flex-start; flex-wrap:wrap; gap:14px; margin:13px 0 54px; }
.hero-actions .btn { padding:13px 23px; font-size:14px; }
.hero-actions .btn-primary { background:#087157; box-shadow:none; }
.hero-actions .btn-primary:hover { background:#075d48; }
.hero-actions .btn-ghost { border-color:rgba(22,48,38,.16); background:rgba(255,255,255,.38); }
.stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); width:min(100%,720px); margin:0; gap:0; }
.stat { padding:0 22px; }
.stat:first-child { padding-left:0; }
.stat + .stat { border-left:1px solid rgba(47,143,107,.14); }
.stat strong { display:flex; align-items:center; gap:11px; font-size:clamp(1.18rem,1.9vw,1.5rem); line-height:1.1; color:#173e35; }
.stat strong svg { flex:0 0 27px; width:27px; height:27px; stroke-width:1.9; }
.stat span { display:block; margin:5px 0 0 38px; font-size:11px; line-height:1.35; color:#64756e; }
.hero-visual { position:relative; }
.hero-card { background:var(--surface); border-radius:24px; box-shadow:var(--shadow); border:1px solid var(--line); padding:22px; position:relative; z-index:1; }
.window-bar { display:flex; gap:6px; margin-bottom:16px; }
.window-bar i { width:10px; height:10px; border-radius:50%; background:var(--line); display:block; }
.tables { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
.table { border-radius:14px; padding:14px 10px; text-align:center; font-size:13px; font-weight:600; border:1.5px solid var(--line); background:var(--bg); }
.table small { display:block; font-weight:500; color:var(--ink-soft); font-size:11px; margin-top:2px; }
.table.free { background:var(--sage-soft); border-color:#b7dcc9; color:var(--sage); }
.table.occ { background:var(--accent-soft); border-color:#b7dcc9; color:var(--accent); }
.table.bill { background:var(--gold-soft); border-color:#b7dcc9; color:var(--gold); }
.ticket { position:relative; margin-top:16px; margin-left:auto; width:230px; z-index:2; background:var(--ink); color:#eaf6f0; border-radius:16px; padding:16px; box-shadow:0 20px 40px -16px rgba(31,27,22,.45); font-size:13px; }
.ticket h4 { font-size:15px; margin-bottom:8px; display:flex; justify-content:space-between; }
.ticket .row { display:flex; justify-content:space-between; padding:4px 0; color:#cfe6da; }
.ticket .tag { font-size:11px; background:#1f4a38; border-radius:6px; padding:2px 8px; color:#9fd3b2; }
.ticket .ready { color:#9fd3b2; }
.strip { padding:14px 0; background:rgba(255,255,255,.7); border-top:1px solid rgba(207,230,218,.55); border-bottom:1px solid rgba(207,230,218,.55); }
.strip-inner { display:flex; align-items:center; gap:20px; color:var(--ink-soft); }
.strip-intro { display:flex; align-items:center; flex:0 0 31%; gap:14px; min-height:34px; padding-right:20px; border-right:1px solid rgba(22,48,38,.08); font-size:13px; line-height:1.3; }
.strip-intro-icon { display:grid; flex:0 0 34px; width:34px; height:34px; place-items:center; border:1px solid rgba(47,143,107,.1); border-radius:10px; background:rgba(217,239,228,.48); color:var(--accent); }
.strip-intro-icon svg { width:17px; height:17px; }
.chips { display:flex; flex:1; align-items:center; justify-content:space-between; gap:6px; min-width:0; }
.chip { position:relative; display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:38px; padding:7px 12px; border:1px solid rgba(207,230,218,.7); border-radius:11px; background:rgba(255,255,255,.62); color:#52685f; font-size:11px; line-height:1; white-space:nowrap; }
.chip svg { width:15px; height:15px; color:#6a9783; }
.chip-active { background:rgba(225,240,232,.6); border-color:transparent; color:#347a60; }
.chip-active::after { content:""; position:absolute; right:24%; bottom:-5px; left:24%; height:2px; border-radius:2px; background:var(--accent); }
.arch { position:relative; overflow:hidden; background:transparent; }
.arch-intro { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr); align-items:center; gap:32px; margin-bottom:26px; }
.arch .section-head { max-width:760px; margin:0; }
.arch .section-head .eyebrow { border-radius:999px; background:rgba(217,239,226,.85); padding:6px 16px; letter-spacing:.12em; }
.arch .section-head h2 { max-width:800px; font-size:clamp(2.7rem,5.1vw,4.5rem); letter-spacing:-.05em; margin-bottom:14px; }
.arch .section-head h2 em { color:var(--accent); font-weight:600; }
.arch .section-head .lead { max-width:700px; font-size:1.05rem; line-height:1.55; }
.arch-art { position:relative; height:220px; display:grid; place-items:center; }
.arch-orbit { position:absolute; width:196px; aspect-ratio:1; border:1px solid rgba(47,143,107,.14); border-radius:50%; box-shadow:0 0 0 18px rgba(76,139,106,.035),0 0 0 42px rgba(76,139,106,.025); }
.arch-server-stack { position:relative; z-index:1; display:grid; gap:6px; width:118px; transform:perspective(460px) rotateY(-12deg) rotateX(4deg); }
.arch-server { height:38px; display:flex; justify-content:flex-end; align-items:center; gap:7px; padding:0 12px; border:1px solid #326955; border-radius:9px; background:linear-gradient(135deg,#287052,#164330); box-shadow:0 8px 12px -8px rgba(22,48,38,.45); }
.arch-server::before { content:""; width:34px; height:5px; margin-right:auto; border-radius:4px; background:rgba(222,246,230,.35); }
.arch-server i { width:7px; height:7px; border-radius:50%; background:#a8f0bb; box-shadow:0 0 8px rgba(168,240,187,.7); }
.arch-db-icon { position:absolute; z-index:2; right:calc(50% - 101px); bottom:42px; width:54px; height:54px; display:grid; place-items:center; border-radius:50%; border:4px solid #eef8f1; background:#f9fdfa; color:#167448; box-shadow:0 8px 18px rgba(22,48,38,.15); }
.arch-db-icon svg { width:26px; height:26px; }
.arch-note { position:absolute; right:-2px; top:22px; color:#559477; font-size:13px; line-height:1.35; font-style:italic; transform:rotate(-7deg); }
.arch-card { background:rgba(255,255,255,.83); border-radius:30px; border:1px solid rgba(207,230,218,.95); box-shadow:0 18px 48px -30px rgba(22,48,38,.35); padding:26px 26px 18px; }
.arch-body { display:grid; grid-template-columns:minmax(180px,.85fr) minmax(0,2.4fr) minmax(190px,.9fr); align-items:center; gap:24px; }
.arch-summary { align-self:stretch; display:flex; flex-direction:column; justify-content:center; padding:10px 22px 10px 4px; border-right:1px solid #d8ebe0; }
.arch-summary-icon { width:54px; height:54px; display:grid; place-items:center; margin-bottom:14px; border-radius:19px; background:#e1f3e8; color:#14784a; }
.arch-summary-icon svg { width:27px; height:27px; }
.arch-summary h3 { font-size:1.35rem; line-height:1.18; margin-bottom:10px; }
.arch-summary p { color:var(--ink-soft); font-size:14px; line-height:1.5; }
.arch-flow { display:grid; grid-template-columns:minmax(100px,1fr) 30px 90px 30px minmax(150px,1.35fr); align-items:center; gap:0; min-width:0; }
.arch-endpoint { display:flex; align-items:center; gap:11px; min-width:0; padding:12px 11px; border:1px solid #e1eee6; border-radius:17px; background:rgba(255,255,255,.92); box-shadow:0 8px 18px -15px rgba(22,48,38,.35); }
.arch-endpoint-icon { flex:0 0 42px; width:42px; height:42px; display:grid; place-items:center; border-radius:50%; background:#e1f3e8; color:#14784a; }
.arch-endpoint-icon svg { width:21px; height:21px; }
.arch-endpoint strong { display:block; color:var(--ink); font-size:14px; line-height:1.25; }
.arch-endpoint small { display:block; margin-top:4px; color:var(--ink-soft); font-size:11px; line-height:1.3; }
.arch-source { padding:12px 10px; }
.arch-connector { position:relative; height:2px; background:linear-gradient(90deg,#8fceb0,#48a77a); }
.arch-connector::before,.arch-connector::after { content:""; position:absolute; top:50%; width:8px; height:8px; border-radius:50%; background:#48a77a; transform:translateY(-50%); }
.arch-connector::before { left:0; }.arch-connector::after { right:0; }
.arch-core { position:relative; display:grid; place-items:center; width:86px; height:86px; margin:auto; border:1px solid rgba(47,143,107,.2); border-radius:50%; background:rgba(217,239,226,.48); box-shadow:0 0 0 10px rgba(76,139,106,.055),0 0 0 20px rgba(76,139,106,.035); }
.arch-core span { display:grid; place-items:center; width:54px; height:54px; border-radius:50%; background:linear-gradient(145deg,#2f8f6b,#17623f); color:white; box-shadow:0 8px 18px -8px rgba(22,48,38,.5); }
.arch-core svg { width:27px; height:27px; }
.arch-outputs { position:relative; display:grid; gap:10px; }
.arch-outputs::before { content:""; position:absolute; top:19%; bottom:19%; left:-15px; width:2px; background:#93cfb0; }
.arch-target { position:relative; }
.arch-target::before { content:""; position:absolute; top:50%; left:-16px; width:16px; height:2px; background:#93cfb0; }
.arch-benefits { display:grid; gap:13px; padding:4px 0 4px 19px; border-left:1px solid #d8ebe0; }
.arch-benefit { display:flex; align-items:center; gap:11px; min-width:0; }
.arch-benefit-icon { flex:0 0 42px; width:42px; height:42px; display:grid; place-items:center; border-radius:50%; background:#e1f3e8; color:#14784a; }
.arch-benefit-icon svg { width:20px; height:20px; }
.arch-benefit strong { display:block; color:var(--ink); font-size:12px; line-height:1.3; }
.arch-benefit small { display:block; margin-top:3px; color:var(--ink-soft); font-size:11px; line-height:1.3; }
.arch-ribbon { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; min-height:52px; margin-top:22px; padding:10px 16px; border-radius:16px; background:linear-gradient(90deg,#edf8f1,#e7f5ec); color:#438466; font-size:12px; }
.arch-ribbon-main { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.arch-ribbon-check { flex:0 0 28px; width:28px; height:28px; display:grid; place-items:center; border-radius:50%; background:#16804b; color:#fff; font-weight:700; font-size:16px; }
.arch-ribbon em { margin-left:auto; font-size:13px; font-style:italic; color:#559477; }
.section-head { max-width:680px; margin-bottom:52px; }
.section-head h2 { font-size:clamp(2rem,3.6vw,2.9rem); margin-bottom:14px; }
.roles-section { position:relative; overflow:hidden; background:transparent; }
.roles-head { max-width:760px; margin:0 auto 40px; text-align:center; }
.roles-head .eyebrow { border-radius:999px; background:#d9efe2; padding:5px 16px; letter-spacing:.02em; text-transform:none; color:#17633f; }
.roles-head h2 { font-size:clamp(2.2rem,4vw,3.25rem); margin-bottom:12px; }
.roles-head .lead { margin:0 auto; max-width:650px; }
.roles-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
.role { display:grid; grid-template-columns:minmax(0,1.08fr) minmax(180px,.92fr); align-items:stretch; min-height:258px; overflow:hidden; padding:22px 0 20px 22px; background:rgba(255,255,255,.9); border:1px solid #d9ebe0; border-radius:22px; box-shadow:0 8px 24px -18px rgba(22,48,38,.35); transition:transform .2s ease,box-shadow .2s ease; }
.role:hover { transform:translateY(-3px); box-shadow:var(--shadow); }
.role-copy { position:relative; z-index:2; align-self:center; }
.role-icon { width:52px; height:52px; border-radius:50%; display:grid; place-items:center; color:#087348; background:#d7f0e1; margin-bottom:12px; }
.role-icon svg { width:25px; height:25px; stroke-width:2.5; }
.role h3 { font-size:1.35rem; margin-bottom:7px; }
.role p { color:#344b40; font-size:13px; line-height:1.5; margin-bottom:14px; }
.role ul { list-style:none; display:grid; gap:7px; font-size:12px; line-height:1.35; }
.role li { display:flex; align-items:flex-start; color:#344b40; }
.role li::before { content:"✓"; display:grid; place-items:center; flex:0 0 15px; width:15px; height:15px; border-radius:50%; background:#07854b; color:white; font-size:10px; font-weight:700; margin:0 8px 0 0; }
.role-visual { position:relative; display:grid; place-items:center; min-width:0; overflow:hidden; margin:-22px 0 -20px; background:radial-gradient(ellipse at 55% 55%,rgba(139,214,168,.42),rgba(227,246,234,.14) 64%,transparent 72%); }
.role-visual::before,.role-visual::after { content:""; position:absolute; border-radius:50%; background:rgba(156,222,177,.15); }
.role-visual::before { width:210px; height:210px; right:-45px; top:-70px; }
.role-visual::after { width:170px; height:170px; left:-80px; bottom:-90px; }
.admin-window { position:relative; z-index:1; width:86%; padding:12px; border:1px solid #dce8e0; border-radius:16px; background:rgba(255,255,255,.94); box-shadow:0 16px 28px -16px rgba(23,70,46,.36); transform:translateY(5px); }
.mock-brand { display:flex; align-items:center; gap:5px; padding-bottom:8px; border-bottom:1px solid #edf1ee; color:#263b32; font-size:9px; font-weight:700; }
.mock-brand span { display:grid; place-items:center; width:11px; height:11px; border-radius:3px; background:#07854b; color:#fff; font-size:7px; }
.sales-label { margin-top:8px; color:#6b7b72; font-size:7px; }
.sales-total { display:block; color:#20372d; font-size:12px; line-height:1.2; }
.sales-change { color:#07854b; font-size:7px; }
.sales-chart { display:flex; align-items:flex-end; gap:6px; height:48px; margin:8px 2px 0; padding:0 4px; border-bottom:1px solid #dce9e0; }
.sales-chart i { flex:1; border-radius:3px 3px 0 0; background:linear-gradient(#75c89a,#46aa77); }
.sales-chart i:nth-child(1) { height:23%; }.sales-chart i:nth-child(2) { height:38%; }.sales-chart i:nth-child(3) { height:30%; }.sales-chart i:nth-child(4) { height:56%; }.sales-chart i:nth-child(5) { height:44%; }.sales-chart i:nth-child(6) { height:72%; }.sales-chart i:nth-child(7) { height:94%; }
.mini-line { display:block; width:100%; height:24px; margin-top:5px; }
.role-bubble { position:absolute; z-index:3; display:grid; place-items:center; width:48px; height:48px; border:4px solid white; border-radius:50%; background:#07854b; color:white; box-shadow:0 8px 18px -8px rgba(0,80,46,.55); }
.role-bubble svg { width:23px; height:23px; stroke-width:2.7; }
.admin-visual .role-bubble { top:38px; right:8px; }
.phone { position:relative; z-index:1; width:118px; height:218px; padding:23px 10px 12px; border:5px solid #14231d; border-radius:27px; background:#fbfdfb; box-shadow:0 18px 26px -14px rgba(22,48,38,.48); transform:rotate(8deg) translate(5px,8px); }
.phone::before { content:""; position:absolute; top:7px; left:50%; width:39px; height:9px; border-radius:9px; background:#14231d; transform:translateX(-50%); }
.phone-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; height:100%; }
.phone-table { display:grid; align-content:center; justify-items:center; border-radius:9px; background:#dff3e7; color:#174c34; font-size:8px; font-weight:700; line-height:1.4; }
.phone-table small { color:#416953; font-size:7px; font-weight:500; }
.phone-table.busy { background:#ffe6af; color:#79521a; }
.waiter-visual .role-bubble { top:42%; right:8px; width:44px; height:44px; }
.waiter-visual .role-bubble svg { fill:white; }
.motion-mark { position:absolute; z-index:2; right:21px; top:35%; width:20px; height:20px; border-top:3px solid #07854b; border-right:3px solid #07854b; transform:rotate(32deg) skew(-15deg); }
.printer { position:relative; z-index:1; width:156px; height:94px; margin-top:70px; border:1px solid #aebdb4; border-radius:14px; background:linear-gradient(145deg,#54645d,#1f2e27); box-shadow:0 17px 22px -12px rgba(22,48,38,.5); }
.printer::before { content:""; position:absolute; top:-17px; left:14px; right:14px; height:28px; border:1px solid #d7dfd9; border-radius:8px 8px 3px 3px; background:#eef3ef; }
.receipt { position:absolute; z-index:2; left:50%; top:-98px; width:91px; min-height:150px; padding:10px 9px; background:#fff; box-shadow:0 7px 12px rgba(22,48,38,.16); transform:translateX(-50%) rotate(5deg); color:#283a31; font-size:7px; line-height:1.65; }
.receipt-brand { display:block; margin-bottom:8px; font-size:7px; font-weight:700; }
.receipt-line { display:flex; justify-content:space-between; border-bottom:1px solid #e5eae6; }
.receipt-total { display:block; margin-top:8px; border-top:1px solid #45584c; padding-top:4px; font-weight:700; }
.biller-visual .role-bubble { right:12px; top:30px; }
.monitor { position:relative; z-index:1; width:184px; height:116px; border:6px solid #18251f; border-radius:10px; background:#101b16; box-shadow:0 14px 22px -13px rgba(22,48,38,.55); }
.monitor::before { content:""; position:absolute; left:50%; bottom:-21px; width:44px; height:15px; background:linear-gradient(#59665f,#344139); clip-path:polygon(35% 0,65% 0,78% 100%,22% 100%); transform:translateX(-50%); }
.monitor::after { content:""; position:absolute; left:50%; bottom:-25px; width:78px; height:5px; border-radius:50%; background:#53625a; transform:translateX(-50%); }
.kds-screen { padding:8px; color:#f3f8f4; font-size:7px; }
.kds-tabs { display:flex; justify-content:space-between; gap:3px; padding-bottom:7px; border-bottom:1px solid #334239; }
.kds-tabs span { padding:3px 5px; border-radius:999px; background:#254b35; }
.kds-tabs span:nth-child(2) { background:#6b511c; }
.kds-order { display:grid; grid-template-columns:22px 1fr auto; align-items:center; gap:5px; padding-top:9px; }
.kds-order b { color:#edce62; font-size:9px; }
.kds-status { border-radius:999px; padding:3px 5px; background:#735819; color:#ffdf74; }
.kds-status.ready { background:#16563b; color:#8fe4af; }
.kds-visual .role-bubble { display:none; }
.roles-section .wrap { position:relative; z-index:1; }
.flow { position:relative; overflow:hidden; background:transparent; }
.flow-head { max-width:800px; margin:0 auto 38px; text-align:center; }
.flow-head .eyebrow { display:inline-flex; align-items:center; gap:8px; border-radius:999px; background:rgba(232,246,237,.92); padding:7px 18px; color:#327e5e; letter-spacing:.09em; }
.flow-head .eyebrow::before,.flow-head .eyebrow::after { content:""; width:36px; height:1px; background:#93c5a9; }
.flow-head h2 { font-size:clamp(2.25rem,4.5vw,3.5rem); letter-spacing:-.04em; line-height:1.08; margin-bottom:14px; }
.flow-head h2 em { color:#13865c; font-weight:700; }
.flow-head .lead { max-width:760px; margin:0 auto; font-size:1.04rem; }
.steps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:24px; position:relative; }
.step { position:relative; min-height:320px; padding:22px 20px 20px; border:1px solid #d8ebe0; border-radius:25px; background:linear-gradient(140deg,rgba(255,255,255,.94),rgba(235,248,240,.92)); box-shadow:0 14px 32px -24px rgba(22,48,38,.4); transition:transform .2s ease,box-shadow .2s ease; }
.step:nth-child(even) { background:linear-gradient(140deg,rgba(255,255,255,.96),rgba(248,248,237,.93)); }
.step:hover { transform:translateY(-4px); box-shadow:var(--shadow); }
.step:not(:last-child)::after { content:"↝"; position:absolute; z-index:3; top:53px; right:-27px; color:#15956a; font-size:31px; line-height:1; }
.step-top { display:flex; align-items:flex-end; gap:13px; margin-bottom:15px; }
.step-icon { position:relative; flex:0 0 70px; width:70px; height:70px; display:grid; place-items:center; border-radius:50%; background:linear-gradient(145deg,#20a878,#08744d); color:white; box-shadow:0 8px 16px -8px rgba(8,116,77,.55); }
.step-icon::after { content:""; position:absolute; top:3px; right:-13px; width:9px; height:5px; border-top:3px solid #15956a; border-radius:50%; transform:rotate(-55deg); box-shadow:7px 7px 0 -1px #15956a; }
.step-icon svg { width:31px; height:31px; stroke-width:2.2; }
.step-num { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; border-radius:50%; background:#e6f4e9; color:#287d59; font-size:15px; font-weight:700; }
.step h4 { font-size:1.25rem; font-weight:700; letter-spacing:-.025em; margin-bottom:10px; }
.step p { min-height:72px; color:#55776a; font-size:14px; line-height:1.55; }
.step-tag { display:inline-flex; align-items:center; gap:8px; margin-top:16px; padding:8px 12px; border-radius:999px; background:#e1f5e7; color:#16815a; font-size:12px; font-weight:600; }
.step-tag svg { width:16px; height:16px; }
.features { position:relative; overflow:hidden; background:transparent; }
.features .wrap { position:relative; z-index:1; }
.feat-intro { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr); align-items:center; gap:24px; margin-bottom:24px; }
.feat-head { max-width:680px; }
.feat-head .eyebrow { display:inline-flex; align-items:center; gap:8px; border-radius:999px; background:rgba(221,243,230,.85); padding:7px 15px; color:#24764f; letter-spacing:.14em; }
.feat-head h2 { font-size:clamp(2.5rem,4.5vw,3.9rem); letter-spacing:-.045em; line-height:1.02; margin:7px 0 13px; }
.feat-head h2 em { color:#13865c; }
.feat-head .lead { max-width:580px; font-size:1rem; }
.feat-hero-art { position:relative; height:190px; display:grid; place-items:center; }
.feat-hero-orbit { position:absolute; width:200px; height:170px; border-radius:50%; background:radial-gradient(ellipse,rgba(148,220,169,.28),rgba(148,220,169,.1) 65%,transparent 70%); }
.feat-monitor { position:relative; z-index:1; width:208px; height:132px; padding:8px; border:6px solid #253b31; border-radius:14px; background:#eff8f2; box-shadow:0 17px 25px -16px rgba(22,48,38,.55); transform:rotate(-4deg); }
.feat-monitor::before { content:""; position:absolute; left:50%; bottom:-24px; width:49px; height:19px; background:linear-gradient(#6d8277,#3d5147); clip-path:polygon(32% 0,68% 0,80% 100%,20% 100%); transform:translateX(-50%); }
.feat-monitor::after { content:""; position:absolute; left:50%; bottom:-28px; width:84px; height:6px; border-radius:50%; background:#566a60; transform:translateX(-50%); }
.feat-monitor-screen { height:100%; display:grid; grid-template-columns:44px 1fr; gap:7px; overflow:hidden; border-radius:5px; background:white; padding:7px; }
.feat-monitor-side { display:grid; align-content:start; gap:7px; padding:5px; border-radius:4px; background:#edf6f0; }
.feat-monitor-side i { height:5px; border-radius:4px; background:#c4dfcd; }
.feat-monitor-main { min-width:0; }
.feat-monitor-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.feat-monitor-top b { width:49px; height:6px; border-radius:5px; background:#678475; }
.feat-monitor-top i { width:26px; height:9px; border-radius:8px; background:#1c9365; }
.feat-menu-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
.feat-menu-grid i { height:31px; border-radius:4px; background:linear-gradient(135deg,#f2d8a5,#e9a363 55%,#6c9b53 56%); }
.feat-menu-grid i:nth-child(2n) { background:linear-gradient(135deg,#f5e0b2,#d97a45 55%,#73964b 56%); }
.feat-monitor-line { display:block; width:70%; height:5px; margin-top:8px; border-radius:4px; background:#dcece1; }
.feat-floating { position:absolute; z-index:2; display:flex; align-items:center; gap:7px; padding:8px 11px; border:1px solid rgba(215,235,222,.95); border-radius:999px; background:rgba(255,255,255,.94); color:#286d4b; box-shadow:0 10px 18px -14px rgba(22,48,38,.5); font-size:10px; font-weight:600; }
.feat-floating svg { width:15px; height:15px; }
.feat-floating.sync { left:4%; top:34%; }.feat-floating.secure { right:4%; top:3%; }.feat-floating.grow { right:1%; bottom:11%; }
.feat-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.feat { --feat-accent:#168653; --feat-soft:#e1f5e8; position:relative; min-height:204px; overflow:hidden; padding:18px 20px; border:1px solid #d6ebe0; border-radius:17px; background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(240,249,243,.94)); }
.feat:nth-child(3) { --feat-accent:#d17a13; --feat-soft:#fff1d7; background:linear-gradient(135deg,#fffdf8,#fff9ec); }
.feat:nth-child(4) { --feat-accent:#8061c5; --feat-soft:#eee8ff; background:linear-gradient(135deg,#fff,#f8f5ff); }
.feat:nth-child(5) { --feat-accent:#1788ca; --feat-soft:#e3f3ff; background:linear-gradient(135deg,#fff,#f0f8ff); }
.feat:nth-child(6) { --feat-accent:#12a77a; --feat-soft:#def7ed; }
.feat-copy { position:relative; z-index:2; max-width:78%; }
.feat .ic { width:46px; height:46px; display:grid; place-items:center; margin-bottom:9px; border-radius:50%; background:var(--feat-soft); color:var(--feat-accent); box-shadow:inset 0 0 0 1px rgba(255,255,255,.65); }
.feat .ic svg { width:23px; height:23px; stroke-width:2.5; }
.feat h4 { font-size:1.25rem; font-weight:700; letter-spacing:-.025em; margin-bottom:5px; }
.feat p { color:var(--ink-soft); font-size:12px; line-height:1.45; }
.feat-tag { position:relative; z-index:2; display:inline-flex; align-items:center; gap:8px; margin-top:11px; padding:7px 11px; border-radius:999px; background:var(--feat-soft); color:var(--feat-accent); font-size:10px; font-weight:600; }
.feat-tag svg { width:14px; height:14px; }
.feat-art { position:absolute; z-index:1; top:25px; right:16px; width:104px; height:112px; display:grid; place-items:center; color:var(--feat-accent); opacity:.9; }
.feat-art-orbit { position:absolute; width:92px; height:92px; border:1px solid color-mix(in srgb,var(--feat-accent) 16%,transparent); border-radius:50%; }
.feat-art-icon { position:relative; display:grid; place-items:center; width:54px; height:54px; border-radius:50%; background:var(--feat-soft); color:var(--feat-accent); box-shadow:0 8px 20px -12px var(--feat-accent); }
.feat-art-icon svg { width:28px; height:28px; }
.feat-art.floor .floor-map { display:grid; grid-template-columns:repeat(3,19px); gap:6px; transform:rotate(35deg) skew(-8deg); }
.floor-map i { width:19px; height:15px; border-radius:5px; background:#d8f0e1; box-shadow:0 4px 7px rgba(22,48,38,.08); }
.floor-map i:nth-child(5) { background:#57c296; }
.feat-art.security .feat-art-icon { width:58px; height:68px; border-radius:48% 48% 54% 54%; background:#fff0d7; }
.feat-art.security .feat-art-icon svg { width:30px; height:30px; }
.feat-art.bills .feat-art-icon { transform:rotate(-8deg); }
.mini-receipt { position:absolute; right:2px; bottom:9px; width:35px; height:49px; padding:7px 4px; border:1px solid #ded3fb; border-radius:6px; background:#fff; box-shadow:0 4px 8px rgba(89,65,151,.12); }
.mini-receipt::before,.mini-receipt::after { content:""; display:block; height:3px; margin-bottom:5px; border-radius:4px; background:#dfd5f7; }
.mini-receipt::after { width:70%; }
.feat-art.sales { align-items:end; }
.mini-bars { display:flex; align-items:flex-end; gap:6px; height:62px; transform:skewY(-8deg); }
.mini-bars i { width:12px; border-radius:4px 4px 0 0; background:linear-gradient(#9cd5ff,#4ba8ed); }
.mini-bars i:nth-child(1) { height:20px; }.mini-bars i:nth-child(2) { height:30px; }.mini-bars i:nth-child(3) { height:42px; }.mini-bars i:nth-child(4) { height:57px; }
.feat-art.resilient .feat-art-icon { width:62px; height:62px; background:#d8f6eb; }
.feat-art.resilient .feat-art-orbit { width:100px; height:100px; border-color:#b6ecd5; }
.features-signoff { margin:10px 14px 0 0; text-align:right; color:#4a9975; font-size:13px; font-style:italic; }
.pricing { background:transparent; }
.pricing-head { max-width:680px; margin:0 auto 42px; text-align:center; }
.pricing-head h2 { font-size:clamp(2rem,3.6vw,2.9rem); margin-bottom:12px; }
.pricing-head .lead { margin:0 auto; }
.pricing-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:stretch; gap:20px; max-width:1000px; margin:0 auto; }
.price-card { display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line); border-radius:20px; padding:26px; box-shadow:var(--shadow); }
.price-card.popular { border:2px solid var(--accent); transform:translateY(-8px); }
.price-badge { align-self:flex-start; border-radius:999px; background:var(--sage-soft); color:var(--sage); padding:5px 11px; margin-bottom:16px; font-size:11px; font-weight:700; }
.price-card h3 { font-size:1.25rem; margin-bottom:5px; }
.price-duration { color:var(--ink-soft); font-size:13px; }
.price-amount { display:flex; align-items:baseline; gap:6px; margin:16px 0 4px; }
.price-amount strong { font-size:clamp(1.8rem,3vw,2.3rem); line-height:1; }
.price-amount span { color:var(--ink-soft); font-size:12px; }
.price-summary { min-height:40px; color:var(--ink-soft); font-size:13px; }
.price-features { list-style:none; display:grid; gap:9px; margin:18px 0 22px; color:var(--ink-soft); font-size:13px; }
.price-features li::before { content:"✓"; color:var(--accent); font-weight:700; margin-right:9px; }
.price-card .btn { justify-content:center; margin-top:auto; padding:11px 16px; font-size:13px; }
.portal { position:relative; overflow:hidden; background:transparent; }
.portal-grid { display:grid; grid-template-columns:minmax(0,.86fr) minmax(0,1.14fr); gap:42px; align-items:center; }
.portal-copy { position:relative; min-width:0; padding:10px 0; }
.portal-copy > .eyebrow { display:inline-flex; align-items:center; gap:9px; border-radius:999px; background:rgba(232,246,237,.92); padding:7px 15px; color:#287a56; letter-spacing:.16em; }
.portal-copy > .eyebrow svg { width:16px; height:16px; }
.portal-copy h2 { max-width:560px; font-size:clamp(2.4rem,4.2vw,3.65rem) !important; letter-spacing:-.045em; line-height:1.04; margin:12px 0 16px !important; }
.portal-copy h2 em { color:#13865c; }
.portal-copy > .lead { max-width:510px; font-size:1rem; line-height:1.6; }
.portal-copy ul { list-style:none; display:grid; gap:16px; margin:24px 0 24px; max-width:500px; }
.portal-copy li { display:flex; align-items:center; gap:12px; }
.portal-copy li span.n { flex-shrink:0; width:44px; height:44px; border-radius:50%; background:#e3f3e9; color:#176f4b; display:grid; place-items:center; }
.portal-copy li span.n svg { width:21px; height:21px; }
.portal-copy li b { display:block; font-size:14px; font-weight:700; }
.portal-copy li small { display:block; color:var(--ink-soft); font-size:12px; line-height:1.4; margin-top:2px; }
.portal-actions { display:flex; align-items:center; flex-wrap:wrap; gap:14px; }
.portal-actions .btn { padding:12px 21px; }
.portal-demo { display:inline-flex; align-items:center; gap:9px; color:#398263; font-size:12px; font-weight:600; }
.portal-demo-icon { width:34px; height:34px; border:1px solid #b9ddc8; border-radius:50%; display:grid; place-items:center; background:rgba(255,255,255,.7); }
.portal-demo-icon svg { width:14px; height:14px; fill:#188156; }
.portal-food-art { position:absolute; z-index:0; width:220px; height:180px; right:-52px; bottom:-30px; display:grid; place-items:center; pointer-events:none; }
.portal-food-orbit { position:absolute; inset:4px 0 0 20px; border-radius:50%; background:radial-gradient(ellipse,rgba(127,204,155,.25),rgba(127,204,155,.08) 65%,transparent 72%); }
.portal-food-plate { position:relative; z-index:1; width:174px; height:112px; display:grid; place-items:center; border:8px solid #fffdf8; border-radius:50%; background:radial-gradient(ellipse at 50% 50%,#f4c77e 0 9%,#548546 10% 15%,#e7a344 16% 25%,#d9682c 26% 35%,#6c963d 36% 44%,#fffdf8 45% 57%,#d8d3c4 58% 63%,#fffdf8 64%); box-shadow:0 14px 25px -14px rgba(22,48,38,.55); transform:rotate(-10deg); font-size:39px; }
.menu-card { position:relative; z-index:1; background:rgba(255,255,255,.94); border-radius:26px; border:1px solid rgba(220,237,226,.95); box-shadow:0 20px 48px -30px rgba(22,48,38,.36); padding:28px; }
.menu-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px; }
.menu-title { display:flex; align-items:center; gap:14px; }
.menu-title-icon { flex:0 0 48px; width:48px; height:48px; display:grid; place-items:center; border-radius:50%; background:#e8f5ec; color:#176f4b; }
.menu-title-icon svg { width:23px; height:23px; }
.menu-head h3 { font-size:1.45rem; letter-spacing:-.03em; }
.menu-head p { color:var(--ink-soft); font-size:12px; margin-top:3px; }
.menu-card .live-pill { border:1px solid #cce7d6; background:#f3faf5; }
.tabs { display:flex; gap:8px; margin-bottom:15px; flex-wrap:wrap; }
.tabs span { display:inline-flex; align-items:center; justify-content:center; font-size:12px; padding:7px 15px; border-radius:999px; border:1px solid #dcebe1; background:rgba(255,255,255,.75); }
.tabs span.on { background:#16805b; color:#fff; border-color:#16805b; }
.dish { display:flex; align-items:center; gap:13px; padding:12px 0; border-bottom:1px solid #edf2ee; }
.dish:last-of-type { border-bottom:0; }
.dish-thumb { width:66px; height:62px; border-radius:17px; display:grid; place-items:center; overflow:hidden; flex-shrink:0; box-shadow:inset 0 0 0 1px rgba(22,48,38,.04); }
.dish-thumb img { width:100%; height:100%; object-fit:cover; }
.dish-info { flex:1; min-width:0; }
.dish-info b { display:block; font-size:14px; font-weight:700; }
.dish-info small { display:block; color:var(--ink-soft); font-size:12px; margin-top:3px; }
.dish-info .dish-meta { display:flex; align-items:center; gap:7px; }
.dish-meta svg { width:14px; height:14px; color:#47a87a; }
.dish-price { flex-shrink:0; font-weight:700; font-size:14px; white-space:nowrap; }
.cta { padding:0 0 96px; background:transparent; }
.cta-box { background:var(--ink); color:#eaf6f0; border-radius:32px; padding:72px 56px; display:grid; grid-template-columns:1.3fr 1fr; gap:40px; align-items:center; position:relative; overflow:hidden; }
.cta-box::after { content:""; position:absolute; width:420px; height:420px; border-radius:50%; background:radial-gradient(circle,rgba(47,143,107,.45),transparent 70%); right:-120px; top:-160px; }
.cta-box h2 { font-size:clamp(2rem,3.6vw,2.9rem); margin-bottom:14px; position:relative; z-index:1; }
.cta-box p { color:#cfe6da; position:relative; z-index:1; }
.cta-form { position:relative; z-index:1; display:grid; gap:12px; }
.cta-field { display:grid; gap:6px; color:#cfe6da; font-size:13px; font-weight:600; }
.cta-form input { font:inherit; padding:15px 18px; border-radius:14px; border:1px solid #2f6b4f; background:#1f4a38; color:#eaf6f0; width:100%; }
.cta-form input::placeholder { color:#8fb8a6; }
.cta-form input:focus { outline:2px solid var(--accent); outline-offset:1px; }
.cta-form .btn { justify-content:center; }
.cta-note { font-size:13px; color:#9a8f80 !important; }
footer { border-top:0; padding:36px 0; font-size:14px; color:var(--ink-soft); background:transparent; }
.foot-inner { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
@media (max-width:960px) { .hero-grid,.portal-grid,.cta-box { grid-template-columns:1fr; } .nav-links { display:none; } .nav-inner { position:relative; } .nav-actions { gap:10px; } .menu-toggle { display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border:1px solid var(--line); border-radius:50%; background:rgba(255,255,255,.7); color:var(--ink); cursor:pointer; } .nav-links.is-open { position:absolute; top:calc(100% + 1px); left:0; right:0; display:flex; flex-direction:column; align-items:stretch; gap:0; padding:8px 16px; border:1px solid var(--line); border-radius:0 0 16px 16px; background:rgba(250,249,244,.98); box-shadow:0 16px 28px -20px rgba(22,48,38,.5); } .nav-links.is-open a { padding:10px 4px; border-bottom:0; } .steps { grid-template-columns:repeat(2,1fr); row-gap:40px; } .steps::before { display:none; } .feat-grid { grid-template-columns:1fr 1fr; } .ticket { right:0; } }
@media (max-width:960px) { .feat-intro { grid-template-columns:minmax(0,1.15fr) minmax(240px,.85fr); gap:10px; } .feat-head h2 { font-size:clamp(2.2rem,5vw,3.2rem); } .feat-grid { gap:9px; } .feat { min-height:205px; padding:16px; } .feat-copy { max-width:84%; } .feat-art { right:8px; opacity:.55; } .portal-grid { grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:26px; } .portal-food-art { opacity:.7; right:-80px; } .menu-card { padding:22px; } }
@media (max-width:960px) { .arch-intro { grid-template-columns:minmax(0,1fr) minmax(210px,.65fr); gap:16px; } .arch-body { grid-template-columns:1fr; gap:20px; } .arch-summary { display:grid; grid-template-columns:54px 1fr; column-gap:16px; padding:0 0 18px; border-right:0; border-bottom:1px solid #d8ebe0; } .arch-summary-icon { grid-row:span 2; margin:0; } .arch-summary h3 { align-self:end; margin-bottom:4px; } .arch-summary p { align-self:start; } .arch-benefits { grid-template-columns:repeat(2,minmax(0,1fr)); padding:18px 0 0; border-left:0; border-top:1px solid #d8ebe0; } }
@media (max-width:960px) { .steps { gap:20px; } .step:not(:last-child)::after { display:none; } }
@media (max-width:860px) { .roles-grid { grid-template-columns:1fr; } }
@media (max-width:960px) { .pricing-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:640px) { .pricing-grid { grid-template-columns:1fr; } .price-card.popular { transform:none; } .role { grid-template-columns:1fr; padding:20px 18px 0; } .role-visual { height:205px; margin:8px -18px 0; } .role-copy { align-self:auto; } .admin-window { width:min(78%,280px); } .printer { transform:scale(.9); } }
@media (max-width:640px) { .feat-intro { grid-template-columns:1fr; margin-bottom:18px; } .feat-head h2 { font-size:clamp(2.4rem,10vw,3rem); } .feat-head .lead { font-size:.92rem; } .feat-hero-art { height:148px; margin-top:12px; } .feat-grid { grid-template-columns:1fr; gap:10px; } .feat { min-height:190px; padding:17px 18px; } .feat-copy { max-width:77%; } .feat-art { right:14px; opacity:.76; } .portal-grid { grid-template-columns:1fr; gap:30px; } .portal-copy h2 { font-size:clamp(2.3rem,10vw,3.1rem) !important; } .portal-food-art { width:130px; height:110px; right:-34px; bottom:-10px; opacity:.42; } .portal-food-plate { width:110px; height:75px; font-size:28px; } .portal-copy ul { gap:12px; margin:18px 0; } .menu-card { padding:20px 16px; } .menu-title { gap:9px; } .menu-title-icon { flex-basis:40px; width:40px; height:40px; } .menu-head h3 { font-size:1.2rem; } .dish { gap:9px; } .dish-thumb { width:54px; height:54px; font-size:25px; } .dish-info b { font-size:12px; } .dish-info small { font-size:10px; } .dish-price { font-size:12px; } .tabs { gap:6px; } .tabs span { padding:6px 10px; font-size:11px; } }
@media (max-width:640px) { .arch-intro { grid-template-columns:1fr; gap:0; margin-bottom:10px; } .arch .section-head h2 { font-size:clamp(2.35rem,11vw,3.2rem); } .arch .section-head .lead { font-size:.95rem; } .arch-art { height:150px; } .arch-orbit { width:135px; } .arch-server-stack { transform:scale(.8) perspective(460px) rotateY(-12deg) rotateX(4deg); } .arch-db-icon { right:calc(50% - 72px); bottom:23px; transform:scale(.85); } .arch-note { right:2%; top:14px; font-size:11px; } .arch-card { padding:20px 16px 14px; border-radius:22px; } .arch-flow { grid-template-columns:1fr; gap:10px; } .arch-connector { width:2px; height:20px; margin:auto; background:linear-gradient(180deg,#8fceb0,#48a77a); } .arch-connector::before,.arch-connector::after { left:50%; right:auto; transform:translateX(-50%); } .arch-connector::before { top:0; }.arch-connector::after { top:auto; bottom:0; } .arch-core { width:72px; height:72px; } .arch-core span { width:48px; height:48px; } .arch-outputs { gap:8px; } .arch-outputs::before,.arch-target::before { display:none; } .arch-benefits { gap:12px; } .arch-ribbon { margin-top:16px; } .arch-ribbon em { width:100%; margin-left:40px; } }
@media (max-width:420px) { .arch-benefits { grid-template-columns:1fr; } }
@media (max-width:640px) { .flow-head { margin-bottom:28px; } .flow-head .lead { font-size:.96rem; } .steps { gap:18px; } .step { min-height:0; padding:20px; } .step p { min-height:0; } }
@media (max-width:640px) { section { padding:72px 0; } .nav-inner { height:38px; } .nav .wrap { padding:0 14px; } .brand { gap:6px; font-size:.9rem; } .brand-mark { width:22px; height:22px; border-radius:6px; font-size:10px; } .nav-inner > div { gap:6px !important; } .live-pill { gap:5px; padding:4px 8px; font-size:9px; } .dot { width:6px; height:6px; } .nav-inner .btn { padding:5px 11px !important; font-size:10px !important; } .hero { min-height:calc(100svh - 38px); padding:10px 0 10px; } .hero::before { width:120vw; } .hero::after { width:120px; height:50px; bottom:8px; } .hero .wrap { padding:0 18px; } .hero .eyebrow { margin-bottom:9px; padding:4px 10px; font-size:9px; } .hero h1 { font-size:clamp(1.7rem,5.4vw,2.1rem); line-height:1.02; margin-bottom:10px; } .hero .lead { max-width:440px; font-size:.72rem; line-height:1.35; } .hero-actions { margin:12px 0 14px; gap:8px; } .hero-actions .btn { padding:7px 11px; font-size:10px; } .stats { width:100%; } .stat { padding:0 6px; } .stat strong { font-size:1.1rem; } .stat span { margin-top:2px; font-size:8px; } .roles-grid,.feat-grid,.steps { grid-template-columns:1fr; } .arch-card { padding:20px; } .cta-box { padding:40px 26px; } .tables { grid-template-columns:repeat(3,1fr); } .ticket { position:static; width:100%; margin-top:16px; } }
@media (max-width:960px) { .nav .wrap,.hero .wrap { max-width:1320px; } .hero::before { background:linear-gradient(90deg,rgba(250,249,243,.91) 0%,rgba(250,249,243,.83) 48%,rgba(250,249,243,.4) 100%),linear-gradient(0deg,rgba(32,25,18,.13),transparent 30%); } .hero-copy { width:min(100%,680px); } }
@media (max-width:640px) { .nav-inner { height:58px; } .brand { font-size:.9rem; } .nav-actions { gap:6px; } .nav-actions .live-pill { font-size:9px; } .nav-actions .btn { min-width:0; } .menu-toggle { width:34px; height:34px; } .hero { min-height:100svh; margin-top:-58px; padding:94px 0 38px; } .hero-copy { transform:none; } .hero-backdrop { object-position:62% center; opacity:.9; } .hero::before { background:linear-gradient(90deg,rgba(250,249,243,.93) 0%,rgba(250,249,243,.84) 68%,rgba(250,249,243,.43) 100%),linear-gradient(0deg,rgba(32,25,18,.1),transparent 30%); } .hero .eyebrow { font-size:10px; margin-bottom:15px; } .hero h1 { max-width:560px; font-size:clamp(2.5rem,10vw,3.6rem); line-height:1.02; margin-bottom:16px; } .hero .lead { max-width:480px; font-size:.92rem; line-height:1.5; } .hero-actions { margin:20px 0 34px; gap:10px; } .hero-actions .btn { padding:11px 16px; font-size:12px; } .stats { grid-template-columns:1fr; gap:14px; max-width:280px; } .stat,.stat:first-child { padding:0; border:0; } .stat strong { font-size:1.1rem; } .stat span { margin-left:38px; font-size:10px; } }
@media (max-width:960px) { .strip-inner { gap:14px; } .strip-intro { flex-basis:29%; gap:10px; padding-right:14px; font-size:12px; } .chips { justify-content:flex-start; flex-wrap:wrap; overflow:visible; } .chip { flex:0 1 auto; padding:7px 10px; } }
@media (max-width:640px) { .strip { padding:12px 0; } .strip-inner { align-items:stretch; flex-direction:column; gap:10px; } .strip-intro { flex-basis:auto; min-height:30px; padding:0; border-right:0; font-size:12px; } .strip-intro br { display:none; } .strip-intro-icon { flex-basis:30px; width:30px; height:30px; } .chips { width:100%; margin:0 -2px; padding:1px 2px 5px; } .chip { min-height:36px; font-size:10px; } }
@media (max-width:960px) { .hero::before { background:linear-gradient(180deg,transparent 55%,rgba(239,247,241,.91) 100%),linear-gradient(90deg,rgba(250,249,243,.93) 0%,rgba(250,249,243,.84) 48%,rgba(250,249,243,.43) 100%); } }
.reveal { opacity:1; transform:none; transition:opacity .7s ease, transform .7s ease; }
html.js .reveal { opacity:0; transform:translateY(32px); }
html.js .reveal.is-visible { opacity:1; transform:none; }
.reveal.delay-1 { transition-delay:.08s; }
.reveal.delay-2 { transition-delay:.16s; }
.reveal.delay-3 { transition-delay:.24s; }
@media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } html { scroll-behavior:auto; } .reveal { opacity:1; transform:none; } }
.landing-page .site-flourish__leaves--top-left,.landing-page .site-flourish__leaves--top-right,.landing-page .site-flourish__plate { display:none; }
`;

export default function Landing() {
  const [showLogin, setShowLogin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: menu, isPending: isMenuPending, isError: isMenuError, refetch: refetchMenu, isFetching: isMenuFetching } = useQuery<LandingMenuResponse>({
    queryKey: ['public-menu'],
    queryFn: () => get<LandingMenuResponse>('/public/menu'),
  });
  const menuCategories = menu?.categories.slice(0, 4) ?? [];
  const menuItems = (menu?.items ?? [])
    .filter((item) => item.available && !item.soldOut)
    .map((item) => ({ ...item, photoUrl: getMenuImageUrl(item.name, item.imageUrl) }))
    .filter((item): item is LandingMenuItem & { photoUrl: string } => Boolean(item.photoUrl && !item.photoUrl.toLowerCase().endsWith('.svg')))
    .slice(0, 3);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    document.body.classList.add('landing-page');
    document.documentElement.classList.add('js');
    const targets = document.querySelectorAll('section, .hero-visual, .arch-card, .role, .feat, .step, .menu-card, .cta-box, .strip');
    targets.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      document.body.classList.remove('landing-page');
    };
  }, []);
  return (
    <>
      <style>{CSS}</style>
      <header className="nav">
        <div className="wrap nav-inner">
          <Link to="/" className="brand" aria-label="RestoPOS home"><span className="brand-mark" aria-hidden="true">▲</span> RestoPOS</Link>
          <nav id="main-navigation" aria-label="Main navigation" className={`nav-links${menuOpen ? ' is-open' : ''}`}>
            <a href="#home" className="is-active" onClick={() => setMenuOpen(false)}>Home</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="#flow" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
          </nav>
          <div className="nav-actions">
            <span className="live-pill"><span className="dot"></span> Live sync</span>
            <button type="button" onClick={() => { setMenuOpen(false); setShowLogin(true); }} className="btn btn-primary">Login <ArrowRight size={16} aria-hidden="true" /></button>
            <button type="button" className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={18} aria-hidden="true" /> : <MenuIcon size={18} aria-hidden="true" />}</button>
          </div>
        </div>
      </header>

      <section className="hero" id="home">
        <img className="hero-backdrop" src={heroScene} alt="" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><Utensils aria-hidden="true" /> Smart Restaurant Management</span>
            <h1>Every table, every order,<br /><em>live</em> on every screen.</h1>
            <p className="lead">RestoPOS connects your waiters, cashiers, kitchen and management in real time. Orders reach the kitchen as soon as they’re placed, bills settle quickly, and guests can browse the menu from their phones.</p>
            <div className="hero-actions">
              <Link to="/public" className="btn btn-primary">View the menu <ArrowRight size={16} aria-hidden="true" /></Link>
              <a href="#flow" className="btn btn-ghost"><Play size={14} aria-hidden="true" fill="currentColor" /> See how it works</a>
            </div>
            <div className="stats">
              <div className="stat"><strong><Clock3 aria-hidden="true" /> &lt; 200ms</strong><span>Order-to-kitchen sync</span></div>
              <div className="stat"><strong><UsersRound aria-hidden="true" /> 4 Logins</strong><span>One shared database</span></div>
              <div className="stat"><strong><BadgeCheck aria-hidden="true" /> 24/7</strong><span>Live WebSocket updates</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="strip">
        <div className="wrap strip-inner">
          <div className="strip-intro">
            <span className="strip-intro-icon"><Utensils aria-hidden="true" /></span>
            <span>Built for dine-in restaurants, cafés<br />and multi-floor venues</span>
          </div>
          <div className="chips" aria-label="Restaurant management features">
            <span className="chip chip-active"><Armchair aria-hidden="true" />Table management</span>
            <span className="chip"><ReceiptText aria-hidden="true" />Split bills</span>
            <span className="chip"><ChefHat aria-hidden="true" />Kitchen routing</span>
            <span className="chip"><BookOpenCheck aria-hidden="true" />Receipts &amp; tax</span>
          </div>
        </div>
      </div>

      <section className="arch" id="architecture">
        <div className="wrap">
          <div className="arch-intro">
            <div className="section-head">
              <span className="eyebrow"><Layers3 size={15} aria-hidden="true" /> &nbsp; System Architecture</span>
              <h2>One brain, <em>many screens.</em></h2>
              <p className="lead">A central real-time server and PostgreSQL database keep every device on the same truth. When a waiter adds an item, the kitchen, the cashier and the admin dashboard update together.</p>
            </div>
            <div className="arch-art" aria-hidden="true">
              <span className="arch-orbit" />
              <div className="arch-server-stack"><span className="arch-server"><i /><i /></span><span className="arch-server"><i /><i /></span><span className="arch-server"><i /><i /></span></div>
              <span className="arch-db-icon"><Database /></span>
              <span className="arch-note">One system,<br />connected everywhere</span>
            </div>
          </div>
          <div className="arch-card" aria-label="System architecture diagram">
            <div className="arch-body">
              <div className="arch-summary">
                <span className="arch-summary-icon"><Database aria-hidden="true" /></span>
                <h3>Central Server &amp; PostgreSQL Database</h3>
                <p>Keeps every order, payment and update in sync across all devices.</p>
              </div>
              <div className="arch-flow">
                <div className="arch-endpoint arch-source">
                  <span className="arch-endpoint-icon"><BellRing aria-hidden="true" /></span>
                  <span><strong>Waiter</strong><small>Adds items &amp; updates orders</small></span>
                </div>
                <span className="arch-connector" aria-hidden="true" />
                <div className="arch-core" aria-label="Real-time central server"><span><Database aria-hidden="true" /></span></div>
                <span className="arch-connector" aria-hidden="true" />
                <div className="arch-outputs">
                  <div className="arch-endpoint arch-target"><span className="arch-endpoint-icon"><ChefHat aria-hidden="true" /></span><span><strong>Kitchen</strong><small>Receives orders instantly</small></span></div>
                  <div className="arch-endpoint arch-target"><span className="arch-endpoint-icon"><Printer aria-hidden="true" /></span><span><strong>Cashier</strong><small>Updates billing &amp; payments</small></span></div>
                  <div className="arch-endpoint arch-target"><span className="arch-endpoint-icon"><UserRoundCog aria-hidden="true" /></span><span><strong>Admin Dashboard</strong><small>Shows live updates &amp; reports</small></span></div>
                </div>
              </div>
              <div className="arch-benefits">
                <div className="arch-benefit"><span className="arch-benefit-icon"><Zap aria-hidden="true" /></span><span><strong>Real-time Sync</strong><small>No delay, no confusion</small></span></div>
                <div className="arch-benefit"><span className="arch-benefit-icon"><ShieldCheck aria-hidden="true" /></span><span><strong>Reliable &amp; Secure</strong><small>Your data is always safe</small></span></div>
                <div className="arch-benefit"><span className="arch-benefit-icon"><Layers3 aria-hidden="true" /></span><span><strong>Built on PostgreSQL</strong><small>Powerful, stable, trusted</small></span></div>
                <div className="arch-benefit"><span className="arch-benefit-icon"><MonitorSmartphone aria-hidden="true" /></span><span><strong>All Devices Connected</strong><small>Same truth, everywhere</small></span></div>
              </div>
            </div>
            <div className="arch-ribbon">
              <div className="arch-ribbon-main"><span className="arch-ribbon-check">✓</span><span>One system</span><b>/</b><span>Multiple devices</span><b>/</b><span>Real-time updates</span><b>/</b><span>Seamless operations</span></div>
              <em>Smarter kitchen. Smoother operations.</em>
            </div>
          </div>
        </div>
      </section>

      <section className="roles-section" id="roles">
        <div className="wrap">
          <div className="roles-head">
            <span className="eyebrow">Powerful Features</span>
            <h2>Four Purpose-Built Views</h2>
            <p className="lead">Everything you need to run your restaurant smoothly — from managing staff and orders to handling billing and kitchen operations.</p>
          </div>
          <div className="roles-grid">
            <article className="role r-admin">
              <div className="role-copy">
                <div className="role-icon"><UsersRound aria-hidden="true" /></div>
                <h3>Admin Dashboard</h3>
                <p>The control room for managers and owners. Configure everything, watch service live and keep your restaurant running at its best.</p>
                <ul><li>Menu, pricing and tax management</li><li>Staff accounts and role permissions</li><li>Live sales, table occupancy and reports</li></ul>
              </div>
              <div className="role-visual admin-visual" aria-hidden="true">
                <div className="admin-window">
                  <div className="mock-brand"><span>R</span> RestoPOS</div>
                  <div className="sales-label">Total Sales</div>
                  <strong className="sales-total">Nrs. 12,540</strong>
                  <span className="sales-change">↑ 12%</span>
                  <div className="sales-chart"><i /><i /><i /><i /><i /><i /><i /></div>
                  <svg className="mini-line" viewBox="0 0 180 24" preserveAspectRatio="none"><path d="M2 17 C25 25 30 8 52 13 S80 22 99 12 S127 19 145 8 S168 12 178 3" fill="none" stroke="#188552" strokeWidth="2" /></svg>
                </div>
                <span className="role-bubble"><UsersRound /></span>
              </div>
            </article>
            <article className="role r-waiter">
              <div className="role-copy">
                <div className="role-icon"><LayoutDashboard aria-hidden="true" /></div>
                <h3>Waiter App</h3>
                <p>Take orders at the table on any phone or tablet, and send them to the kitchen in one tap.</p>
                <ul><li>Visual floor plan with live table status</li><li>Add modifiers, notes and course timing</li><li>Instant alerts when food is ready</li></ul>
              </div>
              <div className="role-visual waiter-visual" aria-hidden="true">
                <div className="phone"><div className="phone-grid">
                  <span className="phone-table">T1<small>Free</small></span><span className="phone-table busy">T2<small>Ordering</small></span>
                  <span className="phone-table">T3<small>Free</small></span><span className="phone-table">T4<small>Free</small></span>
                  <span className="phone-table">T5<small>Free</small></span><span className="phone-table busy">T6<small>Preparing</small></span>
                </div></div>
                <i className="motion-mark" />
                <span className="role-bubble"><Zap /></span>
              </div>
            </article>
            <article className="role r-biller">
              <div className="role-copy">
                <div className="role-icon"><ReceiptText aria-hidden="true" /></div>
                <h3>Biller / Cashier</h3>
                <p>Close tables fast. Split bills, take any payment type, and print or send receipts.</p>
                <ul><li>Itemised bills, discounts and split payments</li><li>Cash, card and digital wallet support</li><li>Printable and emailed receipts</li></ul>
              </div>
              <div className="role-visual biller-visual" aria-hidden="true">
                <div className="printer">
                  <div className="receipt"><span className="receipt-brand">▣ RestoPOS</span><span className="receipt-line">Veg Chowmein <b>Nrs. 250</b></span><span className="receipt-line">Chicken Momo <b>Nrs. 300</b></span><span className="receipt-line">Coke <b>Nrs. 100</b></span><span className="receipt-total">Total&nbsp;&nbsp;&nbsp;&nbsp; Nrs. 650</span></div>
                </div>
                <span className="role-bubble"><ReceiptText /></span>
              </div>
            </article>
            <article className="role r-kds">
              <div className="role-copy">
                <div className="role-icon"><Monitor aria-hidden="true" /></div>
                <h3>Kitchen Display (KDS)</h3>
                <p>Tickets appear on the kitchen screen the moment they're fired, sorted by station and urgency.</p>
                <ul><li>Station-based routing (grill, fry, bar)</li><li>Bump tickets and update status in real time</li><li>Timers that flag delayed orders</li></ul>
              </div>
              <div className="role-visual kds-visual" aria-hidden="true">
                <div className="monitor"><div className="kds-screen">
                  <div className="kds-tabs"><span>All (6)</span><span>Preparing (2)</span><span>Ready (3)</span></div>
                  <div className="kds-order"><b>T3</b><span>Veg Chowmein</span><span className="kds-status">Preparing</span></div>
                  <div className="kds-order"><b>T4</b><span>Chicken Momo</span><span className="kds-status">Preparing</span></div>
                  <div className="kds-order"><b>T6</b><span>Fried Rice</span><span className="kds-status ready">Ready</span></div>
                </div></div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="flow" id="flow">
        <div className="wrap">
          <div className="flow-head">
            <span className="eyebrow"><Sparkles size={16} aria-hidden="true" /> How It Works</span>
            <h2>From seat to receipt —<br /><em>in just 4 simple steps.</em></h2>
            <p className="lead">Ordering at RestoPOS is fast, easy, and designed to keep your restaurant running smoothly. Here's how it works:</p>
          </div>
          <div className="steps">
            <article className="step">
              <div className="step-top"><span className="step-icon"><Armchair aria-hidden="true" /></span><span className="step-num">01</span></div>
              <h4>Seat &amp; order</h4>
              <p>The waiter opens the table on their phone and records items with modifiers.</p>
              <span className="step-tag"><Smartphone aria-hidden="true" /> Fast &amp; Convenient</span>
            </article>
            <article className="step">
              <div className="step-top"><span className="step-icon"><ChefHat aria-hidden="true" /></span><span className="step-num">02</span></div>
              <h4>Fire to kitchen</h4>
              <p>The order engine routes each item to the right station and the KDS lights up instantly.</p>
              <span className="step-tag"><Zap aria-hidden="true" /> Instant Routing</span>
            </article>
            <article className="step">
              <div className="step-top"><span className="step-icon"><BellRing aria-hidden="true" /></span><span className="step-num">03</span></div>
              <h4>Serve &amp; update</h4>
              <p>Kitchen bumps items as ready, and the waiter is alerted on their device.</p>
              <span className="step-tag"><Bell aria-hidden="true" /> Real-time Alerts</span>
            </article>
            <article className="step">
              <div className="step-top"><span className="step-icon"><ReceiptText aria-hidden="true" /></span><span className="step-num">04</span></div>
              <h4>Bill &amp; close</h4>
              <p>The cashier settles the bill, prints a receipt, and the table frees up on every screen.</p>
              <span className="step-tag"><Printer aria-hidden="true" /> Quick &amp; Seamless</span>
            </article>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="wrap">
          <div className="feat-intro">
            <div className="feat-head">
              <span className="eyebrow"><Sparkles size={15} aria-hidden="true" /> Everything in one place</span>
              <h2>Built for the rush,<br /><em>not just the back office.</em></h2>
              <p className="lead">From orders to operations, everything you need to run your restaurant smoothly — all in one powerful system.</p>
            </div>
            <div className="feat-hero-art" aria-hidden="true">
              <span className="feat-hero-orbit" />
              <div className="feat-monitor">
                <div className="feat-monitor-screen">
                  <div className="feat-monitor-side"><i /><i /><i /><i /><i /></div>
                  <div className="feat-monitor-main">
                    <div className="feat-monitor-top"><b /><i /></div>
                    <div className="feat-menu-grid"><i /><i /><i /><i /><i /><i /></div>
                    <span className="feat-monitor-line" />
                  </div>
                </div>
              </div>
              <span className="feat-floating sync"><Zap /> Real-time Sync</span>
              <span className="feat-floating secure"><ShieldCheck /> Secure</span>
              <span className="feat-floating grow"><Database /> Grow Faster</span>
            </div>
          </div>
          <div className="feat-grid">
            <article className="feat">
              <div className="feat-copy"><div className="ic"><Zap aria-hidden="true" /></div><h4>Instant sync</h4><p>WebSocket updates keep every device current without refreshing, even during the busiest service.</p><span className="feat-tag"><ArrowRight /> Real-time updates</span></div>
              <div className="feat-art sync" aria-hidden="true"><span className="feat-art-orbit" /><span className="feat-art-icon"><Zap /></span></div>
            </article>
            <article className="feat">
              <div className="feat-copy"><div className="ic"><LayoutDashboard aria-hidden="true" /></div><h4>Live floor plan</h4><p>See which tables are free, seated, ordering or paying across every floor at a glance.</p><span className="feat-tag"><ArrowRight /> Manage tables</span></div>
              <div className="feat-art floor" aria-hidden="true"><span className="floor-map"><i /><i /><i /><i /><i /><i /><i /><i /><i /></span></div>
            </article>
            <article className="feat">
              <div className="feat-copy"><div className="ic"><ShieldCheck aria-hidden="true" /></div><h4>Secure by role</h4><p>Staff log in with role-scoped permissions so a waiter can't change prices or reports.</p><span className="feat-tag"><ArrowRight /> Role-based access</span></div>
              <div className="feat-art security" aria-hidden="true"><span className="feat-art-icon"><ShieldCheck /></span></div>
            </article>
            <article className="feat">
              <div className="feat-copy"><div className="ic"><ReceiptText aria-hidden="true" /></div><h4>Split &amp; merge bills</h4><p>Divide a bill by seat or item, or combine two tables into one check in a couple of taps.</p><span className="feat-tag"><ArrowRight /> Flexible billing</span></div>
              <div className="feat-art bills" aria-hidden="true"><span className="feat-art-icon"><ReceiptText /></span><span className="mini-receipt" /></div>
            </article>
            <article className="feat">
              <div className="feat-copy"><div className="ic"><Database aria-hidden="true" /></div><h4>Sales insight</h4><p>Daily takings, top sellers, and staff performance, all calculated from one shared database.</p><span className="feat-tag"><ArrowRight /> Smarter decisions</span></div>
              <div className="feat-art sales" aria-hidden="true"><span className="mini-bars"><i /><i /><i /><i /></span></div>
            </article>
            <article className="feat">
              <div className="feat-copy"><div className="ic"><BellRing aria-hidden="true" /></div><h4>Resilient service</h4><p>Orders are saved locally when the connection drops, then sync cleanly once you're back online.</p><span className="feat-tag"><ArrowRight /> Never lose orders</span></div>
              <div className="feat-art resilient" aria-hidden="true"><span className="feat-art-orbit" /><span className="feat-art-icon"><BellRing /></span></div>
            </article>
          </div>
          <p className="features-signoff">Better tools. Smoother service.</p>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="wrap">
          <div className="pricing-head">
            <span className="eyebrow">Plans for every restaurant</span>
            <h2>Simple, transparent pricing.</h2>
            <p className="lead">Start with a free trial, then choose the plan that fits your restaurant.</p>
          </div>
          <div className="pricing-grid">
            <article className="price-card">
              <span className="price-badge">30-day free trial</span>
              <h3>Free Trial</h3>
              <span className="price-duration">30 days</span>
              <div className="price-amount"><strong>Nrs. 0</strong><span>/ 30 days</span></div>
              <p className="price-summary">Explore RestoPOS before choosing a plan.</p>
              <ul className="price-features">
                <li>Access to all staff logins</li>
                <li>Live orders and kitchen updates</li>
                <li>Menu and table management</li>
              </ul>
              <a href="#contact" className="btn btn-ghost">Start Free Trial</a>
            </article>
            <article className="price-card popular">
              <span className="price-badge">Most popular</span>
              <h3>3 Months Plan</h3>
              <span className="price-duration">Billed every 3 months</span>
              <div className="price-amount"><strong>Nrs. 6,500</strong><span>/ 3 months</span></div>
              <p className="price-summary">Everything you need to run service smoothly.</p>
              <ul className="price-features">
                <li>Access to all staff logins</li>
                <li>Live orders and kitchen updates</li>
                <li>Reports, menu and table management</li>
              </ul>
              <a href="#contact" className="btn btn-primary">Get Started</a>
            </article>
            <article className="price-card">
              <span className="price-badge">Best value</span>
              <h3>1 Year Plan</h3>
              <span className="price-duration">Billed annually</span>
              <div className="price-amount"><strong>Nrs. 19,900</strong><span>/ 1 year</span></div>
              <p className="price-summary">Best value for long-term success.</p>
              <ul className="price-features">
                <li>Access to all staff logins</li>
                <li>Live orders and kitchen updates</li>
                <li>Reports, menu and table management</li>
              </ul>
              <a href="#contact" className="btn btn-ghost">Get Started</a>
            </article>
          </div>
        </div>
      </section>

      <section className="portal" id="portal">
        <div className="wrap portal-grid">
          <div className="portal-copy">
            <span className="eyebrow"><Utensils aria-hidden="true" /> Public Customer Portal</span>
            <h2>Guests explore<br />your <em>menu.</em></h2>
            <p className="lead">Give guests a branded page to explore your live menu and restaurant details.</p>
            <ul>
              <li><span className="n"><BookOpenCheck aria-hidden="true" /></span><div><b>Live Nepali menu</b><small>Menu prices and availability stay fresh as your team updates them.</small></div></li>
            </ul>
            <div className="portal-actions">
              <Link to="/public" className="btn btn-primary">View the menu <ArrowRight aria-hidden="true" size={16} /></Link>
              <a href="#flow" className="portal-demo"><span className="portal-demo-icon"><Play aria-hidden="true" /></span> See how it works</a>
            </div>
            <div className="portal-food-art" aria-hidden="true"><span className="portal-food-orbit" /><span className="portal-food-plate">🥘</span></div>
          </div>
          <div className="menu-card" aria-label="Live restaurant menu preview">
            <div className="menu-head">
              <div className="menu-title">
                <span className="menu-title-icon"><Utensils aria-hidden="true" /></span>
                <div><h3>Tonight's menu</h3><p>{menu?.restaurant?.name ?? 'Fresh restaurant favorites'}</p></div>
              </div>
              {menu && !isMenuError && <span className="live-pill"><span className="dot"></span> Live</span>}
            </div>
            {menuCategories.length > 0 && (
              <div className="tabs" aria-label="Menu categories">
                {menuCategories.map((category, index) => <span className={index === 0 ? 'on' : ''} key={category.id}>{category.name}</span>)}
              </div>
            )}
            {isMenuPending ? (
              <p className="dish" role="status">Loading the live menu...</p>
            ) : isMenuError ? (
              <div className="dish" role="alert">
                <div className="dish-info"><b>Live menu unavailable</b><small>Please try again in a moment.</small></div>
                <button className="dish-price" type="button" onClick={() => void refetchMenu()} disabled={isMenuFetching}>Retry</button>
              </div>
            ) : menuItems.length > 0 ? menuItems.map((item) => {
              const category = menu?.categories.find((entry) => entry.id === item.categoryId);
              const priceMinor = Math.round(item.priceMinor * (100 - item.discountPercent) / 100);
              return (
                <div className="dish" key={item.id}>
                  <div className="dish-thumb"><img src={item.photoUrl} alt="" loading="lazy" decoding="async" /></div>
                  <div className="dish-info">
                    <b className="dish-meta"><Leaf aria-hidden="true" /> {item.name}</b>
                    <small>{item.description || category?.name}</small>
                  </div>
                  <div className="dish-price">Nrs. {(priceMinor / 100).toFixed(2)}</div>
                </div>
              );
            }) : (
              <p className="dish" role="status">Menu photos are being added. Check the full menu for all available items.</p>
            )}
          </div>
        </div>
      </section>

      <section className="cta" id="contact" style={{ paddingTop: 24 }}>
        <div className="wrap">
          <div className="cta-box">
            <div>
              <h2>See your floor come alive in a 20-minute demo.</h2>
              <p>Tell us about your restaurant and we'll set up a sandbox with your menu, tables and staff roles so you can try every screen yourself.</p>
            </div>
            <form className="cta-form" onSubmit={(e) => { e.preventDefault(); const b = e.currentTarget.querySelector('button'); if (b) b.textContent = "Thanks — we'll be in touch!"; }}>
              <label className="cta-field"><span>Restaurant name</span><input type="text" aria-label="Restaurant name" required /></label>
              <label className="cta-field"><span>Work email</span><input type="email" aria-label="Work email" required /></label>
              <button className="btn btn-primary" type="submit">Book my demo →</button>
              <span className="cta-note">No credit card required. Free 30-day trial.</span>
            </form>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot-inner">
          <span><strong style={{ color: 'var(--ink)' }}>RestoPOS</strong> · Real-time restaurant management</span>
          <nav className="foot-links" aria-label="Footer navigation">
            <a href="#pricing">Pricing</a>
            <a href="#flow">How it works</a>
            <Link to="/public">Menu</Link>
          </nav>
          <span>© {copyrightYear} RestoPOS. All rights reserved.</span>
        </div>
      </footer>
      {showLogin && <Login onClose={() => setShowLogin(false)} />}
    </>
  );
}
