// ============================================
// SSWT 실험 목록 엑셀 입출력 (SSWT explist.xlsx 형식)
// ============================================

const EXCEL_HEADERS = [
    'exp#', 'name', 'date', 'test model', 'Objective', 'Mach #',
    'air pressure(hpa)', 'air temperature(C)', 'air humidity(%)',
    'tank pressure(bar)', 'control valve',
    'Schlieren method', 'Schlieren target', 'camera',
    'FPS(Hz)', 'W(px)', 'H(px)', 'lens focal length(mm)',
    'exposure time(us)', 'exposure index',
    'test time length(s)', 'p0_avg[bar]', 'T0_avg[K]',
    'Stage 1 p (Pa)', 'Stage 1 T (K)', 'Stage 1 rho (kg/m**3)',
    'Stage 1 u (J/kg)', 'Stage 1 h (J/kg)', 'Stage 1 R (J/(kg.K))',
    'Stage 1 gam', 'Stage 1 Cp (J/(kg.K))', 'Stage 1 a (m/s)',
    'Stage 1 s (J/(kg.K))', 'Stage 1 V (m/s)', 'Stage 1 M',
    'unit Re1(/m)', 'h_tot1'
];

const EXCEL_HEADER_ALIASES = {
    'air pressure(hpa)': ['air pressure(hpa)', 'air pressure [hpa]'],
    'air temperature(C)': ['air temperature(C)', 'air temperature(C) ', 'air temperature [°C]', 'air temperature [C]'],
    'air humidity(%)': ['air humidity(%)', 'air humidity [%]'],
    'tank pressure(bar)': ['tank pressure(bar)', 'tank pressure [bar]'],
    'exposure time(us)': ['exposure time(us)', 'Expose time(us)'],
    'exposure index': ['exposure index', 'Expose index']
};

function normalizeHeaderName(name) {
    return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

function findHeaderIndex(headers, canonicalName) {
    const aliases = EXCEL_HEADER_ALIASES[canonicalName] || [canonicalName];
    for (const alias of aliases) {
        const target = normalizeHeaderName(alias);
        const idx = headers.findIndex(h => normalizeHeaderName(h) === target);
        if (idx >= 0) return idx;
    }
    return -1;
}

function makeRowGetter(headers, row) {
    return (canonicalName) => {
        const idx = findHeaderIndex(headers, canonicalName);
        return idx >= 0 ? row[idx] : '';
    };
}

function parseExcelDate(val) {
    if (val === '' || val == null) return '';
    if (typeof val === 'number') {
        const s = String(Math.round(val)).padStart(6, '0');
        if (/^\d{6}$/.test(s)) {
            return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
        }
        return String(val);
    }
    return String(val).trim();
}

function readCameraExposure(get) {
    return {
        exposureTime: parseFloat(get('exposure time(us)')) || null,
        exposureIndex: parseFloat(get('exposure index')) || null
    };
}

function experimentToRow(exp) {
    const b = exp.before || {};
    const info = b.expInfo || {};
    const wt = b.windTunnel || {};
    const vis = b.visualization || {};
    const cam = b.camera || {};
    const after = exp.after || {};
    const s1 = exp.calculation?.stage1 || {};
    const exposureTime = cam.exposureTime ?? cam.exposeTime ?? '';
    const exposureIndex = cam.exposureIndex ?? cam.exposeIndex ?? '';

    return [
        exp.expNumber ?? '',
        info.name ?? '',
        info.date ?? '',
        info.testModel ?? '',
        info.objective ?? '',
        info.targetMach ?? '',
        wt.airPressure ?? '',
        wt.airTemp ?? '',
        wt.airHumidity ?? '',
        wt.tankPressure ?? '',
        wt.controlValve ?? '',
        vis.method ?? '',
        vis.target ?? '',
        cam.model ?? '',
        cam.fps ?? '',
        cam.width ?? '',
        cam.height ?? '',
        cam.lensFocal ?? '',
        exposureTime,
        exposureIndex,
        after.testTimeLength ?? '',
        after.p0_avg ?? '',
        after.T0_avg ?? '',
        s1.p ?? '', s1.T ?? '', s1.rho ?? '', s1.u ?? '', s1.h ?? '',
        s1.R ?? '', s1.gam ?? '', s1.Cp ?? '', s1.a ?? '', s1.s ?? '',
        s1.V ?? '', s1.M ?? '', s1.Re_unit ?? '', s1.h_tot1 ?? ''
    ];
}

async function exportToExcel() {
    try {
        const experiments = await loadAllExperiments();
        experiments.sort((a, b) => (a.expNumber || 0) - (b.expNumber || 0));

        const rows = [EXCEL_HEADERS];
        experiments.forEach(exp => rows.push(experimentToRow(exp)));

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        XLSX.writeFile(wb, `SSWT_explist_${date}.xlsx`);
    } catch (e) {
        console.error('Export failed:', e);
        alert('엑셀보내기 실패: ' + e.message);
    }
}

async function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length < 2) {
            alert('데이터 행이 없습니다.');
            return;
        }

        const headers = rows[0].map(h => String(h).trim());
        let imported = 0;
        let skippedDuplicates = 0;

        if (!confirm('기존 실험 데이터를 모두 삭제하고 엑셀 데이터로 대체합니다. 계속하시겠습니까?')) {
            event.target.value = '';
            return;
        }
        await clearAllExperiments();

        let nextAutoNumber = 1;
        const usedNumbers = new Set();

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(v => v === '' || v == null)) continue;

            const get = makeRowGetter(headers, row);

            const exp = createExperimentData();
            const parsed = parseInt(get('exp#'), 10);
            let expNumber;
            if (parsed && !usedNumbers.has(parsed)) {
                expNumber = parsed;
            } else {
                if (parsed && usedNumbers.has(parsed)) skippedDuplicates++;
                while (usedNumbers.has(nextAutoNumber)) nextAutoNumber++;
                expNumber = nextAutoNumber;
            }
            usedNumbers.add(expNumber);
            nextAutoNumber = Math.max(nextAutoNumber, expNumber + 1);
            exp.expNumber = expNumber;
            exp.before.expInfo = {
                name: String(get('name') ?? '').trim(),
                date: parseExcelDate(get('date')),
                testModel: String(get('test model') ?? '').trim(),
                objective: String(get('Objective') ?? '').trim(),
                targetMach: parseFloat(get('Mach #')) || null
            };
            exp.before.windTunnel = {
                airPressure: parseFloat(get('air pressure(hpa)')) || null,
                airTemp: parseFloat(get('air temperature(C)')) || null,
                airHumidity: parseFloat(get('air humidity(%)')) || null,
                tankPressure: parseFloat(get('tank pressure(bar)')) || null,
                controlValve: String(get('control valve') ?? '').trim()
            };
            exp.before.visualization = {
                method: String(get('Schlieren method') ?? '').trim(),
                target: String(get('Schlieren target') ?? '').trim()
            };
            exp.before.camera = {
                model: String(get('camera') ?? '').trim(),
                fps: parseFloat(get('FPS(Hz)')) || null,
                width: parseInt(get('W(px)'), 10) || null,
                height: parseInt(get('H(px)'), 10) || null,
                lensFocal: String(get('lens focal length(mm)') ?? '').trim(),
                ...readCameraExposure(get)
            };
            exp.status = 'before_complete';
            await saveExperiment(exp);
            imported++;
        }

        let msg = `✅ ${imported}개 실험을 가져왔습니다.`;
        if (skippedDuplicates > 0) {
            msg += `\n⚠️ 중복된 exp# ${skippedDuplicates}건은 새 번호로 자동 할당했습니다.`;
        }
        alert(msg);
        event.target.value = '';
        if (typeof showExperimentList === 'function') showExperimentList();
    } catch (e) {
        console.error('Import failed:', e);
        alert('엑셀 불러오기 실패: ' + e.message);
    }
}
