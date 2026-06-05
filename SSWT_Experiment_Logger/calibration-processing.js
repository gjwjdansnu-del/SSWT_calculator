// ============================================
// SSWT CSV 캘리브레이션 후처리
// barg → mA/V 역변환 → ax+b 재캘리브레이션
// ============================================

let calibratedData = null; // { timeSec[], channels: {1: number[], ...}, labels }

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
    10: { signal: '4-20mA', range: 20,   calibrate: false, label: 'Ch10' },
    11: { signal: '4-20mA', range: 24.5, calibrate: false, label: 'Ch11 (탱크)' },
    12: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토1', a: 1.00522699,  b: -0.052103314 },
    13: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토2', a: 1.004822969, b: -0.053254709 },
    14: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토3', a: 1.004923962, b: -0.052087734 },
    15: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토4', a: 1.005378581, b: -0.054540815 },
    16: { signal: '0-10V',  range: 10,   calibrate: true,  label: '피토5', a: 1.00457069,  b: -0.049809429 }
};

const GRAPH_COLORS = [
    '#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7',
    '#79c0ff', '#56d364', '#e3b341', '#ff7b72', '#bc8cff',
    '#ffa657', '#7ee787', '#ffa198', '#d2a8ff', '#ffd33d', '#6e7681'
];

function bargToMa(barg, rangeMax) {
    return (barg / rangeMax) * 16 + 4;
}

function bargToV(barg, rangeMax) {
    return (barg / rangeMax) * 10;
}

function calibrateSingle(chNum, bargRaw) {
    const cfg = CHANNEL_DEFS[chNum];
    if (!cfg || !Number.isFinite(bargRaw)) return bargRaw;

    if (cfg.signal === '4-20mA') {
        if (!cfg.calibrate) return bargRaw;
        const mA = bargToMa(bargRaw, cfg.range);
        return cfg.a * mA + cfg.b;
    }
    const V = bargToV(bargRaw, cfg.range);
    return cfg.a * V + cfg.b;
}

function parseTimeToSeconds(timeStr) {
    const parts = String(timeStr).trim().split(':');
    if (parts.length < 3) return 0;
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
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
        const t = parseTimeToSeconds(cols[timeIdx]);
        timeAbs.push(t);
        for (const [ch, idx] of Object.entries(chIndices)) {
            raw[ch].push(parseFloat(cols[idx]));
        }
    }

    const t0 = timeAbs[0] ?? 0;
    const timeSec = timeAbs.map(t => t - t0);

    const channels = {};
    for (let ch = 1; ch <= 16; ch++) {
        if (!raw[ch] || raw[ch].length === 0) continue;
        channels[ch] = raw[ch].map(v => calibrateSingle(ch, v));
    }

    return { timeSec, channels, fileName: null, numSamples: timeSec.length };
}

async function handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const status = document.getElementById('csv-upload-status');
    status.textContent = '⏳ 로딩 중...';

    try {
        const text = await file.text();
        calibratedData = parseCsvText(text);
        calibratedData.fileName = file.name;

        status.textContent = `✅ ${file.name} (${calibratedData.numSamples}샘플, ${Object.keys(calibratedData.channels).length}채널)`;
        document.getElementById('processing-results').style.display = 'block';
        drawCalibratedGraph();
    } catch (e) {
        console.error(e);
        status.textContent = '❌ ' + e.message;
        calibratedData = null;
    }
}

function drawCalibratedGraph() {
    const canvas = document.getElementById('calibrated-graph');
    if (!canvas || !calibratedData) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 30, right: 20, bottom: 50, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, W, H);

    const { timeSec, channels } = calibratedData;
    if (timeSec.length === 0) return;

    const tMin = timeSec[0];
    const tMax = timeSec[timeSec.length - 1];

    let yMin = Infinity, yMax = -Infinity;
    for (const ch of Object.keys(channels)) {
        for (const v of channels[ch]) {
            if (Number.isFinite(v)) {
                yMin = Math.min(yMin, v);
                yMax = Math.max(yMax, v);
            }
        }
    }
    if (!Number.isFinite(yMin)) return;
    const yPad = (yMax - yMin) * 0.05 || 0.1;
    yMin -= yPad;
    yMax += yPad;

    const toX = t => pad.left + ((t - tMin) / (tMax - tMin || 1)) * plotW;
    const toY = v => pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

    // grid
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = pad.top + (plotH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
    }

    // axes labels
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time [s]', pad.left + plotW / 2, H - 10);
    ctx.save();
    ctx.translate(15, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Pressure [barg]', 0, 0);
    ctx.restore();

    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const v = yMin + (yMax - yMin) * (1 - i / 5);
        const y = pad.top + (plotH / 5) * i;
        ctx.fillText(v.toFixed(2), pad.left - 8, y + 4);
    }

    // channels
    const chNums = Object.keys(channels).map(Number).sort((a, b) => a - b);
    chNums.forEach((ch, ci) => {
        const data = channels[ch];
        const color = GRAPH_COLORS[(ch - 1) % GRAPH_COLORS.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = ch === 11 ? 2.5 : 1.2;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < data.length; i++) {
            if (!Number.isFinite(data[i])) continue;
            const x = toX(timeSec[i]);
            const y = toY(data[i]);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });

    // legend
    let lx = pad.left + 5;
    let ly = pad.top + 5;
    chNums.forEach(ch => {
        const cfg = CHANNEL_DEFS[ch];
        const color = GRAPH_COLORS[(ch - 1) % GRAPH_COLORS.length];
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly, 12, 3);
        ctx.fillStyle = '#e6edf3';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Ch${ch} ${cfg.label}`, lx + 16, ly + 4);
        ly += 14;
        if (ly > pad.top + plotH - 20) { ly = pad.top + 5; lx += 120; }
    });
}

function exportCalibratedExcel() {
    if (!calibratedData) {
        alert('먼저 CSV 파일을 업로드하세요.');
        return;
    }

    const { timeSec, channels, fileName } = calibratedData;
    const headers = ['Time [s]'];
    const chNums = Object.keys(channels).map(Number).sort((a, b) => a - b);
    chNums.forEach(ch => {
        headers.push(`Ch${ch} [barg] (${CHANNEL_DEFS[ch].label})`);
    });

    const rows = [headers];
    for (let i = 0; i < timeSec.length; i++) {
        const row = [timeSec[i]];
        chNums.forEach(ch => row.push(channels[ch][i] ?? ''));
        rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calibrated');
    const base = (fileName || 'data').replace(/\.csv$/i, '');
    XLSX.writeFile(wb, `${base}_calibrated.xlsx`);
}

function exportCalibratedCsv() {
    if (!calibratedData) {
        alert('먼저 CSV 파일을 업로드하세요.');
        return;
    }

    const { timeSec, channels, fileName } = calibratedData;
    const chNums = Object.keys(channels).map(Number).sort((a, b) => a - b);
    const headers = ['Time [s]', ...chNums.map(ch => `Ch${ch} [barg]`)];

    const lines = [headers.join(',')];
    for (let i = 0; i < timeSec.length; i++) {
        const row = [timeSec[i].toFixed(3), ...chNums.map(ch => {
            const v = channels[ch][i];
            return Number.isFinite(v) ? v : '';
        })];
        lines.push(row.join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const base = (fileName || 'data').replace(/\.csv$/i, '');
    a.download = `${base}_calibrated.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}
