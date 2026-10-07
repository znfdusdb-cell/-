-- 2차: 인증 매체 종류(촬영/앨범/녹음) + 오디오 업로드 허용
alter table ch_checkins add column if not exists media_type text not null default 'camera'
  check (media_type in ('camera', 'album', 'audio'));

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets
      set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/x-m4a'],
          file_size_limit = 12582912
      where id = 'ch-photos';
  end if;
end $$;

-- 관리자가 늦게 들어온 사람을 바로 시작시킬 때 쓰는 집계 시작일 덮어쓰기 (null 이면 월요일 규칙)
alter table ch_participations add column if not exists start_date date;
