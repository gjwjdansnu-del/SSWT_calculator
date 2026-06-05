# 🌬️ SSWT 실험 로거 (Supersonic Wind Tunnel Experiment Logger)

초음속 풍동(SSWT) 실험 데이터 관리 웹 애플리케이션

## 주요 기능 (v1.0.0)

### 🛡️ 가동 안전 체크리스트
- PDF 체크리스트 기반 25개 점검 항목
- 단계별 구분: 시험 전 / 압축 / 최종 확인 / 시험 / 종료
- 진행률 표시 및 인쇄 지원

### 📝 실험 전 정보 입력
`SSWT explist.xlsx` 1행 형식과 동일한 입력 필드:
- exp#, name, date, test model, Objective, Mach #
- air pressure/temperature/humidity, tank pressure, control valve
- Schlieren method/target, camera, FPS, W, H, lens focal length, Expose time/index

### 📋 실험 관리
- IndexedDB 로컬 저장
- 실험 목록 조회/검색/삭제
- 엑셀보내기/불러오기 (`SSWT explist.xlsx` 형식)

## 추후 구현 예정
- 데이터 후처리 (계측 데이터)
- 유동조건 계산 (Stage 1 물성치, p0_avg, T0_avg 등)

## 로컬 실행

```bash
cd SSWT_calculator
python -m http.server 8000
# http://localhost:8000/SSWT_Experiment_Logger/
```

## GitHub Pages

https://gjwjdansnu-del.github.io/SSWT_calculator/SSWT_Experiment_Logger/
