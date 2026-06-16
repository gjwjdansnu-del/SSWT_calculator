// ============================================
// SSWT 실험 로거 - 초음속 풍동 (Wind Tunnel)
// ============================================

let currentExperiment = null;
let currentExperimentId = null;

const STAGE_COLORS = {
    '시험 전': '#58a6ff',
    '압축': '#d29922',
    '최종 확인': '#a371f7',
    '시험': '#f85149',
    '종료': '#3fb950'
};

// 체크리스트 항목 사이에 삽입할 입력 블록 (beforeIndex: 해당 항목 직전에 표시)
const INLINE_INPUT_BLOCKS = [
    {
        beforeIndex: 13,
        title: '탱크 압력 기록',
        fields: [
            { id: 'tank-pressure', label: 'tank pressure [bar]', type: 'number', step: '0.1', placeholder: '예: 8.0' }
        ]
    },
    {
        beforeIndex: 14,
        title: '조절밸브 설정값 확인',
        fields: [
            { id: 'control-valve', label: 'control valve', type: 'text', placeholder: '예: 3.5' }
        ]
    }
];

document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await createNewExperiment();
    document.getElementById('exp-date').valueAsDate = new Date();
    renderSafetyChecklist();
    updateChecklistProgress();
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (tabContent) tabContent.classList.add('active');
}

async function createNewExperiment() {
    currentExperiment = createExperimentData();
    currentExperiment.expNumber = await getNextExpNumber();
    currentExperimentId = null;

    const last = await getLastExperiment();
    if (last) {
        currentExperiment.before.expInfo = { ...last.before.expInfo };
        currentExperiment.before.windTunnel = { ...last.before.windTunnel };
        currentExperiment.before.visualization = { ...last.before.visualization };
        currentExperiment.before.camera = { ...last.before.camera };
    }

    loadAllDataToUI();
    renderSafetyChecklist();
    updateChecklistProgress();
}

function mergeChecklistItems(existing) {
    const fresh = createDefaultSafetyChecklist();
    if (!existing?.items) return fresh;
    fresh.items.forEach(item => {
        const old = existing.items.find(o => o.label === item.label);
        if (old) item.checked = old.checked;
    });
    fresh.tankPressure = existing.tankPressure ?? null;
    fresh.controlValve = existing.controlValve ?? '';
    fresh.notes = existing.notes ?? '';
    fresh.completedAt = existing.completedAt ?? null;
    return fresh;
}

async function loadExperimentById(id) {
    currentExperiment = await loadExperiment(id);
    currentExperimentId = id;
    currentExperiment.safetyChecklist = mergeChecklistItems(currentExperiment.safetyChecklist);
    loadAllDataToUI();
    renderSafetyChecklist();
    updateChecklistProgress();
}

// ── 체크리스트 렌더링 ──────────────────────────────

function createInlineInputRow(block) {
    const tr = document.createElement('tr');
    tr.className = 'inline-input-row';
    const fieldsHtml = block.fields.map(f => `
        <div class="form-group inline-field">
            <label>${f.label}</label>
            <input type="${f.type}" id="${f.id}" step="${f.step || ''}" placeholder="${f.placeholder || ''}"
                   onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
        </div>
    `).join('');
    tr.innerHTML = `
        <td colspan="3">
            <div class="inline-input-block mid-check-block">
                <div class="inline-input-block-header">
                    <span class="inline-step-badge mid">입력</span>
                    <strong>${block.title}</strong>
                </div>
                <div class="inline-fields-row">${fieldsHtml}</div>
            </div>
        </td>
    `;
    return tr;
}

function createChecklistItemRow(item, idx) {
    const row = document.createElement('tr');
    row.className = 'checklist-item-row' + (item.checked ? ' checked' : '');
    row.dataset.index = idx;
    row.addEventListener('click', () => handleChecklistRowClick(idx));
    row.innerHTML = `
        <td class="check-cell">
            <span class="check-icon" aria-hidden="true">${item.checked ? '✓' : ''}</span>
        </td>
        <td class="item-cell">${item.label}</td>
        <td class="stage-badge-cell">
            <span class="stage-badge" style="background:${STAGE_COLORS[item.stage]}22;color:${STAGE_COLORS[item.stage]}">${item.stage}</span>
        </td>
    `;
    return row;
}

function renderSafetyChecklist() {
    const tbody = document.getElementById('checklist-tbody');
    if (!tbody || !currentExperiment) return;

    collectBeforeFromUI();

    const items = currentExperiment.safetyChecklist.items;
    tbody.innerHTML = '';

    let lastStage = '';
    items.forEach((item, idx) => {
        if (item.stage !== lastStage) {
            lastStage = item.stage;
            const divider = document.createElement('tr');
            divider.className = 'stage-divider-row';
            divider.innerHTML = `<td colspan="3" class="stage-divider" style="border-left-color:${STAGE_COLORS[item.stage] || '#58a6ff'}">${item.stage}</td>`;
            tbody.appendChild(divider);
        }

        INLINE_INPUT_BLOCKS.filter(b => b.beforeIndex === idx).forEach(block => {
            tbody.appendChild(createInlineInputRow(block));
        });

        tbody.appendChild(createChecklistItemRow(item, idx));
    });

    fillMidChecklistInputs();
}

function fillMidChecklistInputs() {
    if (!currentExperiment) return;
    const wt = currentExperiment.before.windTunnel;
    const tp = document.getElementById('tank-pressure');
    const cv = document.getElementById('control-valve');
    if (tp) tp.value = wt.tankPressure ?? '';
    if (cv) cv.value = wt.controlValve ?? '';
}

function handleChecklistRowClick(index) {
    if (!currentExperiment) return;
    collectBeforeFromUI();

    const items = currentExperiment.safetyChecklist.items;
    let firstUnchecked = items.findIndex(i => !i.checked);
    if (firstUnchecked === -1) firstUnchecked = items.length;

    if (index < firstUnchecked) {
        for (let i = index; i < items.length; i++) items[i].checked = false;
    } else {
        for (let i = 0; i <= index; i++) items[i].checked = true;
    }

    renderSafetyChecklist();
    updateChecklistProgress();
}

function updateChecklistProgress() {
    if (!currentExperiment) return;
    const items = currentExperiment.safetyChecklist.items;
    const done = items.filter(i => i.checked).length;
    const total = items.length;
    const pct = Math.round((done / total) * 100);

    const bar = document.getElementById('checklist-progress-bar');
    const text = document.getElementById('checklist-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `${done} / ${total} 항목 완료 (${pct}%)`;
}

// ── 데이터 수집 / 로드 ──────────────────────────────

function collectBeforeFromUI() {
    if (!currentExperiment) return;

    currentExperiment.before.expInfo = {
        name: document.getElementById('exp-name')?.value || '',
        date: document.getElementById('exp-date')?.value || '',
        testModel: document.getElementById('test-model')?.value || '',
        objective: document.getElementById('objective')?.value || '',
        targetMach: parseFloat(document.getElementById('target-mach')?.value) || null
    };
    currentExperiment.before.windTunnel = {
        airPressure: parseFloat(document.getElementById('air-pressure')?.value) || null,
        airTemp: parseFloat(document.getElementById('air-temp')?.value) || null,
        airHumidity: parseFloat(document.getElementById('air-humidity')?.value) || null,
        tankPressure: parseFloat(document.getElementById('tank-pressure')?.value) || null,
        controlValve: document.getElementById('control-valve')?.value || ''
    };
    currentExperiment.before.visualization = {
        method: document.getElementById('schlieren-method')?.value || '',
        target: document.getElementById('schlieren-target')?.value || ''
    };
    currentExperiment.before.camera = {
        model: document.getElementById('camera-model')?.value || '',
        fps: parseFloat(document.getElementById('camera-fps')?.value) || null,
        width: parseInt(document.getElementById('camera-width')?.value, 10) || null,
        height: parseInt(document.getElementById('camera-height')?.value, 10) || null,
        lensFocal: document.getElementById('lens-focal')?.value || '',
        exposure: document.getElementById('exposure')?.value || ''
    };

    const sc = currentExperiment.safetyChecklist;
    sc.tankPressure = currentExperiment.before.windTunnel.tankPressure;
    sc.controlValve = currentExperiment.before.windTunnel.controlValve;
    sc.notes = document.getElementById('checklist-notes')?.value || '';
}

function loadAllDataToUI() {
    if (!currentExperiment) return;
    const b = currentExperiment.before;
    const sc = currentExperiment.safetyChecklist;

    document.getElementById('exp-number').value = currentExperiment.expNumber || '';
    document.getElementById('exp-name').value = b.expInfo.name || '';
    document.getElementById('exp-date').value = b.expInfo.date || '';
    document.getElementById('test-model').value = b.expInfo.testModel || '';
    document.getElementById('objective').value = b.expInfo.objective || '';
    document.getElementById('target-mach').value = b.expInfo.targetMach ?? '';

    document.getElementById('air-pressure').value = b.windTunnel.airPressure ?? '';
    document.getElementById('air-temp').value = b.windTunnel.airTemp ?? '';
    document.getElementById('air-humidity').value = b.windTunnel.airHumidity ?? '';

    document.getElementById('schlieren-method').value = b.visualization.method || '';
    document.getElementById('schlieren-target').value = b.visualization.target || '';

    document.getElementById('camera-model').value = b.camera.model || '';
    document.getElementById('camera-fps').value = b.camera.fps ?? '';
    document.getElementById('camera-width').value = b.camera.width ?? '';
    document.getElementById('camera-height').value = b.camera.height ?? '';
    document.getElementById('lens-focal').value = b.camera.lensFocal || '';
    const exposure = b.camera.exposure ?? (
        b.camera.exposeTime != null || b.camera.exposeIndex != null
            ? [b.camera.exposeTime, b.camera.exposeIndex].filter(v => v != null && v !== '').join('/')
            : ''
    );
    document.getElementById('exposure').value = exposure;

    document.getElementById('checklist-notes').value = sc.notes ?? '';
}

async function saveExperimentData() {
    if (!currentExperiment) await createNewExperiment();
    collectBeforeFromUI();

    const done = currentExperiment.safetyChecklist.items.filter(i => i.checked).length;
    const total = currentExperiment.safetyChecklist.items.length;

    if (done < total) {
        if (!confirm(`${done}/${total} 항목만 체크되었습니다. 저장하시겠습니까?`)) return;
    }

    if (done === total) {
        currentExperiment.status = 'safety_complete';
        currentExperiment.safetyChecklist.completedAt = new Date().toISOString();
    } else if (currentExperiment.status === 'pending') {
        currentExperiment.status = 'before_complete';
    }

    try {
        const id = await saveExperiment(currentExperiment);
        if (!currentExperimentId) {
            currentExperimentId = id;
            currentExperiment.id = id;
        }
        alert(`✅ 저장 완료 (체크 ${done}/${total})`);
    } catch (e) {
        alert('❌ 저장 실패: ' + e.message);
    }
}

function resetSafetyChecklist() {
    if (!confirm('체크리스트만 초기화하시겠습니까? (입력값은 유지)')) return;
    if (!currentExperiment) return;
    currentExperiment.safetyChecklist.items.forEach(i => { i.checked = false; });
    currentExperiment.safetyChecklist.completedAt = null;
    renderSafetyChecklist();
    updateChecklistProgress();
}

function printSafetyChecklist() {
    window.print();
}

// ── 실험 목록 ──────────────────────────────

async function showExperimentList() {
    document.getElementById('experiment-list-modal').classList.add('active');
    await refreshExperimentList();
}

function closeExperimentList() {
    document.getElementById('experiment-list-modal').classList.remove('active');
}

async function refreshExperimentList() {
    const tbody = document.getElementById('experiments-tbody');
    tbody.innerHTML = '';

    try {
        const experiments = await loadAllExperiments();
        experiments.sort((a, b) => (b.expNumber || 0) - (a.expNumber || 0));

        experiments.forEach(exp => {
            const info = exp.before?.expInfo || {};
            const checked = exp.safetyChecklist?.items?.filter(i => i.checked).length ?? 0;
            const total = exp.safetyChecklist?.items?.length ?? 26;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${exp.expNumber}</td>
                <td>${info.date || '-'}</td>
                <td>${info.name || '-'}</td>
                <td>${info.testModel || '-'}</td>
                <td>${info.targetMach ?? '-'}</td>
                <td>${getStatusBadge(exp)}</td>
                <td>${checked}/${total}</td>
                <td class="action-btns">
                    <button class="action-btn" onclick="loadAndEditExperiment(${exp.id})">열기</button>
                    <button class="action-btn delete" onclick="confirmDeleteExperiment(${exp.id})">삭제</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8">목록을 불러오지 못했습니다.</td></tr>';
    }
}

function getStatusBadge(exp) {
    if (exp.status === 'safety_complete') return '<span class="status-badge complete">완료</span>';
    if (exp.status === 'before_complete') return '<span class="status-badge processing">입력 중</span>';
    return '<span class="status-badge pending">진행 중</span>';
}

async function loadAndEditExperiment(id) {
    await loadExperimentById(id);
    closeExperimentList();
    switchTab('experiment');
}

async function confirmDeleteExperiment(id) {
    if (!confirm('이 실험을 삭제하시겠습니까?')) return;
    await deleteExperiment(id);
    if (currentExperimentId === id) await createNewExperiment();
    await refreshExperimentList();
}

function filterExperiments() {
    const term = document.getElementById('search-experiments').value.toLowerCase();
    document.querySelectorAll('#experiments-tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
}

async function createNewExperimentFromUI() {
    if (currentExperiment && currentExperimentId) {
        if (!confirm('새 실험을 시작하시겠습니까? 저장하지 않은 변경사항은 사라집니다.')) return;
    }
    await createNewExperiment();
    document.getElementById('exp-date').valueAsDate = new Date();
    switchTab('experiment');
}
