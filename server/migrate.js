// ============================================================
// server/migrate.js
// Run ONCE: node server/migrate.js
// Seeds all 15 SQLite tables from the PSA data definitions
// Safe to re-run — uses INSERT OR REPLACE throughout
// ============================================================

const path = require('path');
// Bootstrap DB (creates schema if not exists)
const { getDB } = require('./database');

const db = getDB();

console.log('\n🚀 PSA Portal — Database Migration');
console.log('═'.repeat(45));

// ── HELPERS ─────────────────────────────────────────────────
function run(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
  } catch (e) {
    console.error(`  ✗  ${label}: ${e.message}`);
    throw e;
  }
}

// Wrap entire migration in a transaction for atomicity
const migrate = db.transaction(() => {

  // ── 1. PROJECTS ──────────────────────────────────────────
  run('projects', () => {
    db.prepare(`
      INSERT OR REPLACE INTO projects
        (projectId, name, client, psaRef, totalMW, blendedTariff, annualMSG,
         annualRevBudget, lifetimeRev, npv8, psaTerm, psaStart, psaEnd,
         codDate, status, complianceScore, technology, states)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      'sanathan',
      'Sanathan PSA',
      'Sanathan Textiles Limited',
      'PSA-SRI33PL-2026',
      32, 3.81, 177, 67, 1630, 446, 25,
      '01 Jul 2026', '30 Jun 2051', '2026-06-30',
      'Pre-COD', 74,
      'Solar + Wind',
      'Rajasthan, Karnataka'
    );
  });

  // ── 2. PLANTS ────────────────────────────────────────────
  run('plants', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO plants
        (projectId, plantId, name, technology, city, state,
         mw, acMW, tariff, codTarget, plantMSG, p90MU, status, risk)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    [
      ['sanathan','PLT-01','SRI33PL Fatehgarh','Solar','Fatehgarh','Rajasthan', 21,15,3.10,'30 Jun 2026',176.6,32.28,'Pre-COD','Critical'],
      ['sanathan','PLT-02','SRI33PL Bikaner',  'Solar','Bikaner',  'Rajasthan', 30,21,3.10,'31 Dec 2026', 46.12,46.12,'Pre-COD','Pre-COD'],
      ['sanathan','PLT-03','SRI33PL Gadag',    'Wind', 'Gadag',    'Karnataka', 45,45,3.81,'30 Jun 2027', 98.2, 98.2, 'Pre-COD','Pre-COD']
    ].forEach(r => ins.run(...r));
  });

  // ── 3. COMPLIANCE SNAPSHOT ───────────────────────────────
  run('compliance_snapshot', () => {
    db.prepare('DELETE FROM compliance_snapshot WHERE projectId = ?').run('sanathan');
    const ins = db.prepare(`
      INSERT INTO compliance_snapshot (projectId, area, status, score) VALUES (?,?,?,?)
    `);
    [
      ['CERC Captive Regs 2005',        'Compliant', 95],
      ['Open Access — State SERCs',     'At Risk',   68],
      ['RPO Compliance',                'Compliant', 95],
      ['CERC DSM Regs 2014',            'At Risk',   82],
      ['Grid Connectivity',             'At Risk',   70],
      ['GEOA Electricity Rules 2022',   'At Risk',   72],
      ['REC / MNRE Accreditation',      'Compliant', 88],
      ['CERC Registration — KA',        'Pending',   50]
    ].forEach(([area, status, score]) => ins.run('sanathan', area, status, score));
  });

  // ── 4. RISK REGISTER ─────────────────────────────────────
  run('risks', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO risks
        (projectId, riskId, category, plantsAffected, statesAffected,
         severity, likelihood, impact, score, description, regulatoryRef,
         mitigation, escalationTrigger, trend, lastReviewed, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const pid = 'sanathan', pa = 'All Plants', sa = 'Rajasthan, Karnataka';
    [
      ['CR-01','Payment Risk',           pa,sa,'Medium',6,8, 8.2,'Monthly Invoice with payment within 15 days of invoice','Article 8','BG enforcement (2-mo billing per plant) · Step-in rights under DRA','BG invocation if >30 days overdue','Worsening','23 Apr 2026','Open'],
      ['CR-02','Volume / MSG Risk',      pa,sa,'High',  7,7, 7.4,'PLT-01 pre-COD (0 gen FY25). Aggregate YTD generation 176.6 MUs vs prorated MSG','PSA Sch-7','Prorated MSG baseline from each plant COD · Deemed gen clause §10.4 · Annual AEQ true-up','LD exposure if annualised gen <95% MSG after true-up','Worsening','22 Apr 2026','Open'],
      ['CR-03','Market / Tariff Risk',   pa,sa,'Medium',4,6, 5.2,'Fixed blended tariff post COD — ₹3.81/kWh','CERC Tariff Regs 2020','Fixed tariff PSA — CIL pass-through §19 · Multi-state OA route optimisation','CIL claim >₹2 Cr or SERC surcharge >₹0.30/kWh increase','Stable','22 Apr 2026','Monitoring'],
      ['CR-04','Credit / Counterparty',  pa,sa,'Medium',4,8, 6.2,'Sanathan Polycot A(Positive) rated (ICRA 24th Mar 26). Combined 25-year PSA exposure ₹2,168 Cr','ICRA rating','Annual credit re-assessment','Rating downgrade below A or debt:equity >3.5x','Stable','23 Apr 2026','Monitoring'],
      ['CR-05','Change-in-Law Risk',     pa,sa,'High',  6,7, 7.1,'Notice submit not later than 20 days of such changes','Article 11','Notify within 20 days of change','Any adverse legislative change','Worsening','22 Apr 2026','Open'],
      ['CR-06','Grid Connectivity Risk', pa,sa,'Low',   5,8, 7.0,'Any Grid line delays — COD at risk. Grid avail % below threshold.','IEGC','Grid avail <94% or CTU delay >120 days','Grid avail <94%','Worsening','22 Apr 2026','Open'],
      ['CR-07','Force Majeure Risk',     pa,sa,'Medium',1,9, 4.0,'Act of God/War. Rajasthan: dust storm/heat. Karnataka: monsoon flood risk.','Article 12','MLOP/FLOP/EL/ALOP per plant · FM notification 48 hrs · Annual BCP drill','FM event declared; grid outage >7 days','Stable','22 Apr 2026','Monitoring'],
      ['CR-08','Risk of Default',        pa,sa,'Low', null,null,null,'Exercise Call/Put Option on trigger events — Article 7.3/4 (SHA)','Article 7.3/4','CU must sell all shares at ≥ Subscription Amount. Exercise ≤30 BD; settle ≤30 days','Default event','—','—','Open']
    ].forEach(([riskId,...rest]) => ins.run(pid, riskId, ...rest));
  });

  // ── 5. REGULATORY COMPLIANCE ─────────────────────────────
  run('compliance', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO compliance
        (projectId, refId, area, law, plantsText, requirement, status, score,
         frequency, lastAudit, nextAudit, responsible, action, owner, targetDate)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const pid = 'sanathan';
    [
      ['RC-01','CERC Captive Regs 2005',       'CERC CPP Rules 2005 Rule 3',      'SRI33PL',          '≥26% captive equity + ≥51% annual energy consumed by user',                  'Continuous', 95,'Throughout the year','—',          '30-Jun-26', 'Legal',       'Loss of captive status if non-compliant',                      'Legal Team',            '30-Jun-26'],
      ['RC-02','CERC Captive Reg – KA',         'CERC CPP Rules 2005; KERC Regs',  'PLT-01 (KA)',      'Pre-file CERC captive registration 6 months before PLT-01 COD',               'Pending',    50,'Pre-COD',          'Not yet',    '01-Sep-25', 'Legal',       'Prepare CERC application; file by 01 Sep 2025',                'Legal Team',            '01-Sep-25'],
      ['RC-05','CERC DSM Regs 2014',            'CERC DSM Regs 2014 Amdt 2022',    'PLT-02 · PLT-03',  'Schedule adherence ±10% declared capacity; minimise deviation charges',        'At Risk',    74,'Real-time/Monthly','28-Feb-25',  '31-Mar-25', 'O&M Mgr',     'PLT-02: Recalibrate forecasting model; PLT-03: BESS dispatch review','O&M Manager',        '15-Mar-25'],
      ['RC-06','IEGC Grid Code',                'IEGC 2010 Amdt 2023',             'PLT-02 · PLT-03',  'LVRT, reactive power ±0.95 pf, frequency response, scheduling',               'Compliant',  92,'Continuous',       '15-Feb-25',  '15-May-25', 'Project Eng', 'Submit IEGC compliance report May 2025; PLT-01 LVRT cert pre-COD','Project Eng',        '15-May-25'],
      ['RC-07','Open Access – PERC',            'PERC OA Regs; Electricity Rules 2022','PLT-02 (PB)',  'OA renewal FY2025-26; wheeling charges; PSEPCL banking agreement',            'At Risk',    65,'Annual',           '01-Mar-25',  '01-Apr-25', 'Regulatory',  'Attend MERC hearing 28 Mar; file OA renewal; PSPCL wheeling amendment','Legal + Regulatory','25-Mar-25'],
      ['RC-08','Open Access – RRERC',           'RRERC OA Regs; Electricity Rules 2022','PLT-03 (RJ)','OA approval from COD Feb 2025; RVPN wheeling agreement in place',            'Compliant',  82,'Annual',           '01-Feb-25',  '01-Feb-26', 'Regulatory',  'First-year OA active; monitor for PERC surcharge revision',    'Regulatory Mgr',        '01-Feb-26'],
      ['RC-10','Grid — PGCIL CTU',              'PGCIL Policy; IEGC; CEA Grid Standards','PLT-01 (KA)','Obtain PGCIL CTU 220 kV line connectivity before COD',                      'At Risk',    55,'Pre-COD',          'Not yet',    '31-Jan-26', 'Project Eng', 'Escalate to PGCIL CMD; file CERC petition; assess interim arrangement','Project Eng + Regulatory','15-Oct-25'],
      ['RC-11','REC / MNRE Accreditation',      'MNRE RE Cert Rules; NLDC Registry','PLT-02 · PLT-03', 'Valid MNRE accreditation; REC registration for eligible generation',            'Compliant',  88,'Annual',           '01-Feb-25',  '01-Feb-26', 'Regulatory',  'PLT-03 REC registration filed post-COD; PLT-02 accreditation valid till Mar 2026','Regulatory Mgr','01-Mar-26'],
      ['RC-12','Environmental Clearance',       'EP Act 1986; EIA 2006; Forest Act','All 3 Plants',    'EC validity, Wildlife NOC, SPCB CTE/CTO for each state',                      'Compliant',  91,'Annual',           '15-Nov-24',  '15-Nov-25', 'HSE Mgr',     'PLT-01 EC valid till 2045; PLT-02 SPCB CTO renewed; PLT-03 EC Jan 2025','HSE Manager',     '15-Nov-25'],
      ['RC-13','CEA Technical Standards',       'CEA Tech. Stds Regs 2010',        'PLT-02 · PLT-03',  '0.2S metering, protection relay settings, BESS safety (PLT-03)',              'Compliant',  93,'Annual',           '01-Oct-24',  '01-Oct-25', 'Project Eng', 'PLT-02 CEA inspection passed; PLT-03 BESS CEIG certification due Jun 2025','Project Eng',  '01-Jun-25'],
      ['RC-14','GST Compliance',                'GST Act 2017; CGST/IGST Rules',   'All 3 Plants',     'Monthly GSTR-3B/GSTR-1; ITC reconciliation across 3 states',                  'Compliant',  94,'Monthly',          '28-Feb-25',  '20-Apr-25', 'Finance',     'File March GSTR for KA+MH+RJ; reconcile ₹1.1 Cr ITC pending across plants','Finance Manager','20-Apr-25']
    ].forEach(([refId,...rest]) => ins.run(pid, refId, ...rest));
  });

  // ── 6. MILESTONES ────────────────────────────────────────
  run('milestones', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO milestones
        (projectId, msId, plantId, category, description, psaRef,
         plannedDate, pctComplete, status, consequence, responsible, dueBy, priority)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const pid = 'sanathan';
    [
      ['MS-01','All Plants','Pre-COD Regulatory',  'CERC Captive Plant registration — must be filed 6 months before COD',                          'CERC CPP Rules 2005 Rule 3','TBD',        0,  'Upcoming',    'COD cannot proceed without CERC captive registration',                                    'Legal Team',    '30-Jun-26','High'],
      ['MS-02','All Plants','Pre-COD Regulatory',  'KERC Open Access pre-approval + KPTCL wheeling agreement before COD',                          'KERC OA Regs; PSA §9',     'TBD',        0,  'Upcoming',    'No OA = wheeling not permitted; surcharge liability',                                      'Regulatory Mgr','30-Jun-26','High'],
      ['MS-03','All Plants','Target COD',          'Scheduled COD — 30-Jun-26 (solar), 31-Dec-26 (Wind)',                                          'Article 4',                '30-Jun-26',  10, 'At Risk',     'Grace period 6 months, else producer compensates shortfall (clause 6.1)',                 'Developer / PMC','31-Dec-26','Critical'],
      ['MS-04','All Plants','Delay SCOD',          'Delay LD — difference between DISCOM & ACCSP',                                                 'Article 4.1.b',            '—',          0,  'Upcoming',    'Delay LD difference between DISCOM & ACCSP',                                              'Developer / PMC','—',        'Medium'],
      ['MS-05','All Plants','Equity Infusion',     'Equity subscription: 1st tranche 15% (15-Apr-26), 2nd+3rd 25%+25% (30-Aug-26), 4th 35% (28-Feb-27)','Article 3 (SHA)',  '15-Apr-26',  15, 'At Risk',     'Subscription amount to be infused by captive user prior to SCOD',                         'Finance',       '30-Aug-26','High'],
      ['MS-06','All Plants','Invoice Payment',     'Monthly Invoice with payment within 15 days of invoice',                                       'Clause 8.1',               'TBD',        50, 'In Progress', '12 months Bank Guarantee with 1 month claim period',                                      'CFO + Legal',   '—',        'High'],
      ['MS-07','PLT-01',    'Payment Security',    'Unconditional and Irrevocable BG for 12 months equal to 2 months avg billing',                 'Clause 8.7',               '31-May-26',  20, 'In Progress', 'COD blocked without BG',                                                                  'BD',            '31-May-26','High'],
      ['MS-08','All Plants','Termination',         'Captive user default — Article 14.2',                                                          'Article 14.2',             '—',          0,  'Upcoming',    'Termination Penalty: Energy (CC) × ACCSP. Payment within 45 days else 9% interest.',     'Legal',         '—',        'Medium'],
      ['MS-09','All Plants','Termination',         'Power producer default — Article 14.1',                                                        'Article 14.1',             '01-Apr-25',  25, 'At Risk',     'Termination Penalty: DISCOM landed unit power cost. Payment within 45 days else 9% interest.','Legal',    '—',        'High'],
      ['MS-10','All Plants','Force Majeure',       'Claiming party gives written notice no later than 10 days of FM occurrence',                   'Clause 12.2',              'TBD',        40, 'In Progress', 'Non-claiming party can terminate if FM event continues for 12 months',                    'Legal',         '—',        'High'],
      ['MS-11','All Plants','Business Exigency',   'Captive user unable to fulfil its offtake obligation',                                         'Article 13',               'TBD',        20, 'At Risk',     'Captive user pays NPV of difference of current and new ACCSP or 12 months avg ACCSP',    'Legal',         '—',        'High'],
      ['MS-12','All Plants','Annual Compliance',   'Captive compliance — to be maintained at all times',                                           'Clause 6.6',               '30-Jun-26',  30, 'In Progress', 'RPO shortfall penalty if not filed on time',                                              'Regulatory Mgr','—',        'Medium'],
      ['MS-13','All Plants','MSG Baseline',        'Power producer shall supply 90% of 70% CUF, with 0.3% annual degradation',                    'Clause 6.2',               '—',          100,'Completed',   'Upon failure — compensate captive user for shortfall at DISCOM landed tariff',             'O&M',           '—',        'Low'],
      ['MS-14','All Plants','Termination',         'Based on minimum guaranteed savings (Grid tariff < Landed power delivery charges)',             '—',                        'TBD',        60, 'In Progress', 'User can terminate without penalty',                                                       'Legal',         '—',        'Medium'],
      ['MS-15','All Plants','Regulatory — OA',     'RRERC OA first annual filing + RVPN wheeling agreement renewal',                              'RRERC OA Regs',            '01-Feb-26',  0,  'Upcoming',    'OA surcharge revision risk; wheeling disruption if renewal late',                          'Regulatory Mgr','—',        'Low'],
      ['MS-16','All Plants','Alternate Source',    'Third party costs, charges, expenses by producer',                                             '—',                        'TBD',        0,  'Upcoming',    'If fails — shortfall compensation by Producer',                                           'Legal',         '—',        'Medium'],
      ['MS-17','All Plants','Disputed Bill',       'After 45 days of dispute intimation with no amicable settlement — sole Arbitrator',            'Article 15.2',             '—',          0,  'Upcoming',    'Appointment of Sole Arbitrator',                                                          'Legal',         '—',        'Medium'],
      ['MS-18','All Plants','Non-consumption',     'After COD, user does not consume power for continuous 3 months in FY',                         'Article 14.2',             'TBD',        30, 'In Progress', 'Captive user to pay compensation',                                                         'Legal',         '—',        'High']
    ].forEach(([msId,plantId,...rest]) => ins.run(pid, msId, plantId, ...rest));
  });

  // ── 7. ALERTS ────────────────────────────────────────────
  run('alerts', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO alerts
        (projectId, alertId, priority, plantId, plant, category, description,
         psaRef, raised, actionRequired, owner, targetDate, escalation, status, impact, linkedMS)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const pid = 'sanathan';
    [
      ['AL-01','Critical','PLT-01','SRI33PL','PSM',             'Unconditional and Irrevocable BG for 12 months equal to 2 months avg billing — provided 1 month before COD of 1st milestone of partial commissioning.','Clause 8.7',    '29 Apr 2026','Attain BG 1 month before COD, planned solar SCOD is 30th June 2026','Finance + Regulatory','30 May 2026','L2','Open','Credit Risk',     'MS-07'],
      ['AL-02','Critical','PLT-01','SRI33PL','Equity Infusion', 'First tranche (15%) of subscription amount to be infused by captive user.',                                                                              'Article 3 (SHA)','—',          'AOA & MOA permit issuance of captive user share',                   'Finance',             '15 Apr 2026','L2','Open','Compliance Risk', 'MS-05'],
      ['AL-03','Critical','PLT-01','SRI33PL','Equity Infusion', 'Second (25%) and third (25%) tranche before COD of 21 MWp Fatehgarh Solar or 30 Aug 2026.',                                                             'Article 3 (SHA)','—',          'SPV compliance certificate confirming fulfilment of obligation',      'Finance',             '30 Aug 2026','L2','Open','Compliance Risk', 'MS-05'],
      ['AL-04','High',    'All',   'SRI33PL','Operation / COD', 'Project developer to share details of construction monthly until COD.',                                                                                   'Article 5.1.1', 'Monthly',    'Share monthly construction update',                                  'Project Team',        'Until COD',  'L1','Open','Operational Risk','MS-03'],
      ['AL-05','High',    'All',   'SRI33PL','COD Risk',        'Developer to pay Delay Compensation if COD delayed, within 7 days of receipt of intimation from Captive User.',                                          'Article 4.1',   '—',          'Per-day payment until Long Stop Date',                               'Developer',           '—',          'L2','Open','Financial Risk',  'MS-04'],
      ['AL-06','Low',     'All',   'SRI33PL','Audit',           'Each Quarter — Provide unaudited FS ≤2 months; audited FS ≤6 months.',                                                                                   'Article 6.5 (SHA)','Quarterly','Mutual agree to extend timelines in case of delay',                   'Finance',             'Quarterly',  'L1','Open','Compliance Risk', '—']
    ].forEach(([alertId,...rest]) => ins.run(pid, alertId, ...rest));
  });

  // ── 8. POST COD ──────────────────────────────────────────
  run('postcod', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO postcod
        (projectId, pcId, plantId, state, category, description, psaRef,
         plannedDate, actualRevised, pctComplete, status, consequence,
         responsible, nextAction, dueBy, priority)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const pid = 'sanathan';
    [
      ['PC-01','All Plants','Rajasthan, Karnataka','Pre-COD Regulatory',    'CERC Captive Plant registration — must be filed 6 months before COD',           'CERC CPP Rules 2005 Rule 3','—',         'TBD',      0,  'Upcoming',    'COD cannot proceed without CERC captive registration',                                         'Legal Team',    '—',              '30-Jun-26','High'],
      ['PC-02','All Plants','Rajasthan, Karnataka','Pre-COD Regulatory',    'PERC Open Access pre-approval + PPSCL wheeling agreement before COD',           'PERC OA Regs; PSA §9',     '—',         'TBD',      0,  'Upcoming',    'No OA = wheeling not permitted from COD; surcharge liability',                                  'Regulatory Mgr','Initiate PERC OA application 4 months before COD','30-Jun-26','High'],
      ['PC-03','All Plants','Rajasthan, Karnataka','Target COD',             'Scheduled COD — 30-Jun-26 (solar), 31-Dec-26 (Wind)',                           'Article 4',                '30-Jun-26', 'At Risk',  0,  'At Risk',     'Grace period of 6 months, otherwise producer to compensate for shortfall (clause 6.1)',          'Developer / PMC','Critical path convergence: EPC + PGCIL + CERC reg','31-Dec-26','Critical'],
      ['PC-04','All Plants','Rajasthan, Karnataka','Invoice Payment',        'Monthly Invoice with payment within 15 days of invoice',                        'Clause 8.1',               '—',         'TBD',      50, 'In Progress', '12 months Bank Guarantee with 1 month claim period',                                            'CFO + Legal',   'Formal demand notice; BG partial invocation if unpaid','—','High'],
      ['PC-05','PLT-01',    'Rajasthan',           'Payment Security',       'Unconditional and Irrevocable BG for 12 months equal to 2 months avg billing — 1 month before COD','Clause 8.7','31-May-26','—',  0,  'Upcoming',    'COD blocked without BG',                                                                        'Finance',       'Arrange BG from bank','31-May-26','High'],
      ['PC-06','All Plants','Rajasthan, Karnataka','Termination',            'Captive user default — Article 14.2',                                           'Article 14.2',             '—',         '—',        0,  'Upcoming',    'Termination Penalty: Energy (CC) × ACCSP. Payment within 45 days else 9% interest.',             'Legal',         'Monitor',        '—',        'Medium']
    ].forEach(([pcId,plantId,state,...rest]) => ins.run(pid, pcId, plantId, state, ...rest));
  });

  // ── 9. VOLUME SUMMARY ────────────────────────────────────
  run('volume_summary', () => {
    db.prepare(`
      INSERT OR REPLACE INTO volume_summary
        (projectId, annualMSG, monthsElapsed, ytdActual, msgStatus, annualRevBudget, lifetimeRev)
      VALUES (?,?,?,?,?,?,?)
    `).run('sanathan', 177, 0, 'Pre-COD', 'Pre-COD', 67, 1630);
  });

  // ── 10. VOLUME: 25-YEAR OFFTAKE ──────────────────────────
  run('volume_offtake', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO volume_offtake (projectId, year, expectedEnergy, minOfftake)
      VALUES (?,?,?,?)
    `);
    const data = [
      [1,196.22,176.6],[2,195.63,176.1],[3,195.04,175.5],[4,194.46,175.0],[5,193.88,174.5],
      [6,193.29,174.0],[7,192.71,173.4],[8,192.14,172.9],[9,191.56,172.4],[10,190.99,171.9],
      [11,190.41,171.4],[12,189.84,170.9],[13,189.27,170.3],[14,188.70,169.8],[15,188.14,169.3],
      [16,187.57,168.8],[17,187.01,168.3],[18,186.45,167.8],[19,185.89,167.3],[20,185.33,166.8],
      [21,184.78,166.3],[22,184.22,165.8],[23,183.67,165.3],[24,183.12,164.8],[25,182.57,164.3]
    ];
    data.forEach(([year, ee, mo]) => ins.run('sanathan', year, ee, mo));
  });

  // ── 11. VOLUME: MONTHLY GENERATION ───────────────────────
  run('volume_generation', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO volume_generation
        (projectId, plant, annualGuarantee, jul,  aug,  sep,  oct,  nov,  dec,  jan,  feb,  mar)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    [
      ['PLT-01 Phase 1 — Solar Fatehgarh', 32.38, 3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00],
      ['PLT-01 MSG Floor',                 32.38, 2.70,2.70,2.70,2.70,2.70,2.70,2.70,2.70,2.70],
      ['PLT-02 Phase 2 — Solar Bikaner',   46.12, null,null,null,null,null,null,4.27,4.27,4.27],
      ['PLT-02 MSG Floor',                 46.12, null,null,null,null,null,null,3.84,3.84,3.84]
    ].forEach(([plant, ag, ...months]) => ins.run('sanathan', plant, ag, ...months));
  });

  // ── 12. VOLUME: LD CALCULATION ───────────────────────────
  run('volume_ld', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO volume_ld
        (projectId, plant, state, annualMSG, ytdActual, ytdShortfall,
         ldRate, grossLD, netLD, psaClause, threshold, ldStatus, remedyDeadline)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    [
      ['PLT-01 Solar','Rajasthan',176.6, 0,0,3.10,0,0,'§10.4',95,'Pre-COD','TBD'],
      ['PLT-02 Solar','Rajasthan', 46.12,0,0,3.10,0,0,'§10.4',95,'Pre-COD','TBD'],
      ['PLT-03 Wind', 'Karnataka', 98.2, 0,0,3.81,0,0,'§10.4',95,'Pre-COD','TBD']
    ].forEach(([plant, state, ...rest]) => ins.run('sanathan', plant, state, ...rest));
  });

  // ── 13. VOLUME: PSA TERM PROGRESS ────────────────────────
  run('volume_psa_term', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO volume_psa_term
        (projectId, plant, cod, tariff, yearsElapsed, yearsRemaining, termPct,
         cumMSGCommitted, cumActualGen, annualRevBudget, lifetimeRev, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    [
      ['PLT-01 Solar','30 Jun 2026', 3.1,  0,25,0,0,0,0,0, 'Pre-COD — MSG clock starts from COD 30 June 2026'],
      ['PLT-02 Solar','31 Dec 2026', 3.1,  0,25,0,0,0,0,0, 'Pre-COD'],
      ['PLT-03 Wind', '30 Jun 2027', 3.81, 0,25,0,0,0,0,0, 'Pre-COD']
    ].forEach(([plant,...rest]) => ins.run('sanathan', plant, ...rest));
  });

  // ── 14. REVENUE: MONTHLY ─────────────────────────────────
  run('revenue_monthly', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO revenue_monthly
        (projectId, plant, state, tariff, msgRevPerMonth,
         jul,  aug,  sep,  oct,  nov,  dec,  jan,  feb,  mar,
         ytdRevenue, ytdBudget, variance, billed, collected, outstanding)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    [
      ['PLT-01 (Phase 1)','Rajasthan',3.1, 0.84, 0.84,0.84,0.84,0.84,0.84,0.84,0.84,0.84,0.84, 7.53,7.53,0,7.53,0,0],
      ['PLT-02 (Phase 2)','Rajasthan',3.1, 1.19, 0,   0,   0,   0,   0,   0,   1.19,1.19,1.19, 3.57,3.57,0,3.57,0,0]
    ].forEach(([plant,...rest]) => ins.run('sanathan', plant, ...rest));
  });

  // ── 15. REVENUE: WATERFALL ───────────────────────────────
  run('revenue_waterfall', () => {
    db.prepare('DELETE FROM revenue_waterfall WHERE projectId = ?').run('sanathan');
    const ins = db.prepare(`
      INSERT INTO revenue_waterfall (projectId, stage, value, sortOrder) VALUES (?,?,?,?)
    `);
    [
      ['Annual Budget',     67.3,  1],
      ['YTD Actual',        60,    2],
      ['Volume Variance',   -7.3,  3],
      ['MSG Billing Floor', 56,    4],
      ['Net Billable',      56,    5],
      ['Overdue Deductions',-2,    6],
      ['Net Realised',      54,    7]
    ].forEach(([stage, value, sortOrder]) => ins.run('sanathan', stage, value, sortOrder));
  });

  // ── 16. REVENUE: 10-YEAR PROJECTION ─────────────────────
  run('revenue_projection', () => {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO revenue_projection (projectId, fy, plt01, plt02, plt03, total)
      VALUES (?,?,?,?,?,?)
    `);
    [
      ['FY2025',64.4,41.88,106.02,212.3],['FY2026',64.4,41.88,106.02,212.3],
      ['FY2027',64.4,41.88,106.02,212.3],['FY2028',64.4,41.88,106.02,212.3],
      ['FY2029',64.4,41.88,106.02,212.3],['FY2030',64.4,41.88,106.02,212.3],
      ['FY2031',64.4,41.88,106.02,212.3],['FY2032',64.4,41.88,106.02,212.3],
      ['FY2033',64.4,41.88,106.02,212.3],['FY2034',64.4,41.88,106.02,212.3]
    ].forEach(([fy,...rest]) => ins.run('sanathan', fy, ...rest));
  });

});

// ── RUN ─────────────────────────────────────────────────────
try {
  migrate();
  console.log('\n' + '═'.repeat(45));
  console.log('✅  Migration complete — database ready');
  console.log('   Run: node server/index.js');
  console.log('═'.repeat(45) + '\n');
} catch (err) {
  console.error('\n❌  Migration failed:', err.message);
  process.exit(1);
}
