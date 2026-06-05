// ============================================
// SSWT CSV 캘리브레이션 후처리
// ============================================

let processedData = null;
const GAMMA = 1.4;
const ZERO_FRAMES = 10;

const CHANNEL_DEFS = {
    1:  { signal: '4-20mA', range: 20,   calibrate: true,  label: '노즐벽면1', a: 1.250272156, b: -4.999723431 },
    2:  { signal: '4-20mA', range: 20,   calibrate: true,  label: '노즐벽면2', a: 1.250116197, b: -4.997227308 },
    3:  { signal: '4-20mA', range: 10,   calibrate: true,  label: '노즐벽면3', a: 0.625058544, b: -2.503723645 },
    4:  { signal: '4-20mA', range: 2,    calibrate: true,  label: '노즐벽면4', a: 0.1250195,   b: -0.500108983 },
    5:  { signal: '4-20mA', range: 2,    calibrate: true,  label: '노즐벽면5', a: 0.125039058, b: -0.50059373 },
    6:  { signal: '4-20mA', range: 2,    calibrate: true,  label: '노즐벽면6', a: 0.125015603, b: -0.500437262 },
    7:  { signal: '4-20mA', range: 2,    calibrate: true,  label: '노즐벽면7', a: 0.124999975, b: -0.500416366 },
    8:  { signal: '4-20mA', range: 2,    calibrate: true,  label: '노즐벽면8', a: 0.124992139, b: -0.499884839 },
    9:  { signal: '4-20mA', range: 2,    calibrate: true,  label: '노즐벽면9', a: 0.125011683, b: -0.500181869 },
    10: { signal: '4-20mA', range: 20,   calibrate: false, label: 'Ch10 (P0)' },
    11: { signal: '4-20mA', range: 24.5, calibrate: false, label: 'Ch11 (탱크)' },
    12: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토1', a: 1.00522699,  b: -0.052103314 },
    13: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토2', a: 1.004822969, b: -0.053254709 },
    14: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토3', a: 1.004923962, b: -0.052087734 },
    15: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토4', a: 1.005378581, b: -0.054540815 },
    16: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토5', a: 1.00457069,  b: -0.049809429 }
};

const WALL_CHS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PITOT_CHS = [12, 13, 14, 15, 16];

const GRAPH_COLORS = [
    '#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7',
    '#79c0ff', '#56d364', '#e3b341', '#ff7b72', '#bc8cff',
    '#ffa657', '#7ee787', '#ffa198', '#d2a8ff', '#ffd33d', '#6e7681'
];

function bargToMa(barg, rangeMax) { return (barg / rangeMax) * 16 + 4; }
function bargToV(barg, rangeMax) { return (barg / rangeMax) * 10; }

function calibrateSingle(chNum, bargRaw) {
    const cfg = CHANNEL_DEFS[chNum];
    if (!cfg || !Number.isFinite(bargRaw)) return bargRaw;
    if (cfg.signal === '4-20mA') {
        if (!cfg.calibrate) return bargRaw;
        return cfg.a * bargToMa(bargRaw, cfg.range) + cfg.b;
    }
    return cfg.a * bargToV(bargRaw, cfg.range) + cfg.b;
}

function parseTimeToSeconds(timeStr) {
    const parts = String(timeStr).trim().split(':');
    if (parts.length < 3) return 0;
    return (parseInt(parts[0], 10) || 0) * 3600
         + (parseInt(parts[1], 10) || 0) * 60
         + (parseFloat(parts[2]) || 0);
}

function getAtmPressureBar() {
    const hpa = currentExperiment?.before?.windTunnel?.airPressure
           ?? parseFloat(document.getElementById('proc-air-pressure')?.value)
           ?? 1013.25;
    return hpa / 1000;
}

function meanFirstN(arr, n) {
    const slice = arr.slice(0, Math.min(n, arr.length)).filter(Number.isFinite);
    if (slice.length === 0) return 0;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// 등엔트로피: P/P0 = (1 + (γ-1)/2 M²)^(-γ/(γ-1))
function isentropicPressureRatio(M, gamma = GAMMA) {
    if (M < 0) return NaN;
    return Math.pow(1 + (gamma - 1) / 2 * M * M, -gamma / (gamma - 1));
}

// 초음속 피토: P02/P1 (Rayleigh-Pitot)
function pitotToFreestreamStaticRatio(M, gamma = GAMMA) {
    if (M <= 1) {
        return Math.pow(1 + (gamma - 1) / 2 * M * M, gamma / (gamma - 1));
    }
    const g = gamma;
    const gp1 = g + 1;
    const gm1 = g - 1;
    const denom = 2 * g * M * M - gm1;
    const term1 = gp1 * M * M / (2 + gm1 * M * M);
    const term2 = Math.pow((gp1 * gp1 * M * M * M * M) / (4 * g * M * M - 2 * gm1) + gm1 / gp1, g / (2 * gm1));
    const term3 = Math.pow((gp1 + gm1 * gm1 * M * M * M * M / (4 * g * M * M - 2 * gm1)) / denom, 1 / gm1);
    return term1 * term2 * term3;
}

// P_pitot / P0_reservoir = (P02/P1) × (P1/P0)
function reservoirToPitotRatio(M, gamma = GAMMA) {
    return pitotToFreestreamStaticRatio(M, gamma) * isentropicPressureRatio(M, gamma);
}

function machFromWallRatio(ratio, gamma = GAMMA) {
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return NaN;
    const inner = Math.pow(ratio, -(gamma - 1) / gamma) - 1;
    if (inner < 0) return NaN;
    return Math.sqrt(2 / (gamma - 1) * inner);
}

function machFromPitotRatio(ratio, gamma = GAMMA) {
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) return NaN;
    let lo = 1.001, hi = 15;
    const f = M => reservoirToPitotRatio(M, gamma) - ratio;
    if (f(lo) < 0) return NaN;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

function buildProcessedData(timeSec, rawChannels, fileName) {
    const pAtm = getAtmPressureBar();
    const calibrated = {};
    const offsets = {};

    for (let ch = 1; ch <= 16; ch++) {
        if (!rawChannels[ch]) continue;
        calibrated[ch] = rawChannels[ch].map(v => calibrateSingle(ch, v));
    }

    for (let ch = 1; ch <= 16; ch++) {
        if (ch === 11 || !calibrated[ch]) continue;
        offsets[ch] = meanFirstN(calibrated[ch], ZERO_FRAMES);
    }

    const staticP = {};
    for (let ch = 1; ch <= 16; ch++) {
        if (!calibrated[ch]) continue;
        if (ch === 11) {
            staticP[ch] = calibrated[ch].map(v => v + pAtm);
        } else {
            const off = offsets[ch] ?? 0;
            staticP[ch] = calibrated[ch].map(v => (v - off) + pAtm);
        }
    }

    const p0 = staticP[10];
    const ratioWall = {};
    const ratioPitot = {};
    const machWall = {};
    const machPitot = {};

    if (p0) {
        WALL_CHS.forEach(ch => {
            if (!staticP[ch]) return;
            ratioWall[ch] = staticP[ch].map((p, i) => {
                const denom = p0[i];
                return (Number.isFinite(denom) && denom > 0) ? p / denom : NaN;
            });
            machWall[ch] = ratioWall[ch].map(r => machFromWallRatio(r));
        });
        PITOT_CHS.forEach(ch => {
            if (!staticP[ch]) return;
            ratioPitot[ch] = staticP[ch].map((p, i) => {
                const denom = p0[i];
                return (Number.isFinite(denom) && denom > 0) ? p / denom : NaN;
            });
            machPitot[ch] = ratioPitot[ch].map(r => machFromPitotRatio(r));
        });
    }

    return {
        timeSec,
        fileName,
        numSamples: timeSec.length,
        pAtmBar: pAtm,
        offsets,
        staticP,
        ratioWall,
        ratioPitot,
        machWall,
        machPitot
    };
}

function parseCsvText(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV 데이터가 비어 있습니다.');

    const headers = lines[0].split(',').map(h => h.trim());
    const timeIdx = headers.findIndex(h => /^time$/i.test(h));
    if (timeIdx < 0) throw new Error('Time 컬럼을 찾을 수 없습니다.');

    const chIndices = {};
    for (let ch = 1; ch <= 16; ch++) {
        const idx = headers.findIndex(h => new RegExp(`^Ch${ch}\\s*\\[barg\\]$`, 'i').test(h));
        if (idx >= 0) chIndices[ch] = idx;
    }
    if (Object.keys(chIndices).length === 0) {
        throw new Error('Ch1~Ch16 [barg] 컬럼을 찾을 수 없습니다.');
    }

    const timeAbs = [];
    const raw = {};
    for (let ch = 1; ch <= 16; ch++) raw[ch] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 2) continue;
        timeAbs.push(parseTimeToSeconds(cols[timeIdx]));
        for (const [ch, idx] of Object.entries(chIndices)) {
            raw[ch].push(parseFloat(cols[idx]));
        }
    }

    const t0 = timeAbs[0] ?? 0;
    const timeSec = timeAbs.map(t => t - t0);
    return buildProcessedData(timeSec, raw, null);
}

function updateProcessingInfo() {
    const el = document.getElementById('proc-info-text');
    if (!el || !processedData) return;
    const hpa = processedData.pAtmBar * 1000;
    el.textContent = `대기압: ${hpa.toFixed(1)} hPa (${processedData.pAtmBar.toFixed(4)} bar) · Ch11 제외 첫 ${ZERO_FRAMES}프레임 평균 0점 보정 적용`;
}

async function handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.getElementById('csv-upload-status');
    status.textContent = '⏳ 로딩 중...';

    try {
        if (!currentExperiment?.before?.windTunnel?.airPressure) {
            console.warn('실험 전 air pressure 미입력 — 기본값 1013.25 hPa 사용');
        }
        processedData = parseCsvText(await file.text());
        processedData.fileName = file.name;

        status.textContent = `✅ ${file.name} (${processedData.numSamples}샘플)`;
        document.getElementById('processing-results').style.display = 'block';
        updateProcessingInfo();
        drawAllGraphs();
    } catch (e) {
        console.error(e);
        status.textContent = '❌ ' + e.message;
        processedData = null;
    }
}

function drawMultiChannelGraph(canvasId, title, yLabel, channelData, chList, lineWidthFn) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !processedData) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const pad = { top: 36, right: 20, bottom: 44, left: 62 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, W, H);

    const { timeSec } = processedData;
    if (!timeSec.length) return;

    const tMin = timeSec[0], tMax = timeSec[timeSec.length - 1];
    let yMin = Infinity, yMax = -Infinity;

    chList.forEach(ch => {
        const data = channelData[ch];
        if (!data) return;
        data.forEach(v => {
            if (Number.isFinite(v)) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v); }
        });
    });
    if (!Number.isFinite(yMin)) return;
    const yPad = (yMax - yMin) * 0.08 || 0.1;
    yMin -= yPad; yMax += yPad;

    const toX = t => pad.left + ((t - tMin) / (tMax - tMin || 1)) * plotW;
    const toY = v => pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = pad.top + (plotH / 5) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    }

    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, pad.left, 22);

    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time [s]', pad.left + plotW / 2, H - 8);
    ctx.save();
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.font = '10px sans-serif';
    for (let i = 0; i <= 5; i++) {
        const v = yMin + (yMax - yMin) * (1 - i / 5);
        ctx.fillText(v.toFixed(3), pad.left - 6, pad.top + (plotH / 5) * i + 4);
    }

    let lx = pad.left + 4, ly = pad.top + 8;
    chList.forEach(ch => {
        const data = channelData[ch];
        if (!data) return;
        const color = GRAPH_COLORS[(ch - 1) % GRAPH_COLORS.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidthFn ? lineWidthFn(ch) : 1.3;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < data.length; i++) {
            if (!Number.isFinite(data[i])) continue;
            const x = toX(timeSec[i]), y = toY(data[i]);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.fillRect(lx, ly, 10, 3);
        ctx.fillStyle = '#ccc';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Ch${ch}`, lx + 13, ly + 3);
        ly += 12;
        if (ly > pad.top + plotH - 16) { ly = pad.top + 8; lx += 55; }
    });
}

function drawAllGraphs() {
    if (!processedData) return;
    const { staticP, ratioWall, ratioPitot, machWall, machPitot } = processedData;

    const staticChs = Object.keys(staticP).map(Number).sort((a, b) => a - b);
    drawMultiChannelGraph('graph-static', 'Static Pressure (absolute)', 'P [bar]',
        staticP, staticChs, ch => ch === 11 ? 2.5 : 1.2);

    drawMultiChannelGraph('graph-ratio-wall', 'Pressure Ratio — 노즐벽면 / Ch10', 'P / P₀',
        ratioWall, WALL_CHS);

    drawMultiChannelGraph('graph-ratio-pitot', 'Pressure Ratio — 피토 / Ch10', 'P_pitot / P₀',
        ratioPitot, PITOT_CHS);

    drawMultiChannelGraph('graph-mach-wall', 'Mach Number — 노즐벽면 (등엔트로피)', 'M',
        machWall, WALL_CHS);

    drawMultiChannelGraph('graph-mach-pitot', 'Mach Number — 피토 (NS 역산)', 'M',
        machPitot, PITOT_CHS);
}

function exportCalibratedExcel() {
    if (!processedData) { alert('먼저 CSV 파일을 업로드하세요.'); return; }

    const { timeSec, staticP, ratioWall, ratioPitot, machWall, machPitot, fileName } = processedData;
    const wb = XLSX.utils.book_new();

    const makeSheet = (name, chMap, unit) => {
        const chs = Object.keys(chMap).map(Number).sort((a, b) => a - b);
        const headers = ['Time [s]', ...chs.map(ch => `Ch${ch} ${unit} (${CHANNEL_DEFS[ch].label})`)];
        const rows = [headers];
        for (let i = 0; i < timeSec.length; i++) {
            rows.push([timeSec[i], ...chs.map(ch => chMap[ch]?.[i] ?? '')]);
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    };

    makeSheet('Static_P_bar', staticP, '[bar]');
    makeSheet('Ratio_Wall', ratioWall, 'P/P0');
    makeSheet('Ratio_Pitot', ratioPitot, 'P/P0');
    makeSheet('Mach_Wall', machWall, 'M');
    makeSheet('Mach_Pitot', machPitot, 'M');

    const base = (fileName || 'data').replace(/\.csv$/i, '');
    XLSX.writeFile(wb, `${base}_processed.xlsx`);
}

function exportCalibratedCsv() {
    if (!processedData) { alert('먼저 CSV 파일을 업로드하세요.'); return; }
    exportCalibratedExcel();
}

function drawCalibratedGraph() { drawAllGraphs(); }
