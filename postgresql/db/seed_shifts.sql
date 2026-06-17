-- テスト/開発用 shift シード（shift-cards 検証のため）。
-- 同タスクで time_id が +1 連続するスロットを 1 枚のカードにまとめる。
-- time_id: id N = (N-1)*15 分。33=8:00, 37=9:00, 41=10:00。date 1/2/3=準備日/1日目/2日目。weather 1=晴れ。year 43。tasks 4/5/6=テスト1/2/3。
INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)
SELECT 4, 1, 43, 1, t, 1 FROM generate_series(33, 36) AS t
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=1 AND task_id=4);
INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)
SELECT 5, 1, 43, 1, t, 1 FROM generate_series(41, 44) AS t
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=1 AND task_id=5);
INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)
SELECT 4, 2, 43, 1, t, 1 FROM generate_series(32, 37) AS t
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=2 AND date_id=1 AND task_id=4);
INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)
SELECT 6, 1, 43, 2, t, 1 FROM generate_series(37, 40) AS t
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=2 AND task_id=6);
INSERT INTO shifts (task_id, user_id, year_id, date_id, time_id, weather_id)
SELECT 4, 1, 43, 3, t, 1 FROM generate_series(33, 34) AS t
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE user_id=1 AND date_id=3 AND task_id=4);
