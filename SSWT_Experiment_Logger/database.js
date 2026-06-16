// ============================================
// SSWT 실험 데이터베이스 관리
// IndexedDB + LocalStorage 백업
// ============================================

const DB_NAME = 'SSWT_Experiments';
const DB_VERSION = 1;
const STORE_NAME = 'experiments';

const SAFETY_CHECKLIST_ITEMS = [
    { stage: '시험 전', label: '압축실 출입문 개방 및 작업 공간 환기' },
    { stage: '시험 전', label: '압축실 필터 배출구 3종 개방 후 응축수 배출' },
    { stage: '시험 전', label: '초음속 풍동 배기문 OPEN' },
    { stage: '시험 전', label: '시험부 주변 위험물·공구·케이블 정리' },
    { stage: '압축', label: '압축기 컨트롤 패널 키전원 ON' },
    { stage: '압축', label: '김규홍 교수님 풍동 스톱밸브 CLOSE 확인 (OPEN이면 유압전원 ON 후 CLOSE)' },
    { stage: '압축', label: 'T 분기 밸브 CLOSE' },
    { stage: '압축', label: '초음속 풍동 컨트롤 패널 키전원 ON' },
    { stage: '압축', label: '초음속 풍동 스톱밸브 CLOSE 확인' },
    { stage: '압축', label: '저압 압축기 ON → 고압 압축기 ON' },
    { stage: '압축', label: '목표 압력까지 대기' },
    { stage: '압축', label: '목표 압력 도달 후 저압 압축기 OFF → 고압 압축기 OFF' },
    { stage: '최종 확인', label: 'T 분기 밸브 OPEN' },
    { stage: '최종 확인', label: '탱크 압력 기록' },
    { stage: '최종 확인', label: '조절밸브 설정값 확인' },
    { stage: '최종 확인', label: '계측·가시화 시스템 준비 확인' },
    { stage: '최종 확인', label: '배기 출구에 반드시 인원 배치, 접근 통제' },
    { stage: '시험', label: '초고속 카메라 및 계측 트리거 ARM/ON' },
    { stage: '시험', label: '주변 인원 대피 및 시험 시작 구두 확인' },
    { stage: '시험', label: '스톱밸브 OPEN, 시험 시작' },
    { stage: '시험', label: '압력 완전 배출까지 대기' },
    { stage: '시험', label: '문제 발생 시 긴급정지 버튼 작동' },
    { stage: '종료', label: '잔압 및 여압 완전 해방' },
    { stage: '종료', label: '저압 압축기만 ON' },
    { stage: '종료', label: '컨트롤 패널 건조 점등 확인' },
    { stage: '종료', label: '30분 이상 건조 후 장비 OFF 및 주변 정리' }
];

let db = null;

async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('date', 'date', { unique: false });
                objectStore.createIndex('name', 'name', { unique: false });
                objectStore.createIndex('expNumber', 'expNumber', { unique: true });
                objectStore.createIndex('status', 'status', { unique: false });
            }
        };
    });
}

function createDefaultSafetyChecklist() {
    return {
        tankPressure: null,
        controlValve: '',
        items: SAFETY_CHECKLIST_ITEMS.map((item, index) => ({
            id: index,
            stage: item.stage,
            label: item.label,
            checked: false
        })),
        notes: '',
        completedAt: null
    };
}

function createExperimentData() {
    return {
        id: null,
        expNumber: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        before: {
            expInfo: {
                name: '',
                date: '',
                testModel: '',
                objective: '',
                targetMach: null
            },
            windTunnel: {
                airPressure: null,
                airTemp: null,
                airHumidity: null,
                tankPressure: null,
                controlValve: ''
            },
            visualization: {
                method: '',
                target: ''
            },
            camera: {
                model: '',
                fps: null,
                width: null,
                height: null,
                lensFocal: '',
                exposureTime: null,
                exposureIndex: null
            }
        },

        safetyChecklist: createDefaultSafetyChecklist(),

        // 후처리·유동조건 계산 (추후 구현)
        after: {
            testTimeLength: null,
            p0_avg: null,
            T0_avg: null
        },
        calculation: {
            stage1: null
        }
    };
}

async function saveExperiment(experimentData) {
    experimentData.updatedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        let request;
        if (experimentData.id) {
            request = objectStore.put(experimentData);
        } else {
            const copy = { ...experimentData };
            delete copy.id;
            request = objectStore.add(copy);
        }

        request.onsuccess = () => {
            backupToLocalStorage();
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

async function loadExperiment(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function loadAllExperiments() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteExperiment(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const request = transaction.objectStore(STORE_NAME).delete(id);
        request.onsuccess = () => {
            backupToLocalStorage();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

async function clearAllExperiments() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const request = transaction.objectStore(STORE_NAME).clear();
        request.onsuccess = () => {
            backupToLocalStorage();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

function backupToLocalStorage() {
    loadAllExperiments().then(experiments => {
        localStorage.setItem('sswt_experiments_backup', JSON.stringify(experiments));
        localStorage.setItem('sswt_backup_time', new Date().toISOString());
    });
}

async function getNextExpNumber() {
    const experiments = await loadAllExperiments();
    if (experiments.length === 0) return 1;
    const maxNum = experiments.reduce((max, exp) => Math.max(max, parseInt(exp.expNumber, 10) || 0), 0);
    return maxNum + 1;
}

async function getLastExperiment() {
    const experiments = await loadAllExperiments();
    if (experiments.length === 0) return null;
    experiments.sort((a, b) => (b.expNumber || 0) - (a.expNumber || 0));
    return experiments[0];
}
