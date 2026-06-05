// ============================================
// SSWT 실험 목록 엑셀 입출력 (SSWT explist.xlsx 형식)
// ============================================

const EXCEL_HEADERS = [
    'exp#', 'name', 'date', 'test model', 'Objective', 'Mach #',
    'air pressure(hpa)', 'air temperature(C) ', 'air humidity(%)',
    'tank pressure(bar)', 'control valve',
    'Schlieren method', 'Schlieren target', 'camera',
    'FPS(Hz)', 'W(px)', 'H(px)', 'lens focal length(mm)',
    'Expose time(us)', 'Expose index',
    'test time length(s)', 'p0_avg[bar]', 'T0_avg[K]',
    'Stage 1 p (Pa)', 'Stage 1 T (K)', 'Stage 1 rho (kg/m**3)',
    'Stage 1 u (J/kg)', 'Stage 1 h (J/kg)', 'Stage 1 R (J/(kg.K))',
    'Stage 1 gam', 'Stage 1 Cp (J/(kg.K))', 'Stage 1 a (m/s)',
    'Stage 1 s (J/(kg.K))', 'Stage 1 V (m/s)', 'Stage 1 M',
    'unit Re1(/m)', 'h_tot1'
];

function experimentToRow(exp) {
    const b = exp.before || {};
    const info = b.expInfo || {};
    const wt = b.windTunnel || {};
    const vis = b.visualization || {};
    const cam = b.camera || {};
    const after = exp.after || {};
    const s1 = exp.calculation?.stage1 || {};

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
        cam.exposeTime ?? '',
        cam.exposeIndex ?? '',
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

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(v => v === '' || v == null)) continue;

            const get = (name) => {
                const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
                return idx >= 0 ? row[idx] : '';
            };

            const exp = createExperimentData();
            exp.expNumber = parseInt(get('exp#'), 10) || (await getNextExpNumber());
            exp.before.expInfo = {
                name: get('name'),
                date: get('date'),
                testModel: get('test model'),
                objective: get('Objective'),
                targetMach: parseFloat(get('Mach #')) || null
            };
            exp.before.windTunnel = {
                airPressure: parseFloat(get('air pressure(hpa)')) || null,
                airTemp: parseFloat(get('air temperature(C)')) || null,
                airHumidity: parseFloat(get('air humidity(%)')) || null,
                tankPressure: parseFloat(get('tank pressure(bar)')) || null,
                controlValve: get('control valve')
            };
            exp.before.visualization = {
                method: get('Schlieren method'),
                target: get('Schlieren target')
            };
            exp.before.camera = {
                model: get('camera'),
                fps: parseFloat(get('FPS(Hz)')) || null,
                width: parseInt(get('W(px)'), 10) || null,
                height: parseInt(get('H(px)'), 10) || null,
                lensFocal: get('lens focal length(mm)'),
                exposeTime: parseFloat(get('Expose time(us)')) || null,
                exposeIndex: parseFloat(get('Expose index')) || null
            };
            exp.status = 'before_complete';
            await saveExperiment(exp);
            imported++;
        }

        alert(`✅ ${imported}개 실험을 가져왔습니다.`);
        event.target.value = '';
    } catch (e) {
        console.error('Import failed:', e);
        alert('엑셀 불러오기 실패: ' + e.message);
    }
}
