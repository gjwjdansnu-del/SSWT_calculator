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
        currentExperiment.before.expInfo.name = last.before.expInfo.name;
        currentExperiment.before.expInfo.testModel = last.before.expInfo.testModel;
        currentExperiment.before.expInfo.objective = last.before.expInfo.objective;
        currentExperiment.before.expInfo.targetMach = last.before.expInfo.targetMach;
        currentExperiment.before.windTunnel = { ...last.before.windTunnel };
        currentExperiment.before.visualization = { ...last.before.visualization };
        currentExperiment.before.camera = { ...last.before.camera };
    }

    loadBeforeDataToUI();
    loadSafetyChecklistToUI();
    renderSafetyChecklist();
    updateChecklistProgress();
}

async function loadExperimentById(id) {
    currentExperiment = await loadExperiment(id);
    currentExperimentId = id;
    loadBeforeDataToUI();
    loadSafetyChecklistToUI();
    renderSafetyChecklist();
    updateChecklistProgress();
}

// ── 안전 체크리스트 ──────────────────────────────

function renderSafetyChecklist() {
    const tbody = document.getElementById('checklist-tbody');
    if (!tbody || !currentExperiment) return;

    const items = currentExperiment.safetyChecklist.items;
    tbody.innerHTML = '';

    let lastStage = '';
    items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        if (item.stage !== lastStage) {
            lastStage = item.stage;
            tr.className = 'stage-divider-row';
            tr.innerHTML = `<td colspan="3" class="stage-divider" style="border-left-color:${STAGE_COLORS[item.stage] || '#58a6ff'}">${item.stage}</td>`;
            tbody.appendChild(tr);
        }

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
        tbody.appendChild(row);
    });
}

function handleChecklistRowClick(index) {
    if (!currentExperiment) return;
    const items = currentExperiment.safetyChecklist.items;
    let firstUnchecked = items.findIndex(i => !i.checked);
    if (firstUnchecked === -1) firstUnchecked = items.length;

    if (index < firstUnchecked) {
        // 이미 체크된 구간 클릭 → 해당 항목부터 아래 모두 해제
        for (let i = index; i < items.length; i++) items[i].checked = false;
    } else {
        // 미체크 구간 클릭 → 위부터 해당 항목까지 일괄 체크
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

function loadSafetyChecklistToUI() {
    if (!currentExperiment) return;
    const sc = currentExperiment.safetyChecklist;
    document.getElementById('chk-tank-pressure').value = sc.tankPressure ?? '';
    document.getElementById('chk-control-valve').value = sc.controlValve ?? '';
    document.getElementById('checklist-notes').value = sc.notes ?? '';
}

function collectSafetyChecklistFromUI() {
    if (!currentExperiment) return;
    const sc = currentExperiment.safetyChecklist;
    sc.tankPressure = parseFloat(document.getElementById('chk-tank-pressure').value) || null;
    sc.controlValve = document.getElementById('chk-control-valve').value;
    sc.notes = document.getElementById('checklist-notes').value;

    const allChecked = sc.items.every(i => i.checked);
    if (allChecked) sc.completedAt = new Date().toISOString();
}

async function saveSafetyChecklist() {
    if (!currentExperiment) await createNewExperiment();
    currentExperiment.before.expInfo.name = document.getElementById('exp-name').value || '';
    currentExperiment.before.expInfo.date = document.getElementById('exp-date').value || '';
    collectSafetyChecklistFromUI();

    const done = currentExperiment.safetyChecklist.items.filter(i => i.checked).length;
    const total = currentExperiment.safetyChecklist.items.length;

    if (done < total) {
        if (!confirm(`${done}/${total} 항목만 체크되었습니다. 저장하시겠습니까?`)) return;
    }

    if (done === total) currentExperiment.status = 'safety_complete';

    try {
        const id = await saveExperiment(currentExperiment);
        if (!currentExperimentId) {
            currentExperimentId = id;
            currentExperiment.id = id;
        }
        alert(`✅ 안전 체크리스트 저장 완료 (${done}/${total})`);
    } catch (e) {
        alert('❌ 저장 실패: ' + e.message);
    }
}

function resetSafetyChecklist() {
    if (!confirm('체크리스트를 초기화하시겠습니까?')) return;
    if (!currentExperiment) return;
    currentExperiment.safetyChecklist = createDefaultSafetyChecklist();
    loadSafetyChecklistToUI();
    renderSafetyChecklist();
    updateChecklistProgress();
}

function printSafetyChecklist() {
    window.print();
}

// ── 실험 전 정보 ──────────────────────────────

async function saveBeforeData() {
    if (!currentExperiment) await createNewExperiment();

    currentExperiment.before.expInfo = {
        name: document.getElementById('exp-name').value || document.getElementById('exp-name-sync')?.value || '',
        date: document.getElementById('exp-date').value || document.getElementById('exp-date-sync')?.value || '',
        testModel: document.getElementById('test-model').value,
        objective: document.getElementById('objective').value,
        targetMach: parseFloat(document.getElementById('target-mach').value) || null
    };
    currentExperiment.before.windTunnel = {
        airPressure: parseFloat(document.getElementById('air-pressure').value) || null,
        airTemp: parseFloat(document.getElementById('air-temp').value) || null,
        airHumidity: parseFloat(document.getElementById('air-humidity').value) || null,
        tankPressure: parseFloat(document.getElementById('tank-pressure').value) || null,
        controlValve: document.getElementById('control-valve').value
    };
    currentExperiment.before.visualization = {
        method: document.getElementById('schlieren-method').value,
        target: document.getElementById('schlieren-target').value
    };
    currentExperiment.before.camera = {
        model: document.getElementById('camera-model').value,
        fps: parseFloat(document.getElementById('camera-fps').value) || null,
        width: parseInt(document.getElementById('camera-width').value, 10) || null,
        height: parseInt(document.getElementById('camera-height').value, 10) || null,
        lensFocal: document.getElementById('lens-focal').value,
        exposeTime: parseFloat(document.getElementById('expose-time').value) || null,
        exposeIndex: parseFloat(document.getElementById('expose-index').value) || null
    };

    // 체크리스트 헤더 필드와 동기화
    currentExperiment.safetyChecklist.tankPressure = currentExperiment.before.windTunnel.tankPressure;
    currentExperiment.safetyChecklist.controlValve = currentExperiment.before.windTunnel.controlValve;
    document.getElementById('chk-tank-pressure').value = currentExperiment.before.windTunnel.tankPressure ?? '';
    document.getElementById('chk-control-valve').value = currentExperiment.before.windTunnel.controlValve ?? '';

    if (currentExperiment.status === 'pending') {
        currentExperiment.status = 'before_complete';
    }

    try {
        const id = await saveExperiment(currentExperiment);
        if (!currentExperimentId) {
            currentExperimentId = id;
            currentExperiment.id = id;
        }
        alert('✅ 실험 전 정보가 저장되었습니다.');
    } catch (e) {
        alert('❌ 저장 실패: ' + e.message);
    }
}

function loadBeforeDataToUI() {
    if (!currentExperiment) return;
    const b = currentExperiment.before;

    const expNum = currentExperiment.expNumber || '';
    const expName = b.expInfo.name || '';
    const expDate = b.expInfo.date || '';

    document.getElementById('exp-number').value = expNum;
    document.getElementById('exp-name').value = expName;
    document.getElementById('exp-date').value = expDate;

    const numBefore = document.getElementById('exp-number-before');
    const nameSync = document.getElementById('exp-name-sync');
    const dateSync = document.getElementById('exp-date-sync');
    if (numBefore) numBefore.value = expNum;
    if (nameSync) nameSync.value = expName;
    if (dateSync) dateSync.value = expDate;
    document.getElementById('test-model').value = b.expInfo.testModel || '';
    document.getElementById('objective').value = b.expInfo.objective || '';
    document.getElementById('target-mach').value = b.expInfo.targetMach ?? '';

    document.getElementById('air-pressure').value = b.windTunnel.airPressure ?? '';
    document.getElementById('air-temp').value = b.windTunnel.airTemp ?? '';
    document.getElementById('air-humidity').value = b.windTunnel.airHumidity ?? '';
    document.getElementById('tank-pressure').value = b.windTunnel.tankPressure ?? '';
    document.getElementById('control-valve').value = b.windTunnel.controlValve || '';

    document.getElementById('schlieren-method').value = b.visualization.method || '';
    document.getElementById('schlieren-target').value = b.visualization.target || '';

    document.getElementById('camera-model').value = b.camera.model || '';
    document.getElementById('camera-fps').value = b.camera.fps ?? '';
    document.getElementById('camera-width').value = b.camera.width ?? '';
    document.getElementById('camera-height').value = b.camera.height ?? '';
    document.getElementById('lens-focal').value = b.camera.lensFocal || '';
    document.getElementById('expose-time').value = b.camera.exposeTime ?? '';
    document.getElementById('expose-index').value = b.camera.exposeIndex ?? '';
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
            const row = document.createElement('tr');
            const info = exp.before?.expInfo || {};
            const checked = exp.safetyChecklist?.items?.filter(i => i.checked).length ?? 0;
            const total = exp.safetyChecklist?.items?.length ?? 25;

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
    if (exp.status === 'before_complete') return '<span class="status-badge complete">실험전 완료</span>';
    if (exp.status === 'safety_complete') return '<span class="status-badge processing">체크리스트 완료</span>';
    return '<span class="status-badge pending">진행 중</span>';
}

async function loadAndEditExperiment(id) {
    await loadExperimentById(id);
    closeExperimentList();
    switchTab('before');
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
    switchTab('before');
}
