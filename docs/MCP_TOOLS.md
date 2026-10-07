# bium-brain MCP 스윙봇 도구 계약서 (VPS 쪽 구현용)

근거: bium-brain research `swingbot_cc_request_2026-10-06_mcp_tools`. 이 저장소에서는 DB 함수까지 만들었고(6차 마이그레이션), 도구 자체는 VPS의 bium-brain `server.py`에 붙인다. 각 도구는 Supabase RPC 한 번이면 된다.

## 연결
VPS `.env`에 `SWINGBOT_SUPABASE_URL`, `SWINGBOT_SUPABASE_SERVICE_KEY`(bium4581 프로젝트 service_role). RPC: `POST {URL}/rest/v1/rpc/{함수}` 헤더 `apikey`, `Authorization: Bearer {key}`, 본문 JSON 인자. 읽기 함수는 `GET`도 된다.

## 읽기 도구 (Claude 바로 실행)
| 도구 | RPC | 인자 | 반환 |
|---|---|---|---|
| `sb_today` | `sb_today` | 없음 | 오늘 날짜, 시장 신호, 리스크 단계, 설정, 대기 제안, 오늘 할 일(승인 대기), 파이프라인 수, 14일 이벤트 |
| `sb_card` | `sb_card` | `p_code` | 종목·가설·셋업·포지션·스냅샷·이벤트·단계 이력·주문·현재가·실제 일봉 수 |
| `sb_setups` | `sb_setups_of` | `p_code`, `p_limit`=30 | 최근 셋업 N개 |
| `sb_orders` | `sb_orders_between` | `p_from`, `p_to` (date) | 기간 주문 |
| `sb_settings` | 테이블 `sb_settings` select | 없음 | key/value/decided_by/review_at |
| `sb_violations` | `sb_violations` | `p_days`=90 | 봇 자진 신고 + 근거 없는 주문. 완전 판정은 사이트 기록 화면 |
| `sb_risk_level` | `sb_risk_level` | 없음 | 현재 단계·오늘 일지·단계별 상한 |
| `sb_explain` | `sb_card` 호출 후 LLM 재서술 | `p_code` | 초등학생 수준 설명. 규칙: 숫자마다 뜻 한 문장, 용어는 `src/lib/constants.ts`의 `TERMS`(문턱·안전벨트·본전 기다리는 사람들·오르막·쉬는 곳·좁게 쉬는 칸·살 수 있는 목록·테니스공) 사용, 보유/매도 의견 금지, "다음에 일어나야 할 일" 한 문장으로 끝낸다 |

## 초안 도구 (결과는 항상 '비움 미승인')
| 도구 | RPC | 인자 | 거부 조건 |
|---|---|---|---|
| `sb_draft_thesis` | `sb_draft_thesis` | `p_code`, `p_hypothesis`, `p_conditions` `[{text, plain}]`, `p_plain`, `p_actor`='claude_code' | 조건이 배열 아님, 종목 없음 |
| `sb_add_radar` | `sb_add_radar` | `p_code`, `p_name`, `p_market` KOSPI/KOSDAQ, `p_sector`, `p_reason`, `p_actor`='brain' | 이유 비면 거부, 이미 있는 종목 거부 |

가설 초안은 `status='draft'`, `author='claude_code'`로 들어가고 비움이 사이트 '가설 승인' 버튼을 눌러야 유효해진다. UV-2는 draft를 인정하지 않는다.

## 제안 도구 (적용은 비움 사이트 승인 → 다음 거래일 08:30)
| 도구 | RPC | 인자 | 거부 조건 |
|---|---|---|---|
| `sb_propose_setting` | `sb_propose_setting` | `p_key`, `p_value`, `p_reason`, `p_evidence`, `p_plain` | 근거 비면 거부 |
| `sb_propose_rule` | `sb_propose_rule` | `p_rule_id`, `p_change`, `p_backtest_link`, `p_reason`, `p_plain` | 백테스트 링크 비면 거부, 규칙 없음 |
| `sb_propose_stage` | `sb_propose_stage` | `p_code`, `p_to`, `p_reason`, `p_plain` | 보유 단계 제안 거부(체결로만) |

제안은 `sb_proposals`에 `pending`으로 들어가고 사이트 '오늘 할 일' 맨 위에 뜬다. 비움이 승인하면 `sb_approve_proposal`이 `apply_at`=다음 거래일 08:30 KST를 찍고, 봇(또는 크론)이 08:30 이후 `sb_apply_due_proposals()`를 호출해 설정 제안을 적용한다. 변경은 `sb_settings_history`에 남는다. 규칙·단계 제안은 승인 후 사람이 처리하고 `applied`로 표시.

## 금지
주문 관련 도구는 만들지 않는다. `sb_orders_log`·`sb_positions`에 쓰는 함수는 없다. 대화로는 어떤 경로로도 주문이 나가지 않는다. 설정 적용은 장중 즉시 금지(08:30 함수만).

## 테스트 (claude.ai bium-brain 커넥터에서)
1. `sb_today` → `risk.level`, `pending_proposals`, `todos`가 보인다.
2. `sb_explain('005930')` → 삼성전자 카드를 쉬운 말로. "KB 수동 보유", "가설 미승인(10/8 후 승인)", "52주 데이터 부족"이 설명에 들어가야 한다.
3. `sb_propose_setting('regime_vkospi_reduce','22','...','')` → 근거 없음으로 거부돼야 한다.
4. `sb_draft_thesis('999901','...', [{"text":"...","plain":"..."}])` → draft 로 들어가고 사이트 검토 카드에 '가설 승인 대기'가 뜬다.

## 로컬 검증
이 저장소에서 로컬 Postgres 16에 1~6차 마이그레이션 + seed.sql을 넣고 위 함수를 전부 호출해 확인했다 (`20261007_06_mcp_functions.sql`).
