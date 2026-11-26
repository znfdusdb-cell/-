-- =============================================================================
-- 10차 (2026-11-27, 팀장 지시서 swingbot_directive_2026-11-27 '봇 매수·퇴출 연동'). 추가만.
-- 연습 보유를 sb_positions(account='practice')에 기록하고, 진입 때 C 박스 하단을 남겨 종가 이탈(EX-5)을 판정한다.
-- 주문은 여전히 내지 않는다(sb_orders_log source='practice' 기록만). sb_stocks.stage 는 연습 때문에 바꾸지 않는다.
-- CD-1(sb_last_loss_day)·EN-7 평단은 account='kis_bot' 만 보므로 연습 포지션의 영향을 받지 않는다.
-- =============================================================================
alter type sb_account add value if not exists 'practice';

-- 감시 목록에 셋업의 C 박스 하단(sb_setups.cbox_low). 연습 매수 때 포지션 note.box_low 로 옮겨 적는다.
alter table sb_watchlist add column if not exists box_low numeric(14,2);
